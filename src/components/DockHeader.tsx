import { Minus, Pin, PinOff } from "lucide-react";
import type { DockAnchor } from "../lib/bridge";

interface DockHeaderProps {
  anchor: DockAnchor;
  alwaysOnTop: boolean;
  onSnap: (anchor: DockAnchor) => void;
  onTogglePin: () => void;
  onHide: () => void;
}

const ANCHOR_OPTIONS: { id: DockAnchor; label: string; short: string }[] = [
  { id: "top-left", label: "Topo Esquerdo", short: "↖" },
  { id: "top-center", label: "Topo Centro", short: "↑" },
  { id: "top-right", label: "Topo Direito", short: "↗" },
  { id: "bottom-left", label: "Base Esquerda", short: "↙" },
  { id: "bottom-right", label: "Base Direita", short: "↘" },
];

export function DockHeader({
  anchor,
  alwaysOnTop,
  onSnap,
  onTogglePin,
  onHide,
}: DockHeaderProps) {
  return (
    <header
      data-tauri-drag-region
      className="flex items-center justify-between gap-2 border-b border-zinc-800/90 bg-zinc-900/95 px-3 py-2 select-none"
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 min-w-0 cursor-grab active:cursor-grabbing"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
        <span
          data-tauri-drag-region
          className="text-xs font-semibold tracking-tight text-zinc-100 truncate"
        >
          QuickNote
        </span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
          CS Dock
        </span>
      </div>

      <div className="flex items-center gap-1">
        <div
          className="flex items-center rounded-md border border-zinc-800 bg-zinc-950/80 p-0.5"
          role="group"
          aria-label="Posição do dock"
        >
          {ANCHOR_OPTIONS.map((opt) => {
            const active = anchor === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                title={opt.label}
                onClick={() => onSnap(opt.id)}
                className={`h-5 w-5 rounded text-[11px] leading-none transition-colors cursor-pointer ${
                  active
                    ? "bg-zinc-700 text-zinc-50"
                    : "text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-200"
                }`}
              >
                {opt.short}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onTogglePin}
          title={alwaysOnTop ? "Desafixar do topo" : "Manter sempre visível"}
          className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors cursor-pointer ${
            alwaysOnTop
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          }`}
        >
          {alwaysOnTop ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={onHide}
          title="Recolher para bandeja (Esc)"
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}