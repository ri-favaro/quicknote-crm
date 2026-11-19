import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { DockPanel, type SessionNote, type SessionTodo } from "./components/DockPanel";
import { DockRail, type DockTab } from "./components/DockRail";
import {
  getDockState,
  hideDock,
  isTauriRuntime,
  onDockNewNote,
  onDockStateChanged,
  setAlwaysOnTop,
  setDockEdge,
  setDockExpanded,
  type DockEdge,
  type DockState,
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

function createNote(): SessionNote {
  return {
    id: crypto.randomUUID(),
    title: "",
    body: "",
    updatedAt: new Date().toISOString(),
  };
}

export default function App() {
  const [dock, setDock] = useState<DockState>(INITIAL_STATE);
  const [activeTab, setActiveTab] = useState<DockTab>("notes");
  const [notes, setNotes] = useState<SessionNote[]>(() => [createNote()]);
  const [activeNoteId, setActiveNoteId] = useState<string>(() => notes[0].id);
  const [todos, setTodos] = useState<SessionTodo[]>([]);
  const [todoDraft, setTodoDraft] = useState("");
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const noteBodyRef = useRef<HTMLTextAreaElement>(null);
  const stateVersionRef = useRef(0);

  const focusNoteBody = useCallback(() => {
    setTimeout(() => noteBodyRef.current?.focus(), 40);
  }, []);

  const handleExpand = useCallback(async (expanded: boolean) => {
    try {
      stateVersionRef.current += 1;
      const next = await setDockExpanded(expanded);
      setDock(next);
      setStatusNotice(null);
    } catch (err) {
      setStatusNotice(String(err));
    }
  }, []);

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
    await hideDock();
  }, []);

  const handleNewNote = useCallback(async () => {
    const active = notes.find((n) => n.id === activeNoteId);
    if (!active || active.title.trim() || active.body.trim()) {
      const fresh = createNote();
      setNotes((prev) => [fresh, ...prev]);
      setActiveNoteId(fresh.id);
    }
    setActiveTab("notes");
    if (!dock.expanded) {
      await handleExpand(true);
    }
    focusNoteBody();
  }, [activeNoteId, dock.expanded, focusNoteBody, handleExpand, notes]);

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
    const initialVersion = stateVersionRef.current;
    getDockState()
      .then((state) => {
        if (active && stateVersionRef.current === initialVersion) setDock(state);
      })
      .catch(() => {});

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
      if (active) setDock(state);
    }).then((fn) => {
      if (!active) {
        fn();
        return;
      }
      unlistenState = fn;
    });

    return () => {
      active = false;
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

  const handleUpdateNote = (
    id: string,
    patch: Partial<Pick<SessionNote, "title" | "body">>
  ) => {
    setNotes((prev) =>
      prev.map((note) =>
        note.id === id ? { ...note, ...patch, updatedAt: new Date().toISOString() } : note
      )
    );
  };

  const handleAddTodo = (event: FormEvent) => {
    event.preventDefault();
    const text = todoDraft.trim();
    if (!text) return;
    setTodos((prev) => [{ id: crypto.randomUUID(), text, done: false }, ...prev]);
    setTodoDraft("");
  };

  const handleToggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo))
    );
  };

  const handleRemoveTodo = (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
  };

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

  const panelNode = dock.expanded ? (
    <DockPanel
      dock={dock}
      activeTab={activeTab}
      notes={notes}
      activeNoteId={activeNoteId}
      todos={todos}
      todoDraft={todoDraft}
      statusNotice={statusNotice}
      noteBodyRef={noteBodyRef}
      onSelectEdge={handleSelectEdge}
      onTogglePin={handleTogglePin}
      onCollapse={() => void handleExpand(false)}
      onHide={() => void handleHide()}
      onSelectNote={setActiveNoteId}
      onUpdateNote={handleUpdateNote}
      onNewNote={() => void handleNewNote()}
      onTodoDraftChange={setTodoDraft}
      onAddTodo={handleAddTodo}
      onToggleTodo={handleToggleTodo}
      onRemoveTodo={handleRemoveTodo}
    />
  ) : null;

  const shell = (
    <div
      className={`relative flex h-full w-full overflow-hidden border-white/[0.08] bg-[#121316]/95 ${edgeShellClass}`}
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
          className="fixed z-50 w-42 rounded-[14px] border border-white/[0.1] bg-[#1b1c21] p-1.5 shadow-xl"
        >
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Posição do dock
          </div>
          {(["right", "left", "top"] as DockEdge[]).map((edge) => (
            <button
              key={edge}
              type="button"
              onClick={() => void handleSelectEdge(edge)}
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors cursor-pointer ${
                dock.edge === edge
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "text-zinc-200 hover:bg-white/[0.06]"
              }`}
            >
              <span>
                {edge === "right" ? "Direita" : edge === "left" ? "Esquerda" : "Topo"}
              </span>
              {dock.edge === edge && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
            </button>
          ))}
          <div className="my-1 border-t border-white/[0.07]" />
          <button
            type="button"
            onClick={() => {
              setContextMenu(null);
              void handleExpand(false);
            }}
            className="w-full rounded-lg px-2 py-1.5 text-left text-[12px] text-zinc-300 hover:bg-white/[0.06] cursor-pointer"
          >
            Recolher barra
          </button>
          <button
            type="button"
            onClick={() => void handleHide()}
            className="w-full rounded-lg px-2 py-1.5 text-left text-[12px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200 cursor-pointer"
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
      <div className="relative h-screen w-screen bg-zinc-950">
        <div className={`fixed ${previewSize}`}>{shell}</div>
      </div>
    );
  }

  return shell;
}