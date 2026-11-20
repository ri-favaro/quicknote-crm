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

export type DockTheme = "dark" | "light" | "high-contrast";
export type DockAccent = "violet" | "blue" | "emerald" | "amber";
export type DockPanelSize = "compact" | "default" | "wide";

export interface DockAppearance {
  theme: DockTheme;
  accent: DockAccent;
  expandedOpacity: number;
  collapsedOpacity: number;
  panelSize: DockPanelSize;
}

export interface UpdateDockAppearanceInput {
  theme?: DockTheme;
  accent?: DockAccent;
  expandedOpacity?: number;
  collapsedOpacity?: number;
  panelSize?: DockPanelSize;
}

export const MIN_DOCK_OPACITY = 40;
export const MAX_DOCK_OPACITY = 100;

export const DEFAULT_DOCK_APPEARANCE: DockAppearance = {
  theme: "dark",
  accent: "violet",
  expandedOpacity: 100,
  collapsedOpacity: 100,
  panelSize: "default",
};

export function clampDockOpacity(value: number): number {
  if (!Number.isFinite(value)) return MAX_DOCK_OPACITY;
  return Math.min(
    MAX_DOCK_OPACITY,
    Math.max(MIN_DOCK_OPACITY, Math.round(value))
  );
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

export interface IntegrationSettings {
  pipedriveApiBase: string;
  hasPipedriveToken: boolean;
  n8nWebhookUrl: string;
  hasN8nSecret: boolean;
  supabaseUrl: string;
  hasSupabaseKey: boolean;
}

export interface SetIntegrationSettingsInput {
  pipedriveApiBase?: string;
  pipedriveApiToken?: string;
  clearPipedriveToken?: boolean;
  n8nWebhookUrl?: string;
  n8nWebhookSecret?: string;
  clearN8nSecret?: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  clearSupabaseKey?: boolean;
}

export const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettings = {
  pipedriveApiBase: "",
  hasPipedriveToken: false,
  n8nWebhookUrl: "",
  hasN8nSecret: false,
  supabaseUrl: "",
  hasSupabaseKey: false,
};

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

export type PipedriveSendType = "note" | "activity";

export interface SendToPipedriveInput {
  noteId: string;
  type: PipedriveSendType;
  dealId: number;
  todoId?: string;
}

export interface TriggerN8nWebhookInput {
  noteId: string;
  webhookKey?: string;
}

export interface SyncResult {
  syncedNotes: number;
  syncedLogs: number;
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
let mockDockAppearance: DockAppearance = { ...DEFAULT_DOCK_APPEARANCE };
let mockProfileRecord = {
  authorId: DEFAULT_AUTHOR_ID,
  authorName: DEFAULT_AUTHOR_NAME,
  token: "",
  isConfigured: false,
};
let mockIntegrationRecord = {
  pipedriveApiBase: "",
  pipedriveApiToken: "",
  n8nWebhookUrl: "",
  n8nWebhookSecret: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
};
interface MockIntegrationLog {
  id: string;
  noteId: string;
  target: "pipedrive" | "n8n";
  synced: boolean;
}

const MOCK_PIPEDRIVE_DEALS: DealSummary[] = [
  { id: 101, title: "Expansão Enterprise Q4", orgName: "Acme Corp" },
  { id: 204, title: "Onboarding CS Plus", orgName: "Beta Logistics" },
  { id: 309, title: "Renovação Anual 2026", orgName: "Norte Digital" },
];

let mockNotes: Note[] = [];
let mockTodos: Todo[] = [];
let mockIntegrationLogs: MockIntegrationLog[] = [];

export function resetMockStore(): void {
  if (isTauriRuntime()) return;
  mockDockState = createInitialDockState();
  mockDockAppearance = { ...DEFAULT_DOCK_APPEARANCE };
  mockProfileRecord = {
    authorId: DEFAULT_AUTHOR_ID,
    authorName: DEFAULT_AUTHOR_NAME,
    token: "",
    isConfigured: false,
  };
  mockIntegrationRecord = {
    pipedriveApiBase: "",
    pipedriveApiToken: "",
    n8nWebhookUrl: "",
    n8nWebhookSecret: "",
    supabaseUrl: "",
    supabaseAnonKey: "",
  };
  mockNotes = [];
  mockTodos = [];
  mockIntegrationLogs = [];
  mockPipedriveActivitySeq = 5000;
}

function toPublicProfile(): ActiveProfile {
  return {
    authorId: mockProfileRecord.authorId,
    authorName: mockProfileRecord.authorName,
    hasToken: mockProfileRecord.token.trim().length > 0,
    isConfigured: mockProfileRecord.isConfigured,
  };
}

function toPublicIntegrationSettings(): IntegrationSettings {
  return {
    pipedriveApiBase: mockIntegrationRecord.pipedriveApiBase,
    hasPipedriveToken: mockIntegrationRecord.pipedriveApiToken.trim().length > 0,
    n8nWebhookUrl: mockIntegrationRecord.n8nWebhookUrl,
    hasN8nSecret: mockIntegrationRecord.n8nWebhookSecret.trim().length > 0,
    supabaseUrl: mockIntegrationRecord.supabaseUrl,
    hasSupabaseKey: mockIntegrationRecord.supabaseAnonKey.trim().length > 0,
  };
}

function normalizeOptionalUrl(raw: string, label: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/\s/.test(trimmed)) {
    throw new Error(`${label} inválida. Use uma URL http:// ou https://.`);
  }
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.hostname.trim().length === 0
    ) {
      throw new Error(`${label} inválida. Use uma URL http:// ou https://.`);
    }
  } catch {
    throw new Error(`${label} inválida. Use uma URL http:// ou https://.`);
  }
  return trimmed.replace(/\/+$/, "");
}

