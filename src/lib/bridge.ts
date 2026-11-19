import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type DockEdge = "right" | "left" | "top";

export interface DockShortcuts {
  toggle: string;
  newNote: string;
}

export interface DockState {
  edge: DockEdge;
  expanded: boolean;
  alwaysOnTop: boolean;
  visible: boolean;
  shortcuts: DockShortcuts;
}

export interface ActiveProfile {
  authorId: string;
  authorName: string;
  hasToken: boolean;
  isConfigured: boolean;
}

export interface SetActiveProfileInput {
  authorId: string;
  authorName: string;
  token?: string;
  clearToken?: boolean;
}

export interface Note {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  contentMd: string;
  pipedriveDealId: number | null;
  pipedrivePersonId: number | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
}

export interface SaveNoteDraftInput {
  id?: string;
  title: string;
  contentMd: string;
  pipedriveDealId?: number | null;
  pipedrivePersonId?: number | null;
}

export interface Todo {
  id: string;
  noteId: string;
  text: string;
  done: boolean;
  dueDate: string | null;
  pipedriveActivityId: number | null;
}

export interface UpsertTodoInput {
  id?: string;
  noteId: string;
  text: string;
  done?: boolean;
  dueDate?: string | null;
}

export interface DealSummary {
  id: number;
  title: string;
  orgName?: string;
}

export interface DispatchResult {
  logId: string;
  status: "sent" | "error";
  message: string;
}

const DEFAULT_AUTHOR_ID = "local-cs";
const DEFAULT_AUTHOR_NAME = "CS Local";

function createInitialDockState(): DockState {
  return {
    edge: "right",
    expanded: false,
    alwaysOnTop: true,
    visible: true,
    shortcuts: {
      toggle: "Alt+Space",
      newNote: "Ctrl+Shift+N",
    },
  };
}

let mockDockState: DockState = createInitialDockState();
let mockProfileRecord = {
  authorId: DEFAULT_AUTHOR_ID,
  authorName: DEFAULT_AUTHOR_NAME,
  token: "",
  isConfigured: false,
};
let mockNotes: Note[] = [];
let mockTodos: Todo[] = [];

export function resetMockStore(): void {
  if (isTauriRuntime()) return;
  mockDockState = createInitialDockState();
  mockProfileRecord = {
    authorId: DEFAULT_AUTHOR_ID,
    authorName: DEFAULT_AUTHOR_NAME,
    token: "",
    isConfigured: false,
  };
  mockNotes = [];
  mockTodos = [];
}

function toPublicProfile(): ActiveProfile {
  return {
    authorId: mockProfileRecord.authorId,
    authorName: mockProfileRecord.authorName,
    hasToken: mockProfileRecord.token.trim().length > 0,
    isConfigured: mockProfileRecord.isConfigured,
  };
}

function normalizeDueDate(dueDate?: string | null): string | null {
  if (!dueDate) return null;
  const trimmed = dueDate.trim();
  if (!trimmed) return null;

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateMatch) {
    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (
      utc.getUTCFullYear() === year &&
      utc.getUTCMonth() === month - 1 &&
      utc.getUTCDate() === day
    ) {
      return trimmed;
    }
    throw new Error("Prazo inválido. Use o formato YYYY-MM-DD.");
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed) && !Number.isNaN(Date.parse(trimmed))) {
    return trimmed;
  }

  throw new Error("Prazo inválido. Use o formato YYYY-MM-DD.");
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getDockState(): Promise<DockState> {
  if (!isTauriRuntime()) {
    return { ...mockDockState, shortcuts: { ...mockDockState.shortcuts } };
  }
  return invoke<DockState>("get_dock_state");
}

export async function setDockEdge(edge: DockEdge): Promise<DockState> {
  if (!isTauriRuntime()) {
    mockDockState = { ...mockDockState, edge };
    return { ...mockDockState, shortcuts: { ...mockDockState.shortcuts } };
  }
  return invoke<DockState>("set_dock_edge", { edge });
}

