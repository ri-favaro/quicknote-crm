import {
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
import type { FormEvent, RefObject } from "react";
import { isTauriRuntime, type DockEdge, type DockState } from "../lib/bridge";
import type { DockTab } from "./DockRail";

export interface SessionNote {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface SessionTodo {
  id: string;
  text: string;
  done: boolean;
}

interface DockPanelProps {
  dock: DockState;
  activeTab: DockTab;
  notes: SessionNote[];
  activeNoteId: string;
  todos: SessionTodo[];
  todoDraft: string;
  statusNotice: string | null;
  noteBodyRef: RefObject<HTMLTextAreaElement | null>;
  onSelectEdge: (edge: DockEdge) => void;
  onTogglePin: () => void;
  onCollapse: () => void;
  onHide: () => void;
  onSelectNote: (id: string) => void;
  onUpdateNote: (id: string, patch: Partial<Pick<SessionNote, "title" | "body">>) => void;
  onNewNote: () => void;
  onTodoDraftChange: (value: string) => void;
  onAddTodo: (event: FormEvent) => void;
  onToggleTodo: (id: string) => void;
  onRemoveTodo: (id: string) => void;
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

export function DockPanel({
  dock,
  activeTab,
  notes,
  activeNoteId,
  todos,
  todoDraft,
  statusNotice,
  noteBodyRef,
  onSelectEdge,
  onTogglePin,
  onCollapse,
  onHide,
  onSelectNote,
  onUpdateNote,
  onNewNote,
  onTodoDraftChange,
  onAddTodo,
  onToggleTodo,
  onRemoveTodo,
}: DockPanelProps) {
  const activeNote = notes.find((n) => n.id === activeNoteId) ?? notes[0];
  const completedCount = todos.filter((t) => t.done).length;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#16171b]/95 text-zinc-100">
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
            {notes.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
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

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={activeNote.title}
                onChange={(e) => onUpdateNote(activeNote.id, { title: e.target.value })}
                placeholder="Cliente ou título da call..."
                className="min-w-0 flex-1 rounded-[12px] border border-white/[0.07] bg-black/25 px-3 py-2 text-[13px] font-medium text-zinc-100 placeholder:text-zinc-500 focus:border-white/[0.18] focus:outline-none"
              />
              <button
                type="button"
                onClick={onNewNote}
                title="Criar nova nota (Ctrl+Shift+N)"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/[0.07] bg-white/[0.04] text-zinc-300 transition-[background-color,color,transform] duration-150 hover:bg-emerald-500/15 hover:text-emerald-300 active:scale-[0.95] cursor-pointer"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <textarea
              ref={noteBodyRef}
              value={activeNote.body}
              onChange={(e) => onUpdateNote(activeNote.id, { body: e.target.value })}
              placeholder="Anote pontos da reunião, dores do cliente e próximos passos..."
              className="min-h-0 flex-1 resize-none rounded-[14px] border border-white/[0.07] bg-black/25 p-3 text-[13px] leading-relaxed text-zinc-200 placeholder:text-zinc-500 focus:border-white/[0.18] focus:outline-none"
            />
          </>
        )}

        {activeTab === "todos" && (
          <>
            <form onSubmit={onAddTodo} className="flex items-center gap-2">
              <input
                type="text"
                value={todoDraft}
                onChange={(e) => onTodoDraftChange(e.target.value)}
                placeholder="Adicionar follow-up..."
                className="min-w-0 flex-1 rounded-[12px] border border-white/[0.07] bg-black/25 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-500 focus:border-white/[0.18] focus:outline-none"
              />
              <button
                type="submit"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-emerald-500/15 text-emerald-300 transition-[background-color,transform] duration-150 hover:bg-emerald-500/25 active:scale-[0.95] cursor-pointer"
                title="Adicionar tarefa"
              >
                <Plus className="h-4 w-4" />
              </button>
            </form>

            <div className="flex items-center justify-between px-0.5 text-[11px] text-zinc-500">
              <span>Checklist da sessão</span>
              <span className="tabular-nums font-mono">
                {completedCount}/{todos.length}
              </span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
              {todos.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-[14px] border border-dashed border-white/[0.07] px-4 text-center text-[12px] text-zinc-500">
                  Nenhuma tarefa pendente. Capture follow-ups rápidos aqui.
                </div>
              ) : (
                todos.map((todo) => (
                  <div
                    key={todo.id}
                    className="group flex items-center gap-2.5 rounded-[12px] border border-white/[0.06] bg-black/20 px-2.5 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleTodo(todo.id)}
                      aria-label={todo.done ? "Desmarcar tarefa" : "Concluir tarefa"}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150 cursor-pointer ${
                        todo.done
                          ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                          : "border-white/[0.16] text-transparent hover:border-white/[0.32]"
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <span
                      className={`min-w-0 flex-1 truncate text-[13px] ${
                        todo.done ? "text-zinc-500 line-through" : "text-zinc-200"
                      }`}
                    >
                      {todo.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveTodo(todo.id)}
                      aria-label="Remover tarefa"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 opacity-0 transition-opacity duration-150 hover:bg-white/[0.06] hover:text-zinc-300 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
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
                <span className="text-[12px] text-zinc-200">Manter sempre no topo</span>
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

      <footer className="flex h-8 shrink-0 items-center justify-between border-t border-white/[0.06] px-3.5 text-[10px] text-zinc-500">
        <span className="truncate">
          {statusNotice ??
            (isTauriRuntime()
              ? "Rascunho em memória · SQLite no próximo marco"
              : "Preview web · execute pnpm tauri dev para o dock nativo")}
        </span>
        <span className="tabular-nums shrink-0 font-mono text-zinc-600">v0.1</span>
      </footer>
    </div>
  );
}