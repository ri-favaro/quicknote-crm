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
      ? "border-l border-border"
      : edge === "left"
        ? "border-r border-border"
        : "border-b border-border"
    : "";

  const indicatorPosition =
    edge === "right"
      ? "right-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-l-full"
      : edge === "left"
        ? "left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full"
        : "top-0 left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-b-full";

  const itemButtonBase =
    "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] transition-[background-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.95] cursor-pointer";

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
        className={`flex items-center justify-center text-muted-foreground transition-colors duration-150 hover:text-foreground cursor-grab active:cursor-grabbing ${
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
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }`}
      >
        {expanded && activeTab === "notes" && (
          <span className={`absolute bg-primary ${indicatorPosition}`} />
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
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }`}
      >
        {expanded && activeTab === "todos" && (
          <span className={`absolute bg-primary ${indicatorPosition}`} />
        )}
        <CheckSquare className="h-[18px] w-[18px]" strokeWidth={1.9} />
        {pendingTodos > 0 && (
          <span className="tabular-nums absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
            {pendingTodos > 9 ? "9+" : pendingTodos}
          </span>
        )}
      </button>

      <button
        type="button"
        title="Nova nota rápida (Ctrl+Shift+N)"
        aria-label="Nova nota rápida"
        onClick={onNewNote}
        className={`${itemButtonBase} bg-secondary text-foreground hover:bg-accent hover:text-accent-foreground`}
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
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }`}
      >
        {expanded && activeTab === "settings" && (
          <span className={`absolute bg-primary ${indicatorPosition}`} />
        )}
        <SlidersHorizontal className="h-[17px] w-[17px]" strokeWidth={1.9} />
      </button>
    </nav>
  );
}