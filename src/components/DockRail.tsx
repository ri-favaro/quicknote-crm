import { CheckSquare, FileText, GripHorizontal, GripVertical, Plus, SlidersHorizontal } from "lucide-react";
import type { MouseEvent } from "react";
import type { DockEdge } from "../lib/bridge";

export type DockTab = "notes" | "todos" | "settings";

interface DockRailProps {
  edge: DockEdge;
  expanded: boolean;
  activeTab: DockTab;
  pendingTodos: number;
  onSelectTab: (tab: DockTab) => void;
  onNewNote: () => void;
  onContextMenu: (event: MouseEvent<HTMLElement>) => void;
}

export function DockRail({
  edge,
  expanded,
  activeTab,
  pendingTodos,
  onSelectTab,
  onNewNote,
  onContextMenu,
}: DockRailProps) {
  const isTop = edge === "top";

  const dividerClass = expanded
    ? edge === "right"
      ? "border-l border-white/[0.06]"
      : edge === "left"
        ? "border-r border-white/[0.06]"
        : "border-b border-white/[0.06]"
    : "";

  const indicatorPosition =
    edge === "right"
      ? "right-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-l-full"
      : edge === "left"
        ? "left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full"
        : "top-0 left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-b-full";

  const itemButtonBase =
    "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] transition-[background-color,color,transform] duration-150 active:scale-[0.95] cursor-pointer";

  return (
    <nav
      aria-label="Barra rápida QuickNote" data-orientation={isTop ? "horizontal" : "vertical"}
      onContextMenu={onContextMenu}
      className={`flex shrink-0 items-center justify-center gap-1.5 bg-transparent ${dividerClass} ${
        isTop ? "h-14 w-full flex-row px-2.5" : "h-full w-14 flex-col py-2.5"
      }`}
    >
      <div
        data-tauri-drag-region
        title="Arraste para encaixar na direita, esquerda ou topo"
        className={`flex items-center justify-center text-zinc-600 transition-colors duration-150 hover:text-zinc-400 cursor-grab active:cursor-grabbing ${
          isTop ? "h-8 w-5 mr-0.5" : "h-5 w-8 mb-0.5"
        }`}
      >
        {isTop ? (
          <GripVertical className="h-3.5 w-3.5 pointer-events-none" />
        ) : (
          <GripHorizontal className="h-3.5 w-3.5 pointer-events-none" />
        )}
      </div>

      <button
        type="button"
        title="Notas rápidas (Alt+Space)"
        aria-label="Notas rápidas"
        aria-pressed={expanded && activeTab === "notes"}
        onClick={() => onSelectTab("notes")}
        className={`${itemButtonBase} ${
          expanded && activeTab === "notes"
            ? "bg-white/[0.11] text-zinc-50"
            : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
        }`}
      >
        {expanded && activeTab === "notes" && (
          <span className={`absolute bg-emerald-400 ${indicatorPosition}`} />
        )}
        <FileText className="h-[18px] w-[18px]" strokeWidth={1.9} />
      </button>

      <button
        type="button"
        title="Tarefas e follow-ups"
        aria-label="Tarefas e follow-ups"
        aria-pressed={expanded && activeTab === "todos"}
        onClick={() => onSelectTab("todos")}
        className={`${itemButtonBase} ${
          expanded && activeTab === "todos"
            ? "bg-white/[0.11] text-zinc-50"
            : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
        }`}
      >
        {expanded && activeTab === "todos" && (
          <span className={`absolute bg-emerald-400 ${indicatorPosition}`} />
        )}
        <CheckSquare className="h-[18px] w-[18px]" strokeWidth={1.9} />
        {pendingTodos > 0 && (
          <span className="tabular-nums absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold leading-none text-zinc-950">
            {pendingTodos > 9 ? "9+" : pendingTodos}
          </span>
        )}
      </button>

      <button
        type="button"
        title="Nova nota rápida (Ctrl+Shift+N)"
        aria-label="Nova nota rápida"
        onClick={onNewNote}
        className={`${itemButtonBase} bg-white/[0.05] text-zinc-200 hover:bg-emerald-500/20 hover:text-emerald-300`}
      >
        <Plus className="h-[19px] w-[19px]" strokeWidth={2.2} />
      </button>

      <button
        type="button"
        title="Posição do dock e ajustes"
        aria-label="Posição do dock e ajustes"
        aria-pressed={expanded && activeTab === "settings"}
        onClick={() => onSelectTab("settings")}
        className={`${itemButtonBase} ${
          expanded && activeTab === "settings"
            ? "bg-white/[0.11] text-zinc-50"
            : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
        }`}
      >
        {expanded && activeTab === "settings" && (
          <span className={`absolute bg-emerald-400 ${indicatorPosition}`} />
        )}
        <SlidersHorizontal className="h-[17px] w-[17px]" strokeWidth={1.9} />
      </button>
    </nav>
  );
}