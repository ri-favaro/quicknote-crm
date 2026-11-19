import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import {
  DockPanel,
  type PersistenceStatus,
  type TodoScope,
} from "./components/DockPanel";
import type { PipedriveDispatchState } from "./components/PipedriveBar";
import { DockRail, type DockTab } from "./components/DockRail";
import {
  deleteNote,
  deleteTodo,
  getActiveProfile,
  getDockState,
  hideDock,
  isTauriRuntime,
  listNotes,
  listTodos,
  onDockNewNote,
  onDockStateChanged,
  saveNoteDraft,
  searchPipedriveDeals,
  sendToPipedrive,
  setActiveProfile,
  setAlwaysOnTop,
  setDockEdge,
  setDockExpanded,
  toggleTodo,
  upsertTodo,
  type ActiveProfile,
  type DealSummary,
  type DockEdge,
  type DockState,
  type Note,
  type PipedriveSendType,
  type SetActiveProfileInput,
  type Todo,
} from "./lib/bridge";

const INITIAL_STATE: DockState = {
  edge: "right",
  expanded: false,
  alwaysOnTop: true,
  visible: true,
  shortcuts: {
    toggle: "Alt+Space",
    newNote: "Ctrl+Shift+N",
  },
};

const INITIAL_PROFILE: ActiveProfile = {
  authorId: "local-cs",
  authorName: "CS Local",
  hasToken: false,
  isConfigured: false,
};

const AUTOSAVE_DEBOUNCE_MS = 400;

export const DOCK_OPACITY_STORAGE_KEY = "quicknote:dock-opacity";
const DEFAULT_DOCK_OPACITY = 100;
const MIN_DOCK_OPACITY = 40;
const MAX_DOCK_OPACITY = 100;

function clampDockOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DOCK_OPACITY;
  return Math.min(MAX_DOCK_OPACITY, Math.max(MIN_DOCK_OPACITY, Math.round(value)));
}

function loadDockOpacity(): number {
  try {
    const raw = window.localStorage.getItem(DOCK_OPACITY_STORAGE_KEY);
    if (raw === null) return DEFAULT_DOCK_OPACITY;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampDockOpacity(parsed) : DEFAULT_DOCK_OPACITY;
  } catch {
    return DEFAULT_DOCK_OPACITY;
  }
}