function resolveNextSecret(
  clear: boolean | undefined,
  incoming: string | undefined,
  existing: string
): string {
  if (clear) return "";
  if (incoming !== undefined && incoming.trim().length > 0) {
    return incoming.trim();
  }
  return existing;
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

export async function getDockAppearance(): Promise<DockAppearance> {
  if (!isTauriRuntime()) {
    return { ...mockDockAppearance };
  }
  return invoke<DockAppearance>("get_dock_appearance");
}

export async function setDockAppearance(
  input: UpdateDockAppearanceInput
): Promise<DockAppearance> {
  if (!isTauriRuntime()) {
    mockDockAppearance = {
      theme: input.theme ?? mockDockAppearance.theme,
      accent: input.accent ?? mockDockAppearance.accent,
      expandedOpacity:
        input.expandedOpacity !== undefined
          ? clampDockOpacity(input.expandedOpacity)
          : mockDockAppearance.expandedOpacity,
      collapsedOpacity:
        input.collapsedOpacity !== undefined
          ? clampDockOpacity(input.collapsedOpacity)
          : mockDockAppearance.collapsedOpacity,
      panelSize: input.panelSize ?? mockDockAppearance.panelSize,
    };
    return { ...mockDockAppearance };
  }
  return invoke<DockAppearance>("set_dock_appearance", { appearance: input });
}

export async function resetDockAppearance(): Promise<DockAppearance> {
  if (!isTauriRuntime()) {
    mockDockAppearance = { ...DEFAULT_DOCK_APPEARANCE };
    return { ...mockDockAppearance };
  }
  return invoke<DockAppearance>("reset_dock_appearance");
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
    mockIntegrationLogs = mockIntegrationLogs.filter((log) => log.noteId !== trimmed);
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

export async function getIntegrationSettings(): Promise<IntegrationSettings> {
  if (!isTauriRuntime()) {
    return toPublicIntegrationSettings();
  }
  return invoke<IntegrationSettings>("get_integration_settings");
}

export async function setIntegrationSettings(
  settings: SetIntegrationSettingsInput
): Promise<IntegrationSettings> {
  if (!isTauriRuntime()) {
    const pipedriveApiBase =
      settings.pipedriveApiBase !== undefined
        ? normalizeOptionalUrl(settings.pipedriveApiBase, "URL base do Pipedrive")
        : mockIntegrationRecord.pipedriveApiBase;
    const n8nWebhookUrl =
      settings.n8nWebhookUrl !== undefined
        ? normalizeOptionalUrl(settings.n8nWebhookUrl, "URL do webhook n8n")
        : mockIntegrationRecord.n8nWebhookUrl;
    const supabaseUrl =
      settings.supabaseUrl !== undefined
        ? normalizeOptionalUrl(settings.supabaseUrl, "URL do projeto Supabase")
        : mockIntegrationRecord.supabaseUrl;

    mockIntegrationRecord = {
      pipedriveApiBase,
      pipedriveApiToken: resolveNextSecret(
        settings.clearPipedriveToken,
        settings.pipedriveApiToken,
        mockIntegrationRecord.pipedriveApiToken
      ),
      n8nWebhookUrl,
      n8nWebhookSecret: resolveNextSecret(
        settings.clearN8nSecret,
        settings.n8nWebhookSecret,
        mockIntegrationRecord.n8nWebhookSecret
      ),
      supabaseUrl,
      supabaseAnonKey: resolveNextSecret(
        settings.clearSupabaseKey,
        settings.supabaseAnonKey,
        mockIntegrationRecord.supabaseAnonKey
      ),
    };
    return toPublicIntegrationSettings();
  }
  return invoke<IntegrationSettings>("set_integration_settings", { settings });
}

export async function searchPipedriveDeals(query: string): Promise<DealSummary[]> {
  if (!isTauriRuntime()) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return MOCK_PIPEDRIVE_DEALS.filter(
      (deal) =>
        deal.title.toLowerCase().includes(normalized) ||
        (deal.orgName?.toLowerCase().includes(normalized) ?? false)
    ).map((deal) => ({ ...deal }));
  }
  return invoke<DealSummary[]>("search_pipedrive_deals", { query });
}

let mockPipedriveActivitySeq = 5000;

export async function sendToPipedrive(
  params: SendToPipedriveInput
): Promise<DispatchResult> {
  if (!isTauriRuntime()) {
    const noteId = params.noteId.trim();
    if (!noteId || !mockNotes.some((note) => note.id === noteId)) {
      throw new Error("Nota não encontrada no banco local.");
    }
    if (!Number.isInteger(params.dealId) || params.dealId <= 0) {
      throw new Error("ID do negócio (dealId) deve ser maior que zero.");
    }
    if (params.type === "activity") {
      const targetTodoId = params.todoId?.trim();
      const noteTodos = mockTodos.filter((todo) => todo.noteId === noteId);
      const targets = targetTodoId
        ? noteTodos.filter((todo) => todo.id === targetTodoId)
        : noteTodos.filter(
            (todo) => !todo.done && todo.pipedriveActivityId === null
          );

      if (targetTodoId && targets.length === 0) {
        throw new Error("Tarefa não encontrada nesta nota.");
      }
      if (targetTodoId && targets[0].pipedriveActivityId !== null) {
        throw new Error(
          "Esta tarefa já foi enviada como atividade ao Pipedrive."
        );
      }
      if (targets.length === 0) {
        throw new Error(
          "Nenhuma tarefa pendente sem envio para criar atividade no Pipedrive."
        );
      }

      const targetIds = new Set(targets.map((todo) => todo.id));
      let lastActivityId = mockPipedriveActivitySeq;
      mockTodos = mockTodos.map((todo) => {
        if (!targetIds.has(todo.id)) return todo;
        mockPipedriveActivitySeq += 1;
        lastActivityId = mockPipedriveActivitySeq;
        return { ...todo, pipedriveActivityId: lastActivityId };
      });

      const logId = crypto.randomUUID();
      mockIntegrationLogs.push({
        id: logId,
        noteId,
        target: "pipedrive",
        synced: false,
      });
      return {
        logId,
        status: "sent",
        message:
          targets.length === 1
            ? `Atividade #${lastActivityId} simulada no negócio #${params.dealId}.`
            : `${targets.length} atividades simuladas no negócio #${params.dealId}.`,
      };
    }

    const logId = crypto.randomUUID();
    mockIntegrationLogs.push({
      id: logId,
      noteId,
      target: "pipedrive",
      synced: false,
    });
    return {
      logId,
      status: "sent",
      message: `Envio simulado (${params.type}) para o deal #${params.dealId}.`,
    };
  }
  const payload: Record<string, unknown> = {
    noteId: params.noteId,
    kind: params.type,
    dealId: params.dealId,
  };
  if (params.todoId?.trim()) {
    payload.todoId = params.todoId.trim();
  }
  return invoke<DispatchResult>("send_to_pipedrive", payload);
}

export async function triggerN8nWebhook(
  params: TriggerN8nWebhookInput
): Promise<DispatchResult> {
  if (!isTauriRuntime()) {
    const noteId = params.noteId.trim();
    if (!noteId || !mockNotes.some((note) => note.id === noteId)) {
      throw new Error("Nota não encontrada no banco local.");
    }
    const logId = crypto.randomUUID();
    mockIntegrationLogs.push({
      id: logId,
      noteId,
      target: "n8n",
      synced: false,
    });
    const keyInfo = params.webhookKey?.trim()
      ? ` (${params.webhookKey.trim()})`
      : "";
    return {
      logId,
      status: "sent",
      message: `Webhook n8n${keyInfo} simulado para a nota ${noteId}.`,
    };
  }
  return invoke<DispatchResult>("trigger_n8n_webhook", {
    noteId: params.noteId,
    webhookKey: params.webhookKey ?? null,
  });
}

export async function syncSupabase(): Promise<SyncResult> {
  if (!isTauriRuntime()) {
    const now = new Date().toISOString();
    let syncedNotes = 0;
    mockNotes = mockNotes.map((note) => {
      if (!note.syncedAt || note.updatedAt > note.syncedAt) {
        syncedNotes += 1;
        return { ...note, syncedAt: now };
      }
      return note;
    });

    let syncedLogs = 0;
    mockIntegrationLogs = mockIntegrationLogs.map((log) => {
      if (!log.synced) {
        syncedLogs += 1;
        return { ...log, synced: true };
      }
      return log;
    });

    return { syncedNotes, syncedLogs };
  }
  return invoke<SyncResult>("sync_supabase");
}