export async function setDockExpanded(expanded: boolean): Promise<DockState> {
  if (!isTauriRuntime()) {
    mockDockState = {
      ...mockDockState,
      expanded,
      visible: expanded ? true : mockDockState.visible,
    };
    return { ...mockDockState, shortcuts: { ...mockDockState.shortcuts } };
  }
  return invoke<DockState>("set_dock_expanded", { expanded });
}

export async function toggleDockExpanded(): Promise<DockState> {
  if (!isTauriRuntime()) {
    mockDockState = {
      ...mockDockState,
      expanded: !mockDockState.visible ? true : !mockDockState.expanded,
      visible: true,
    };
    return { ...mockDockState, shortcuts: { ...mockDockState.shortcuts } };
  }
  return invoke<DockState>("toggle_dock_expanded");
}

export async function setAlwaysOnTop(enabled: boolean): Promise<DockState> {
  if (!isTauriRuntime()) {
    mockDockState = { ...mockDockState, alwaysOnTop: enabled };
    return { ...mockDockState, shortcuts: { ...mockDockState.shortcuts } };
  }
  return invoke<DockState>("set_always_on_top", { enabled });
}

export async function hideDock(): Promise<void> {
  if (!isTauriRuntime()) {
    mockDockState = { ...mockDockState, visible: false };
    return;
  }
  await invoke("hide_dock");
}

export async function onDockNewNote(handler: () => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  return listen("dock://new-note", () => handler());
}

export async function onDockStateChanged(
  handler: (state: DockState) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  return listen<DockState>("dock://state-changed", (event) => {
    handler(event.payload);
  });
}

export async function saveNoteDraft(note: SaveNoteDraftInput): Promise<Note> {
  if (!isTauriRuntime()) {
    const id = note.id?.trim() || crypto.randomUUID();
    const now = new Date().toISOString();
    const index = mockNotes.findIndex((item) => item.id === id);

    if (index >= 0) {
      const current = mockNotes[index];
      const promoteAuthor = current.authorId === DEFAULT_AUTHOR_ID;
      const updated: Note = {
        ...current,
        authorId: promoteAuthor ? mockProfileRecord.authorId : current.authorId,
        authorName: promoteAuthor ? mockProfileRecord.authorName : current.authorName,
        title: note.title,
        contentMd: note.contentMd,
        pipedriveDealId: note.pipedriveDealId ?? current.pipedriveDealId,
        pipedrivePersonId: note.pipedrivePersonId ?? current.pipedrivePersonId,
        updatedAt: now,
      };
      mockNotes[index] = updated;
      return { ...updated };
    }

    const created: Note = {
      id,
      authorId: mockProfileRecord.authorId,
      authorName: mockProfileRecord.authorName,
      title: note.title,
      contentMd: note.contentMd,
      pipedriveDealId: note.pipedriveDealId ?? null,
      pipedrivePersonId: note.pipedrivePersonId ?? null,
      createdAt: now,
      updatedAt: now,
      syncedAt: null,
    };
    mockNotes.unshift(created);
    return { ...created };
  }
  return invoke<Note>("save_note_draft", { note });
}

export async function listNotes(): Promise<Note[]> {
  if (!isTauriRuntime()) {
    return [...mockNotes]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((note) => ({ ...note }));
  }
  return invoke<Note[]>("list_notes");
}

export async function getNote(id: string): Promise<Note | null> {
  if (!isTauriRuntime()) {
    const trimmed = id.trim();
    if (!trimmed) return null;
    const found = mockNotes.find((note) => note.id === trimmed);
    return found ? { ...found } : null;
  }
  return invoke<Note | null>("get_note", { id });
}