function createDraftNote(profile: ActiveProfile): Note {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    authorId: profile.authorId,
    authorName: profile.authorName,
    title: "",
    contentMd: "",
    pipedriveDealId: null,
    pipedrivePersonId: null,
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
  };
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function App() {
  const initialNoteRef = useRef<Note | null>(null);
  if (!initialNoteRef.current) {
    initialNoteRef.current = createDraftNote(INITIAL_PROFILE);
  }

  const [dock, setDock] = useState<DockState>(INITIAL_STATE);
  const [activeTab, setActiveTab] = useState<DockTab>("notes");
  const [notes, setNotes] = useState<Note[]>(() => [initialNoteRef.current!]);
  const [activeNoteId, setActiveNoteId] = useState<string>(
    () => initialNoteRef.current!.id
  );
  const [todos, setTodos] = useState<Todo[]>([]);
  const [todoDraft, setTodoDraft] = useState("");
  const [todoDueDate, setTodoDueDate] = useState("");
  const [todoScope, setTodoScope] = useState<TodoScope>("all");
  const [profile, setProfile] = useState<ActiveProfile>(INITIAL_PROFILE);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>({
    kind: "idle",
  });
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [dockOpacity, setDockOpacity] = useState<number>(loadDockOpacity);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null
  );
  const [dealLabelsById, setDealLabelsById] = useState<
    Record<number, DealSummary>
  >({});
  const [pipedriveDispatchByNote, setPipedriveDispatchByNote] = useState<
    Record<string, PipedriveDispatchState>
  >({});

  const noteBodyRef = useRef<HTMLTextAreaElement>(null);
  const stateVersionRef = useRef(0);
  const notesRef = useRef<Note[]>(notes);
  notesRef.current = notes;
  const activeNoteIdRef = useRef<string>(activeNoteId);
  activeNoteIdRef.current = activeNoteId;
  const profileRef = useRef<ActiveProfile>(profile);
  profileRef.current = profile;
  const todoDraftRef = useRef<string>(todoDraft);
  todoDraftRef.current = todoDraft;
  const todoDueDateRef = useRef<string>(todoDueDate);
  todoDueDateRef.current = todoDueDate;

  const persistedNoteIdsRef = useRef<Set<string>>(new Set());
  const noteRevRef = useRef<Map<string, number>>(new Map());
  const lastSavedRevRef = useRef<Map<string, number>>(new Map());
  const deletedNoteIdsRef = useRef<Set<string>>(new Set());
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const inFlightSavesRef = useRef<Map<string, Promise<Note | null>>>(new Map());
  const userEditedNotesRef = useRef(false);
  const userEditedProfileRef = useRef(false);
  const userEditedTodosRef = useRef(false);
  const isMountedRef = useRef(true);

  const focusNoteBody = useCallback(() => {
    setTimeout(() => {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
      ) {
        return;
      }
      noteBodyRef.current?.focus();
    }, 40);
  }, []);

  const hasPendingSave = useCallback((id: string): boolean => {
    if (saveTimersRef.current.has(id)) return true;
    const rev = noteRevRef.current.get(id) ?? 0;
    const savedRev = lastSavedRevRef.current.get(id) ?? 0;
    return rev !== savedRev;
  }, []);

  const persistNoteById = useCallback(
    async (
      id: string,
      options?: { force?: boolean }
    ): Promise<Note | null> => {
      const timer = saveTimersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        saveTimersRef.current.delete(id);
      }

      if (deletedNoteIdsRef.current.has(id)) {
        return null;
      }

      const existingFlight = inFlightSavesRef.current.get(id);
      if (existingFlight) {
        const awaited = await existingFlight;
        const rev = noteRevRef.current.get(id) ?? 0;
        const savedRev = lastSavedRevRef.current.get(id) ?? 0;
        const alreadyPersisted = persistedNoteIdsRef.current.has(id);
        if (
          rev === savedRev &&
          (alreadyPersisted || !options?.force)
        ) {
          return awaited;
        }
      }

      const runSave = async (): Promise<Note | null> => {
        while (true) {
          if (deletedNoteIdsRef.current.has(id)) {
            return null;
          }

          const currentNote = notesRef.current.find((n) => n.id === id);
          if (!currentNote) return null;

          const isPersisted = persistedNoteIdsRef.current.has(id);
          const hasContent =
            currentNote.title.trim().length > 0 ||
            currentNote.contentMd.trim().length > 0 ||
            currentNote.pipedriveDealId !== null;
          if (!isPersisted && !hasContent && !options?.force) {
            return null;
          }

          const revAtStart = noteRevRef.current.get(id) ?? 0;
          if (isMountedRef.current) {
            setPersistenceStatus({ kind: "saving" });
          }

          try {
            const saved = await saveNoteDraft({
              id: currentNote.id,
              title: currentNote.title,
              contentMd: currentNote.contentMd,
              pipedriveDealId: currentNote.pipedriveDealId,
              pipedrivePersonId: currentNote.pipedrivePersonId,
            });
            persistedNoteIdsRef.current.add(saved.id);
            lastSavedRevRef.current.set(id, revAtStart);

            if (deletedNoteIdsRef.current.has(id)) {
              return null;
            }

            const latestRev = noteRevRef.current.get(id) ?? 0;
            if (isMountedRef.current) {
              setNotes((prev) => {
                const next = prev.map((item) => {
                  if (item.id !== id) return item;
                  if (latestRev === revAtStart) {
                    return saved;
                  }
                  return {
                    ...item,
                    authorId: saved.authorId,
                    authorName: saved.authorName,
                    createdAt: saved.createdAt,
                    updatedAt: saved.updatedAt,
                    syncedAt: saved.syncedAt,
                  };
                });
                notesRef.current = next;
                return next;
              });
            }

            if (latestRev === revAtStart) {
              if (isMountedRef.current) {
                setPersistenceStatus({ kind: "saved", at: saved.updatedAt });
              }
              return saved;
            }
          } catch (err) {
            if (isMountedRef.current) {
              setPersistenceStatus({
                kind: "error",
                message: toErrorMessage(err),
              });
            }
            return null;
          }
        }
      };

      const promise = runSave().finally(() => {
        if (inFlightSavesRef.current.get(id) === promise) {
          inFlightSavesRef.current.delete(id);
        }
      });
      inFlightSavesRef.current.set(id, promise);
      return promise;
    },
    []
  );

  const flushPendingSaves = useCallback(async () => {
    const pendingIds = new Set<string>(saveTimersRef.current.keys());
    for (const note of notesRef.current) {
      if (hasPendingSave(note.id)) {
        pendingIds.add(note.id);
      }
    }
    if (pendingIds.size === 0) return;
    await Promise.all(
      Array.from(pendingIds).map((id) => persistNoteById(id))
    );
  }, [hasPendingSave, persistNoteById]);

  const handleExpand = useCallback(
    async (expanded: boolean) => {
      if (!expanded) {
        await flushPendingSaves();
      }
      try {
        stateVersionRef.current += 1;
        const next = await setDockExpanded(expanded);
        setDock(next);
        setStatusNotice(null);
      } catch (err) {
        setStatusNotice(String(err));
      }
    },
    [flushPendingSaves]
  );

  const handleSelectEdge = useCallback(async (edge: DockEdge) => {
    setContextMenu(null);
    try {
      stateVersionRef.current += 1;
      const next = await setDockEdge(edge);
      setDock(next);
      setStatusNotice(null);
    } catch (err) {
      setStatusNotice(String(err));
    }
  }, []);

  const handleTogglePin = useCallback(async () => {
    try {
      stateVersionRef.current += 1;
      const next = await setAlwaysOnTop(!dock.alwaysOnTop);
      setDock(next);
      setStatusNotice(null);
    } catch (err) {
      setStatusNotice(String(err));
    }
  }, [dock.alwaysOnTop]);

  const handleHide = useCallback(async () => {
    setContextMenu(null);
    await flushPendingSaves();
    await hideDock();
  }, [flushPendingSaves]);

  const handleOpacityChange = useCallback((nextOpacity: number) => {
    const clamped = clampDockOpacity(nextOpacity);
    setDockOpacity(clamped);
    try {
      window.localStorage.setItem(DOCK_OPACITY_STORAGE_KEY, String(clamped));
    } catch {
      // Ignora falhas de armazenamento local em ambientes restritos
    }
  }, []);

  const handleSelectNote = useCallback(
    (nextId: string) => {
      const prevId = activeNoteIdRef.current;
      if (prevId && prevId !== nextId && hasPendingSave(prevId)) {
        void persistNoteById(prevId);
      }
      activeNoteIdRef.current = nextId;
      setActiveNoteId(nextId);
    },
    [hasPendingSave, persistNoteById]
  );

  const handleNewNote = useCallback(async () => {
    userEditedNotesRef.current = true;
    const currentId = activeNoteIdRef.current;
    const active = notesRef.current.find((n) => n.id === currentId);

    if (!active || active.title.trim() || active.contentMd.trim()) {
      if (active && hasPendingSave(active.id)) {
        void persistNoteById(active.id);
      }
      const fresh = createDraftNote(profileRef.current);
      const nextNotes = [fresh, ...notesRef.current];
      notesRef.current = nextNotes;
      setNotes(nextNotes);
      activeNoteIdRef.current = fresh.id;
      setActiveNoteId(fresh.id);
    }

    setActiveTab("notes");
    if (!dock.expanded) {
      await handleExpand(true);
    }
    focusNoteBody();
  }, [dock.expanded, focusNoteBody, handleExpand, hasPendingSave, persistNoteById]);

  const handleSelectTab = useCallback(
    async (tab: DockTab) => {
      setContextMenu(null);
      if (dock.expanded && activeTab === tab) {
        await handleExpand(false);
        return;
      }
      setActiveTab(tab);
      if (!dock.expanded) {
        await handleExpand(true);
      }
      if (tab === "notes") {
        focusNoteBody();
      }
    },
    [activeTab, dock.expanded, focusNoteBody, handleExpand]
  );

  const handleRailContextMenu = useCallback(
    async (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      if (!dock.expanded) {
        setActiveTab("settings");
        await handleExpand(true);
        return;
      }
      const x = Math.min(event.clientX, window.innerWidth - 176);
      const y = Math.min(event.clientY, window.innerHeight - 196);
      setContextMenu({ x: Math.max(8, x), y: Math.max(8, y) });
    },
    [dock.expanded, handleExpand]
  );

  const handleNewNoteRef = useRef(handleNewNote);
  handleNewNoteRef.current = handleNewNote;

  useEffect(() => {
    let active = true;
    isMountedRef.current = true;
    const initialVersion = stateVersionRef.current;

    Promise.allSettled([
      getDockState(),
      listNotes(),
      listTodos(),
      getActiveProfile(),
    ]).then(([dockRes, notesRes, todosRes, profileRes]) => {
      if (!active) return;

      if (
        dockRes.status === "fulfilled" &&
        stateVersionRef.current === initialVersion
      ) {
        setDock(dockRes.value);
      }

      const loadedProfile =
        profileRes.status === "fulfilled" &&
        profileRes.value &&
        typeof profileRes.value.authorId === "string"
          ? profileRes.value
          : null;

      if (loadedProfile && !userEditedProfileRef.current) {
        profileRef.current = loadedProfile;
        setProfile(loadedProfile);
      }

      if (notesRes.status === "fulfilled" && Array.isArray(notesRes.value)) {
        const loadedNotes = notesRes.value;
        for (const n of loadedNotes) {
          persistedNoteIdsRef.current.add(n.id);
          if (!noteRevRef.current.has(n.id)) noteRevRef.current.set(n.id, 0);
          if (!lastSavedRevRef.current.has(n.id)) {
            lastSavedRevRef.current.set(n.id, 0);
          }
        }

        if (loadedNotes.length > 0) {
          if (!userEditedNotesRef.current) {
            notesRef.current = loadedNotes;
            setNotes(loadedNotes);
            activeNoteIdRef.current = loadedNotes[0].id;
            setActiveNoteId(loadedNotes[0].id);
          } else {
            setNotes((prev) => {
              const existingIds = new Set(prev.map((n) => n.id));
              const merged = [
                ...prev,
                ...loadedNotes.filter(
                  (n) =>
                    !existingIds.has(n.id) && !deletedNoteIdsRef.current.has(n.id)
                ),
              ];
              notesRef.current = merged;
              return merged;
            });
          }
        } else if (!userEditedNotesRef.current && loadedProfile) {
          setNotes((prev) => {
            const next = prev.map((n) =>
              n.authorId === "local-cs" && !persistedNoteIdsRef.current.has(n.id)
                ? {
                    ...n,
                    authorId: loadedProfile.authorId,
                    authorName: loadedProfile.authorName,
                  }
                : n
            );
            notesRef.current = next;
            return next;
          });
        }
      }

      if (todosRes.status === "fulfilled" && Array.isArray(todosRes.value)) {
        const loadedTodos = todosRes.value;
        if (!userEditedTodosRef.current) {
          setTodos(loadedTodos);
        } else {
          setTodos((prev) => {
            const existingIds = new Set(prev.map((t) => t.id));
            return [
              ...prev,
              ...loadedTodos.filter((t) => !existingIds.has(t.id)),
            ];
          });
        }
      }
    });

    let unlistenNewNote: (() => void) | undefined;
    let unlistenState: (() => void) | undefined;

    onDockNewNote(() => {
      void handleNewNoteRef.current();
    }).then((fn) => {
      if (!active) {
        fn();
        return;
      }
      unlistenNewNote = fn;
    });

    onDockStateChanged((state) => {
      if (!active) return;
      stateVersionRef.current += 1;
      setDock(state);
    }).then((fn) => {
      if (!active) {
        fn();
        return;
      }
      unlistenState = fn;
    });

    return () => {
      active = false;
      isMountedRef.current = false;
      for (const timer of saveTimersRef.current.values()) {
        clearTimeout(timer);
      }
      saveTimersRef.current.clear();
      unlistenNewNote?.();
      unlistenState?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (contextMenu) {
          setContextMenu(null);
        } else if (dock.expanded) {
          void handleExpand(false);
        }
      }
    };
    const onGlobalClick = () => {
      if (contextMenu) setContextMenu(null);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("click", onGlobalClick);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("click", onGlobalClick);
    };
  }, [contextMenu, dock.expanded, handleExpand]);

  const handleUpdateNote = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<Note, "title" | "contentMd" | "pipedriveDealId" | "pipedrivePersonId">
      >
    ) => {
      userEditedNotesRef.current = true;
      const nextRev = (noteRevRef.current.get(id) ?? 0) + 1;
      noteRevRef.current.set(id, nextRev);

      const now = new Date().toISOString();
      let updatedNote: Note | undefined;
      const nextNotes = notesRef.current.map((note) => {
        if (note.id !== id) return note;
        updatedNote = { ...note, ...patch, updatedAt: now };
        return updatedNote;
      });
      notesRef.current = nextNotes;
      setNotes(nextNotes);

      const existingTimer = saveTimersRef.current.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
        saveTimersRef.current.delete(id);
      }

      if (!updatedNote) return;

      const isPersisted = persistedNoteIdsRef.current.has(id);
      const hasContent =
        updatedNote.title.trim().length > 0 ||
        updatedNote.contentMd.trim().length > 0 ||
        updatedNote.pipedriveDealId !== null;
      if (!isPersisted && !hasContent) {
        lastSavedRevRef.current.set(id, nextRev);
        setPersistenceStatus({ kind: "idle" });
        return;
      }

      setPersistenceStatus({ kind: "saving" });
      const timer = setTimeout(() => {
        saveTimersRef.current.delete(id);
        void persistNoteById(id);
      }, AUTOSAVE_DEBOUNCE_MS);
      saveTimersRef.current.set(id, timer);
    },
    [persistNoteById]
  );

  const handleDeleteNote = useCallback(async (id: string) => {
    userEditedNotesRef.current = true;
    deletedNoteIdsRef.current.add(id);

    const timer = saveTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      saveTimersRef.current.delete(id);
    }

    const wasPersisted = persistedNoteIdsRef.current.has(id);
    const inFlight = inFlightSavesRef.current.get(id);

    const remaining = notesRef.current.filter((n) => n.id !== id);
    const nextNotes =
      remaining.length > 0 ? remaining : [createDraftNote(profileRef.current)];
    notesRef.current = nextNotes;
    setNotes(nextNotes);

    if (activeNoteIdRef.current === id) {
      const fallbackId = nextNotes[0].id;
      activeNoteIdRef.current = fallbackId;
      setActiveNoteId(fallbackId);
    }

    setTodos((prev) => prev.filter((todo) => todo.noteId !== id));

    try {
      if (inFlight) {
        await inFlight;
      }
      if (wasPersisted || persistedNoteIdsRef.current.has(id)) {
        await deleteNote(id);
        persistedNoteIdsRef.current.delete(id);
      }
      if (isMountedRef.current) {
        setPersistenceStatus({ kind: "saved", at: new Date().toISOString() });
      }
    } catch (err) {
      if (isMountedRef.current) {
        setPersistenceStatus({ kind: "error", message: toErrorMessage(err) });
      }
    }
  }, []);

  const handleRetrySave = useCallback(() => {
    const id = activeNoteIdRef.current;
    if (!id) return;
    void persistNoteById(id, { force: true });
  }, [persistNoteById]);

  const handleAddTodo = useCallback(
    async (
      event: FormEvent,
      options?: { text?: string; dueDate?: string }
    ): Promise<boolean> => {
      event.preventDefault();
      const isInlineFromNotes = options?.text !== undefined;
      const rawText = options?.text ?? todoDraftRef.current;
      const text = rawText.trim();
      if (!text) return false;

      const rawDueDate = isInlineFromNotes
        ? (options?.dueDate ?? "")
        : (options?.dueDate ?? todoDueDateRef.current);
      const dueDate = rawDueDate.trim() || null;

      userEditedTodosRef.current = true;
      userEditedNotesRef.current = true;

      if (!isInlineFromNotes) {
        todoDraftRef.current = "";
        setTodoDraft("");
        todoDueDateRef.current = "";
        setTodoDueDate("");
      }

      let targetNoteId = activeNoteIdRef.current;
      if (!notesRef.current.some((n) => n.id === targetNoteId)) {
        const fresh = createDraftNote(profileRef.current);
        targetNoteId = fresh.id;
        const nextNotes = [fresh, ...notesRef.current];
        notesRef.current = nextNotes;
        setNotes(nextNotes);
        activeNoteIdRef.current = fresh.id;
        setActiveNoteId(fresh.id);
      }

      try {
        if (!persistedNoteIdsRef.current.has(targetNoteId)) {
          const savedParent = await persistNoteById(targetNoteId, { force: true });
          if (!savedParent) {
            if (!isInlineFromNotes && todoDraftRef.current === "") {
              todoDraftRef.current = rawText;
              setTodoDraft(rawText);
              todoDueDateRef.current = rawDueDate;
              setTodoDueDate(rawDueDate);
            }
            return false;
          }
        }

        const created = await upsertTodo({
          noteId: targetNoteId,
          text,
          done: false,
          dueDate,
        });

        if (isMountedRef.current) {
          setTodos((prev) => [created, ...prev]);
          setPersistenceStatus({ kind: "saved", at: new Date().toISOString() });
        }
        return true;
      } catch (err) {
        if (isMountedRef.current) {
          if (!isInlineFromNotes && todoDraftRef.current === "") {
            todoDraftRef.current = rawText;
            setTodoDraft(rawText);
            todoDueDateRef.current = rawDueDate;
            setTodoDueDate(rawDueDate);
          }
          setPersistenceStatus({ kind: "error", message: toErrorMessage(err) });
        }
        return false;
      }
    },
    [persistNoteById]
  );

  const handleToggleTodo = useCallback(async (id: string) => {
    userEditedTodosRef.current = true;
    try {
      const updated = await toggleTodo(id);
      if (isMountedRef.current) {
        setTodos((prev) =>
          prev.map((todo) => (todo.id === id ? updated : todo))
        );
        setPersistenceStatus({ kind: "saved", at: new Date().toISOString() });
      }
    } catch (err) {
      if (isMountedRef.current) {
        setPersistenceStatus({ kind: "error", message: toErrorMessage(err) });
      }
    }
  }, []);

  const handleRemoveTodo = useCallback(async (id: string) => {
    userEditedTodosRef.current = true;
    try {
      await deleteTodo(id);
      if (isMountedRef.current) {
        setTodos((prev) => prev.filter((todo) => todo.id !== id));
        setPersistenceStatus({ kind: "saved", at: new Date().toISOString() });
      }
    } catch (err) {
      if (isMountedRef.current) {
        setPersistenceStatus({ kind: "error", message: toErrorMessage(err) });
      }
    }
  }, []);

  const handleOpenNoteFromTodo = useCallback(
    (noteId: string) => {
      if (notesRef.current.some((n) => n.id === noteId)) {
        handleSelectNote(noteId);
        setActiveTab("notes");
        focusNoteBody();
      }
    },
    [focusNoteBody, handleSelectNote]
  );

  const handleSaveProfile = useCallback(async (input: SetActiveProfileInput) => {
    userEditedProfileRef.current = true;
    const saved = await setActiveProfile(input);
    profileRef.current = saved;
    if (isMountedRef.current) {
      setProfile(saved);
      setNotes((prev) => {
        const next = prev.map((n) =>
          n.authorId === "local-cs"
            ? { ...n, authorId: saved.authorId, authorName: saved.authorName }
            : n
        );
        notesRef.current = next;
        return next;
      });
    }
  }, []);

  const pendingTodos = todos.filter((t) => !t.done).length;

  const edgeShellClass =
    dock.edge === "right"
      ? "flex-row rounded-l-[22px] rounded-r-none border-y border-l"
      : dock.edge === "left"
        ? "flex-row rounded-r-[22px] rounded-l-none border-y border-r"
        : "flex-col rounded-b-[22px] rounded-t-none border-x border-b";

  const railNode = (
    <DockRail
      edge={dock.edge}
      expanded={dock.expanded}
      activeTab={activeTab}
      pendingTodos={pendingTodos}
      onSelectTab={handleSelectTab}
      onNewNote={handleNewNote}
      onContextMenu={handleRailContextMenu}
    />
  );

  const handleSelectPipedriveDeal = useCallback(
    (noteId: string, deal: DealSummary | null) => {
      if (deal) {
        setDealLabelsById((prev) => ({ ...prev, [deal.id]: deal }));
      }
      handleUpdateNote(noteId, { pipedriveDealId: deal ? deal.id : null });
      setPipedriveDispatchByNote((prev) => ({
        ...prev,
        [noteId]: { kind: "idle" },
      }));
    },
    [handleUpdateNote]
  );

  const handleSendToPipedrive = useCallback(
    async (type: PipedriveSendType, todoId?: string) => {
      const targetNoteId = activeNoteIdRef.current;
      const currentNote = notesRef.current.find((n) => n.id === targetNoteId);
      if (!currentNote || currentNote.pipedriveDealId === null) {
        return;
      }

      setPipedriveDispatchByNote((prev) => ({
        ...prev,
        [targetNoteId]: { kind: "sending", type, todoId },
      }));

      try {
        const saved = await persistNoteById(targetNoteId, { force: true });
        const dealId = saved?.pipedriveDealId ?? currentNote.pipedriveDealId;
        if (!dealId) {
          throw new Error("Vincule um negócio do Pipedrive antes de enviar.");
        }

        const result = await sendToPipedrive({
          noteId: targetNoteId,
          type,
          dealId,
          todoId,
        });

        if (type === "activity") {
          const refreshedTodos = await listTodos();
          if (isMountedRef.current) {
            setTodos(refreshedTodos);
          }
        }

        if (!isMountedRef.current) return;
        setPipedriveDispatchByNote((prev) => ({
          ...prev,
          [targetNoteId]:
            result.status === "sent"
              ? { kind: "sent", type, message: result.message }
              : { kind: "error", type, todoId, message: result.message },
        }));
      } catch (err) {
        if (!isMountedRef.current) return;
        setPipedriveDispatchByNote((prev) => ({
          ...prev,
          [targetNoteId]: {
            kind: "error",
            type,
            todoId,
            message: toErrorMessage(err),
          },
        }));
      }
    },
    [persistNoteById]
  );

  const activeNoteObj = notes.find((n) => n.id === activeNoteId) ?? notes[0];
  const activeLinkedDeal =
    activeNoteObj?.pipedriveDealId != null
      ? (dealLabelsById[activeNoteObj.pipedriveDealId] ?? null)
      : null;
  const activePipedriveDispatch: PipedriveDispatchState = activeNoteObj
    ? (pipedriveDispatchByNote[activeNoteObj.id] ?? { kind: "idle" })
    : { kind: "idle" };

  const panelNode = dock.expanded ? (
    <DockPanel
      dock={dock}
      activeTab={activeTab}
      notes={notes}
      activeNoteId={activeNoteId}
      todos={todos}
      todoDraft={todoDraft}
      todoDueDate={todoDueDate}
      todoScope={todoScope}
      profile={profile}
      persistenceStatus={persistenceStatus}
      statusNotice={statusNotice}
      dockOpacity={dockOpacity}
      noteBodyRef={noteBodyRef}
      onSelectEdge={handleSelectEdge}
      onTogglePin={handleTogglePin}
      onOpacityChange={handleOpacityChange}
      onCollapse={() => void handleExpand(false)}
      onHide={() => void handleHide()}
      onSelectNote={handleSelectNote}
      onUpdateNote={handleUpdateNote}
      onNewNote={() => void handleNewNote()}
      onDeleteNote={(id) => void handleDeleteNote(id)}
      onRetrySave={handleRetrySave}
      onTodoDraftChange={setTodoDraft}
      onTodoDueDateChange={setTodoDueDate}
      onTodoScopeChange={setTodoScope}
      onAddTodo={handleAddTodo}
      onToggleTodo={(id) => void handleToggleTodo(id)}
      onRemoveTodo={(id) => void handleRemoveTodo(id)}
      onOpenNoteFromTodo={handleOpenNoteFromTodo}
      linkedDeal={activeLinkedDeal}
      pipedriveDispatch={activePipedriveDispatch}
      onSearchPipedriveDeals={searchPipedriveDeals}
      onSelectPipedriveDeal={handleSelectPipedriveDeal}
      onSendToPipedrive={(type, todoId) =>
        void handleSendToPipedrive(type, todoId)
      }
      onSaveProfile={handleSaveProfile}
      onOpenSettings={() => setActiveTab("settings")}
    />
  ) : null;

  const shell = (
    <div
      style={{ opacity: dockOpacity / 100 }}
      className={`relative flex h-full w-full overflow-hidden border-border bg-background transition-opacity duration-150 ${edgeShellClass}`}
    >
      {dock.edge === "right" ? (
        <>
          {panelNode}
          {railNode}
        </>
      ) : (
        <>
          {railNode}
          {panelNode}
        </>
      )}

      {contextMenu && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 w-42 rounded-[14px] border border-border bg-popover p-1.5 text-foreground shadow-xl"
        >
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Posição do dock
          </div>
          {(["right", "left", "top"] as DockEdge[]).map((edge) => (
            <button
              key={edge}
              type="button"
              onClick={() => void handleSelectEdge(edge)}
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer ${
                dock.edge === edge
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground/90 hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span>
                {edge === "right"
                  ? "Direita"
                  : edge === "left"
                    ? "Esquerda"
                    : "Topo"}
              </span>
              {dock.edge === edge && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => {
              setContextMenu(null);
              void handleExpand(false);
            }}
            className="w-full rounded-lg px-2 py-1.5 text-left text-[12px] text-foreground/85 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            Recolher barra
          </button>
          <button
            type="button"
            onClick={() => void handleHide()}
            className="w-full rounded-lg px-2 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            Ocultar para bandeja
          </button>
        </div>
      )}
    </div>
  );

  if (!isTauriRuntime()) {
    const previewSize =
      dock.edge === "top"
        ? dock.expanded
          ? "h-[500px] w-[420px] top-0 left-1/2 -translate-x-1/2"
          : "h-[56px] w-[236px] top-0 left-1/2 -translate-x-1/2"
        : dock.expanded
          ? dock.edge === "right"
            ? "h-[540px] w-[404px] right-0 top-1/2 -translate-y-1/2"
            : "h-[540px] w-[404px] left-0 top-1/2 -translate-y-1/2"
          : dock.edge === "right"
            ? "h-[236px] w-[56px] right-0 top-1/2 -translate-y-1/2"
            : "h-[236px] w-[56px] left-0 top-1/2 -translate-y-1/2";

    return (
      <div className="relative h-screen w-screen bg-[#090B0F]">
        <div className={`fixed ${previewSize}`}>{shell}</div>
      </div>
    );
  }

  return shell;
}
