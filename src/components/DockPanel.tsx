import {
  AlertCircle,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  EyeOff,
  PanelLeft,
  PanelRight,
  PanelTop,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type RefObject } from "react";
import {
  isTauriRuntime,
  type ActiveProfile,
  type DockEdge,
  type DockState,
  type Note,
  type SetActiveProfileInput,
  type Todo,
} from "../lib/bridge";
import type { DockTab } from "./DockRail";
import { ProfileSettingsCard } from "./ProfileSettingsCard";

export type PersistenceStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

export type TodoScope = "all" | "note";

interface DockPanelProps {
  dock: DockState;
  activeTab: DockTab;
  notes: Note[];
  activeNoteId: string;
  todos: Todo[];
  todoDraft: string;
  todoDueDate: string;
  todoScope: TodoScope;
  profile: ActiveProfile;
  persistenceStatus: PersistenceStatus;
  statusNotice: string | null;
  dockOpacity: number;
  noteBodyRef: RefObject<HTMLTextAreaElement | null>;
  onSelectEdge: (edge: DockEdge) => void;
  onTogglePin: () => void;
  onOpacityChange: (opacity: number) => void;
  onCollapse: () => void;
  onHide: () => void;
  onSelectNote: (id: string) => void;
  onUpdateNote: (id: string, patch: Partial<Pick<Note, "title" | "contentMd">>) => void;
  onNewNote: () => void;
  onDeleteNote: (id: string) => void;
  onRetrySave: () => void;
  onTodoDraftChange: (value: string) => void;
  onTodoDueDateChange: (value: string) => void;
  onTodoScopeChange: (scope: TodoScope) => void;
  onAddTodo: (
    event: FormEvent,
    options?: { text?: string; dueDate?: string }
  ) => void | Promise<boolean>;
  onToggleTodo: (id: string) => void;
  onRemoveTodo: (id: string) => void;
  onOpenNoteFromTodo: (noteId: string) => void;
  onSaveProfile: (input: SetActiveProfileInput) => Promise<void>;
  onOpenSettings: () => void;
}

const EDGE_OPTIONS: { id: DockEdge; label: string; tooltip: string }[] = [
  { id: "left", label: "Esquerda", tooltip: "Encaixar na esquerda" },
  { id: "top", label: "Topo", tooltip: "Encaixar no topo" },
  { id: "right", label: "Direita", tooltip: "Encaixar na direita" },
];

const TAB_TITLES: Record<DockTab, string> = {
  notes: "Notas rápidas",
  todos: "Tarefas",
  settings: "Posição e ajustes",
};

function EdgeIcon({ edge, className }: { edge: DockEdge; className?: string }) {
  if (edge === "left") return <PanelLeft className={className} />;
  if (edge === "top") return <PanelTop className={className} />;
  return <PanelRight className={className} />;
}

function CollapseIcon({ edge, className }: { edge: DockEdge; className?: string }) {
  if (edge === "left") return <ChevronLeft className={className} />;
  if (edge === "top") return <ChevronUp className={className} />;
  return <ChevronRight className={className} />;
}

function formatDueDateLabel(dueDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate);
  if (!match) return dueDate;
  return `${match[3]}/${match[2]}`;
}

function isDueOverdue(dueDate: string, done: boolean): boolean {
  if (done) return false;
  const datePart = dueDate.slice(0, 10);
  const now = new Date();
  const todayLocal = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return datePart < todayLocal;
}

function formatSavedTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DockPanel({
  dock,
  activeTab,
  notes,
  activeNoteId,
  todos,
  todoDraft,
  todoDueDate,
  todoScope,
  profile,
  persistenceStatus,
  statusNotice,
  dockOpacity,
  noteBodyRef,
  onSelectEdge,
  onTogglePin,
  onOpacityChange,
  onCollapse,
  onHide,
  onSelectNote,
  onUpdateNote,
  onNewNote,
  onDeleteNote,
  onRetrySave,
  onTodoDraftChange,
  onTodoDueDateChange,
  onTodoScopeChange,
  onAddTodo,
  onToggleTodo,
  onRemoveTodo,
  onOpenNoteFromTodo,
  onSaveProfile,
  onOpenSettings,
}: DockPanelProps) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [noteTodoDraft, setNoteTodoDraft] = useState("");

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? notes[0];
  const activeNoteTodos = activeNote
    ? todos.filter((todo) => todo.noteId === activeNote.id)
    : [];
  const visibleTodos = todoScope === "note" ? activeNoteTodos : todos;
  const completedCount = visibleTodos.filter((t) => t.done).length;
  const noteCompletedCount = activeNoteTodos.filter((t) => t.done).length;
  const opacityProgress = Math.max(0, Math.min(100, ((dockOpacity - 40) / 60) * 100));

  const noteTitleById = new Map(
    notes.map((n) => [n.id, n.title.trim() || "Sem título"])
  );

  useEffect(() => {
    setConfirmingDeleteId(null);
  }, [activeNoteId, activeTab]);

  const handleNoteInlineTodoSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = noteTodoDraft.trim();
    if (!trimmed) return;
    const result = await onAddTodo(event, { text: trimmed });
    if (result !== false) {
      setNoteTodoDraft("");
    }
  };

  const renderFooterStatus = () => {
    if (statusNotice) {
      return <span className="truncate text-rose-300">{statusNotice}</span>;
    }

    if (persistenceStatus.kind === "saving") {
      return <span className="truncate text-zinc-400">Salvando no SQLite...</span>;
    }

    if (persistenceStatus.kind === "error") {
      return (
        <span className="flex min-w-0 items-center gap-1.5 text-rose-300">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">{persistenceStatus.message}</span>
          <button
            type="button"
            onClick={onRetrySave}
            className="shrink-0 font-medium text-rose-200 underline decoration-rose-400/50 underline-offset-2 hover:text-white cursor-pointer"
          >
            Tentar novamente
          </button>
        </span>
      );
    }

    if (persistenceStatus.kind === "saved") {
      const savedTime = formatSavedTime(persistenceStatus.at);
      return (
        <span className="tabular-nums truncate text-zinc-400">
          {savedTime ? `Salvo às ${savedTime}` : "Salvo"} · {profile.authorName}
        </span>
      );
    }

    return (
      <span className="truncate">
        {isTauriRuntime()
          ? `Offline · ${profile.authorName}`
          : `Preview web · ${profile.authorName}`}
      </span>
    );
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white/[0.02] text-zinc-100">
      <header
        data-tauri-drag-region
        className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-3.5"
      >
        <div
          data-tauri-drag-region
          className="flex min-w-0 items-center gap-2 cursor-grab active:cursor-grabbing"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          <h1
            data-tauri-drag-region
            className="truncate text-[13px] font-semibold tracking-tight text-zinc-100"
          >
            {TAB_TITLES[activeTab]}
          </h1>
        </div>

        <div className="flex items-center gap-1">
          <div
            role="group"
            aria-label="Posição da barra"
            className="flex items-center rounded-[10px] border border-white/[0.07] bg-black/25 p-0.5"
          >
            {EDGE_OPTIONS.map((opt) => {
              const active = dock.edge === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.tooltip}
                  aria-label={opt.tooltip}
                  aria-pressed={active}
                  onClick={() => onSelectEdge(opt.id)}
                  className={`flex h-6 w-6 items-center justify-center rounded-[7px] transition-[background-color,color] duration-150 cursor-pointer ${
                    active
                      ? "bg-white/[0.14] text-zinc-50"
                      : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                  }`}
                >
                  <EdgeIcon edge={opt.id} className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onTogglePin}
            title={dock.alwaysOnTop ? "Desafixar do topo" : "Manter sempre visível"}
            aria-label={dock.alwaysOnTop ? "Desafixar do topo" : "Manter sempre visível"}
            aria-pressed={dock.alwaysOnTop}
            className={`flex h-7 w-7 items-center justify-center rounded-[9px] transition-[background-color,color] duration-150 cursor-pointer ${
              dock.alwaysOnTop
                ? "bg-emerald-500/15 text-emerald-300"
                : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
            }`}
          >
            {dock.alwaysOnTop ? (
              <Pin className="h-3.5 w-3.5" />
            ) : (
              <PinOff className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onCollapse}
            title="Recolher para a barra minimalista (Esc)"
            aria-label="Recolher para a barra minimalista"
            className="flex h-7 w-7 items-center justify-center rounded-[9px] text-zinc-400 transition-[background-color,color] duration-150 hover:bg-white/[0.06] hover:text-zinc-100 cursor-pointer"
          >
            <CollapseIcon edge={dock.edge} className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3.5">
        {activeTab === "notes" && activeNote && (
          <>
            {!profile.isConfigured && (
              <div className="flex items-center justify-between gap-2 rounded-[12px] border border-amber-400/20 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
                <span className="truncate">Usando perfil CS Local</span>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="shrink-0 font-medium text-amber-100 underline decoration-amber-300/60 underline-offset-2 hover:text-white cursor-pointer"
                >
                  Configurar
                </button>
              </div>
            )}

            {notes.length > 1 && (
              <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto pb-0.5">
                {notes.map((note) => {
                  const selected = note.id === activeNote.id;
                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => onSelectNote(note.id)}
                      className={`max-w-[140px] shrink-0 truncate rounded-lg border px-2.5 py-1 text-[11px] transition-[background-color,color,border-color] duration-150 cursor-pointer ${
                        selected
                          ? "border-white/[0.14] bg-white/[0.09] text-zinc-100"
                          : "border-white/[0.05] bg-white/[0.02] text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {note.title.trim() || "Sem título"}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={activeNote.title}
                onChange={(e) =>
                  onUpdateNote(activeNote.id, { title: e.target.value })
                }
                placeholder="Cliente ou título da call..."
                className="min-w-0 flex-1 rounded-[12px] border border-white/[0.07] bg-black/25 px-3 py-2 text-[13px] font-medium text-zinc-100 placeholder:text-zinc-500 focus:border-white/[0.18] focus:outline-none"
              />
              <button
                type="button"
                onClick={onNewNote}
                title="Criar nova nota (Ctrl+Shift+N)"
                aria-label="Criar nova nota"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/[0.07] bg-white/[0.04] text-zinc-300 transition-[background-color,color,transform] duration-150 hover:bg-emerald-500/15 hover:text-emerald-300 active:scale-[0.96] cursor-pointer"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfirmingDeleteId((curr) =>
                    curr === activeNote.id ? null : activeNote.id
                  )
                }
                title="Excluir nota"
                aria-label="Excluir nota"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/[0.07] bg-white/[0.03] text-zinc-400 transition-[background-color,color,transform] duration-150 hover:bg-rose-500/15 hover:text-rose-300 active:scale-[0.96] cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {confirmingDeleteId === activeNote.id && (
              <div className="flex items-center justify-between gap-2 rounded-[12px] border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5 text-[11px]">
                <span className="truncate text-rose-200">
                  Excluir nota e tarefas vinculadas?
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteId(null)}
                    className="rounded-md px-2 py-0.5 text-zinc-300 hover:bg-white/[0.08] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDeleteId(null);
                      onDeleteNote(activeNote.id);
                    }}
                    className="rounded-md bg-rose-500/25 px-2 py-0.5 font-medium text-rose-100 hover:bg-rose-500/40 cursor-pointer"
                  >
                    Confirmar exclusão
                  </button>
                </div>
              </div>
            )}

            <textarea
              ref={noteBodyRef}
              value={activeNote.contentMd}
              onChange={(e) =>
                onUpdateNote(activeNote.id, { contentMd: e.target.value })
              }
              placeholder="Anote pontos da reunião, dores do cliente e próximos passos..."
              className="min-h-[132px] flex-1 resize-none rounded-[14px] border border-white/[0.07] bg-black/25 p-3 text-[13px] leading-relaxed text-zinc-200 placeholder:text-zinc-500 focus:border-white/[0.18] focus:outline-none"
            />

            <section className="flex shrink-0 flex-col gap-1.5 rounded-[16px] border border-white/[0.07] bg-black/20 p-2.5">
              <div className="flex items-center justify-between px-0.5 text-[11px] text-zinc-400">
                <span>Follow-ups desta nota</span>
                <span className="tabular-nums font-mono text-zinc-500">
                  {noteCompletedCount}/{activeNoteTodos.length}
                </span>
              </div>

              <form
                onSubmit={handleNoteInlineTodoSubmit}
                className="flex items-center gap-1.5"
              >
                <input
                  type="text"
                  value={noteTodoDraft}
                  onChange={(e) => setNoteTodoDraft(e.target.value)}
                  placeholder="Novo follow-up nesta nota..."
                  className="min-w-0 flex-1 rounded-[8px] border border-white/[0.07] bg-black/30 px-2.5 py-1.5 text-[12px] text-zinc-100 placeholder:text-zinc-500 focus:border-white/[0.18] focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Adicionar follow-up na nota"
                  title="Adicionar follow-up na nota"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-emerald-500/15 text-emerald-300 transition-[background-color,transform] duration-150 hover:bg-emerald-500/25 active:scale-[0.96] cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </form>

              {activeNoteTodos.length > 0 && (
                <div className="flex max-h-24 flex-col gap-1 overflow-y-auto pt-0.5">
                  {activeNoteTodos.map((todo) => (
                    <div
                      key={todo.id}
                      className="group flex items-center gap-2 rounded-[8px] bg-white/[0.03] px-2 py-1"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleTodo(todo.id)}
                        aria-label={todo.done ? "Desmarcar tarefa" : "Concluir tarefa"}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150 cursor-pointer ${
                          todo.done
                            ? "border-emerald-400/60 bg-emerald-500/25 text-emerald-300"
                            : "border-white/[0.2] bg-transparent text-transparent hover:border-white/[0.35]"
                        }`}
                      >
                        <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
                      </button>
                      <span
                        className={`min-w-0 flex-1 truncate text-[12px] ${
                          todo.done ? "text-zinc-500 line-through" : "text-zinc-200"
                        }`}
                      >
                        {todo.text}
                      </span>
                      {todo.dueDate && (
                        <span
                          className={`tabular-nums shrink-0 rounded px-1 py-0.5 font-mono text-[10px] ${
                            isDueOverdue(todo.dueDate, todo.done)
                              ? "bg-rose-500/15 text-rose-300"
                              : "bg-white/[0.06] text-zinc-400"
                          }`}
                        >
                          {formatDueDateLabel(todo.dueDate)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemoveTodo(todo.id)}
                        aria-label="Remover tarefa"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-600 opacity-0 transition-opacity duration-150 hover:bg-white/[0.06] hover:text-zinc-300 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === "todos" && (
          <>
            <div
              role="group"
              aria-label="Escopo das tarefas"
              className="grid grid-cols-2 gap-1 rounded-[12px] border border-white/[0.07] bg-black/25 p-1"
            >
              <button
                type="button"
                aria-pressed={todoScope === "all"}
                onClick={() => onTodoScopeChange("all")}
                className={`rounded-[8px] py-1 text-[11px] font-medium transition-[background-color,color] duration-150 cursor-pointer ${
                  todoScope === "all"
                    ? "bg-white/[0.12] text-zinc-50"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                aria-pressed={todoScope === "note"}
                onClick={() => onTodoScopeChange("note")}
                className={`rounded-[8px] py-1 text-[11px] font-medium transition-[background-color,color] duration-150 cursor-pointer ${
                  todoScope === "note"
                    ? "bg-white/[0.12] text-zinc-50"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Nota atual
              </button>
            </div>

            <form
              onSubmit={(e) => void onAddTodo(e, { dueDate: todoDueDate })}
              className="flex flex-col gap-1.5"
            >
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={todoDraft}
                  onChange={(e) => onTodoDraftChange(e.target.value)}
                  placeholder="Adicionar follow-up..."
                  className="min-w-0 flex-1 rounded-[12px] border border-white/[0.07] bg-black/25 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-500 focus:border-white/[0.18] focus:outline-none"
                />
                <button
                  type="submit"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-emerald-500/15 text-emerald-300 transition-[background-color,transform] duration-150 hover:bg-emerald-500/25 active:scale-[0.96] cursor-pointer"
                  title="Adicionar tarefa"
                  aria-label="Adicionar tarefa"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 px-0.5 text-[11px] text-zinc-500">
                <span className="truncate">
                  Vincular à nota:{" "}
                  <strong className="font-medium text-zinc-300">
                    {activeNote?.title.trim() || "Sem título"}
                  </strong>
                </span>
                <label className="flex shrink-0 items-center gap-1 text-zinc-400">
                  <Calendar className="h-3 w-3 text-zinc-500" />
                  <input
                    type="date"
                    aria-label="Prazo da tarefa"
                    value={todoDueDate}
                    onChange={(e) => onTodoDueDateChange(e.target.value)}
                    className="rounded-md border border-white/[0.07] bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200 focus:border-white/[0.18] focus:outline-none"
                  />
                </label>
              </div>
            </form>

            <div className="flex items-center justify-between px-0.5 text-[11px] text-zinc-500">
              <span>
                {todoScope === "note" ? "Checklist da nota" : "Todas as tarefas"}
              </span>
              <span className="tabular-nums font-mono">
                {completedCount}/{visibleTodos.length}
              </span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
              {visibleTodos.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-[14px] border border-dashed border-white/[0.07] px-4 text-center text-[12px] text-zinc-500">
                  {todoScope === "note"
                    ? "Nenhum follow-up vinculado a esta nota."
                    : "Nenhuma tarefa pendente. Capture follow-ups rápidos aqui."}
                </div>
              ) : (
                visibleTodos.map((todo) => (
                  <div
                    key={todo.id}
                    className="group flex items-start gap-2.5 rounded-[12px] border border-white/[0.06] bg-black/20 px-2.5 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleTodo(todo.id)}
                      aria-label={todo.done ? "Desmarcar tarefa" : "Concluir tarefa"}
                      className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-colors duration-150 cursor-pointer ${
                        todo.done
                          ? "border-emerald-400/60 bg-emerald-500/25 text-emerald-300"
                          : "border-white/[0.2] bg-transparent text-transparent hover:border-white/[0.35]"
                      }`}
                    >
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    </button>

                    <div className="min-w-0 flex-1">
                      <span
                        className={`block break-words text-[13px] ${
                          todo.done ? "text-zinc-500 line-through" : "text-zinc-200"
                        }`}
                      >
                        {todo.text}
                      </span>

                      {(todo.dueDate || todoScope === "all") && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {todo.dueDate && (
                            <span
                              className={`tabular-nums inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] ${
                                isDueOverdue(todo.dueDate, todo.done)
                                  ? "bg-rose-500/15 text-rose-300"
                                  : "bg-white/[0.06] text-zinc-400"
                              }`}
                            >
                              <Calendar className="h-2.5 w-2.5" />
                              {formatDueDateLabel(todo.dueDate)}
                            </span>
                          )}
                          {todoScope === "all" && (
                            <button
                              type="button"
                              onClick={() => onOpenNoteFromTodo(todo.noteId)}
                              className="max-w-[160px] truncate rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-white/[0.1] hover:text-zinc-200 cursor-pointer"
                            >
                              {noteTitleById.get(todo.noteId) ?? "Sem título"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveTodo(todo.id)}
                      aria-label="Remover tarefa"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-600 opacity-0 transition-opacity duration-150 hover:bg-white/[0.06] hover:text-zinc-300 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === "settings" && (
          <div className="flex flex-col gap-3">
            <ProfileSettingsCard
              profile={profile}
              onSaveProfile={onSaveProfile}
            />

            <section className="rounded-[14px] border border-white/[0.07] bg-black/20 p-3">
              <div className="mb-2 text-[11px] font-medium text-zinc-400">
                Borda de encaixe
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {EDGE_OPTIONS.map((opt) => {
                  const active = dock.edge === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onSelectEdge(opt.id)}
                      className={`flex flex-col items-center justify-center gap-1.5 rounded-[11px] border py-2.5 text-[12px] transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] cursor-pointer ${
                        active
                          ? "border-emerald-400/35 bg-emerald-500/12 text-emerald-200"
                          : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
                      }`}
                    >
                      <EdgeIcon edge={opt.id} className="h-4 w-4" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Você também pode arrastar pela alça da barra para encaixar em outra borda.
              </p>
            </section>

            <section className="flex flex-col gap-2 rounded-[14px] border border-white/[0.07] bg-black/20 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-zinc-200">
                  Manter sempre no topo
                </span>
                <button
                  type="button"
                  onClick={onTogglePin}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 cursor-pointer ${
                    dock.alwaysOnTop
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-white/[0.06] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {dock.alwaysOnTop ? "Ativo" : "Desativado"}
                </button>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-2.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="dock-opacity-slider"
                    className="text-[12px] text-zinc-200"
                  >
                    Opacidade do dock
                  </label>
                  <span className="tabular-nums font-mono text-[11px] text-emerald-300">
                    {dockOpacity}%
                  </span>
                </div>
                <input
                  id="dock-opacity-slider"
                  type="range"
                  min={40}
                  max={100}
                  step={1}
                  value={dockOpacity}
                  aria-label="Opacidade do dock"
                  onChange={(e) => onOpacityChange(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, rgba(52, 211, 153, 0.75) ${opacityProgress}%, rgba(255, 255, 255, 0.1) ${opacityProgress}%)`,
                  }}
                  className="dock-range h-1.5 w-full cursor-pointer appearance-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                />
              </div>

              <div className="flex items-center justify-between border-t border-white/[0.06] pt-2 text-[11px] text-zinc-400">
                <span>Expandir / recolher</span>
                <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                  {dock.shortcuts.toggle}
                </kbd>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Nova nota rápida</span>
                <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                  {dock.shortcuts.newNote}
                </kbd>
              </div>
            </section>

            <button
              type="button"
              onClick={onHide}
              className="flex items-center justify-center gap-2 rounded-[12px] border border-white/[0.08] bg-white/[0.03] py-2.5 text-[12px] text-zinc-300 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.07] hover:text-zinc-100 active:scale-[0.98] cursor-pointer"
            >
              <EyeOff className="h-3.5 w-3.5" />
              <span>Ocultar completamente para a bandeja</span>
            </button>
          </div>
        )}
      </main>

      <footer className="flex h-8 shrink-0 items-center justify-between gap-2 border-t border-white/[0.06] px-3.5 text-[10px] text-zinc-500">
        <div className="min-w-0 flex-1">{renderFooterStatus()}</div>
        <div className="flex shrink-0 items-center gap-1.5 font-mono text-zinc-600">
          <span>{isTauriRuntime() ? "SQLite" : "Web"}</span>
          <span>·</span>
          <span className="tabular-nums">v0.1</span>
        </div>
      </footer>
    </div>
  );
}