export async function deleteNote(id: string): Promise<boolean> {
  if (!isTauriRuntime()) {
    const trimmed = id.trim();
    if (!trimmed) return false;
    const prevLen = mockNotes.length;
    mockNotes = mockNotes.filter((note) => note.id !== trimmed);
    if (mockNotes.length === prevLen) return false;
    mockTodos = mockTodos.filter((todo) => todo.noteId !== trimmed);
    return true;
  }
  return invoke<boolean>("delete_note", { id });
}

export async function listTodos(noteId?: string): Promise<Todo[]> {
  if (!isTauriRuntime()) {
    const trimmed = noteId?.trim();
    const filtered = trimmed
      ? mockTodos.filter((todo) => todo.noteId === trimmed)
      : mockTodos;
    return filtered.map((todo) => ({ ...todo }));
  }
  return invoke<Todo[]>("list_todos", { noteId: noteId ?? null });
}

export async function upsertTodo(todo: UpsertTodoInput): Promise<Todo> {
  if (!isTauriRuntime()) {
    const text = todo.text.trim();
    if (!text) {
      throw new Error("Descrição da tarefa é obrigatória.");
    }
    const noteId = todo.noteId.trim();
    if (!noteId) {
      throw new Error("Toda tarefa precisa estar vinculada a uma nota.");
    }
    if (!mockNotes.some((note) => note.id === noteId)) {
      throw new Error("Nota vinculada não encontrada.");
    }

    const dueDate = normalizeDueDate(todo.dueDate);
    const id = todo.id?.trim() || crypto.randomUUID();
    const index = mockTodos.findIndex((item) => item.id === id);

    if (index >= 0) {
      const updated: Todo = {
        ...mockTodos[index],
        noteId,
        text,
        done: Boolean(todo.done),
        dueDate,
      };
      mockTodos[index] = updated;
      return { ...updated };
    }

    const created: Todo = {
      id,
      noteId,
      text,
      done: Boolean(todo.done),
      dueDate,
      pipedriveActivityId: null,
    };
    mockTodos.unshift(created);
    return { ...created };
  }
  return invoke<Todo>("upsert_todo", { todo });
}

export async function toggleTodo(id: string): Promise<Todo> {
  if (!isTauriRuntime()) {
    const trimmed = id.trim();
    const index = mockTodos.findIndex((item) => item.id === trimmed);
    if (index < 0) {
      throw new Error("Tarefa não encontrada.");
    }
    const updated: Todo = {
      ...mockTodos[index],
      done: !mockTodos[index].done,
    };
    mockTodos[index] = updated;
    return { ...updated };
  }
  return invoke<Todo>("toggle_todo", { id });
}

export async function deleteTodo(id: string): Promise<boolean> {
  if (!isTauriRuntime()) {
    const trimmed = id.trim();
    if (!trimmed) return false;
    const prevLen = mockTodos.length;
    mockTodos = mockTodos.filter((todo) => todo.id !== trimmed);
    return mockTodos.length < prevLen;
  }
  return invoke<boolean>("delete_todo", { id });
}

export async function setActiveProfile(
  profile: SetActiveProfileInput
): Promise<ActiveProfile> {
  if (!isTauriRuntime()) {
    const authorId = profile.authorId.trim();
    const authorName = profile.authorName.trim();
    if (!authorId) {
      throw new Error("ID do CS é obrigatório.");
    }
    if (!authorName) {
      throw new Error("Nome exibido do CS é obrigatório.");
    }

    let nextToken = mockProfileRecord.token;
    if (profile.clearToken) {
      nextToken = "";
    } else if (profile.token && profile.token.trim().length > 0) {
      nextToken = profile.token.trim();
    }

    mockProfileRecord = {
      authorId,
      authorName,
      token: nextToken,
      isConfigured: true,
    };
    return toPublicProfile();
  }
  return invoke<ActiveProfile>("set_active_profile", { profile });
}

export async function getActiveProfile(): Promise<ActiveProfile> {
  if (!isTauriRuntime()) {
    return toPublicProfile();
  }
  return invoke<ActiveProfile>("get_active_profile");
}
