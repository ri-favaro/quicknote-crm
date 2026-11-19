import { Palette, RotateCcw } from "lucide-react";
import {
  DEFAULT_DOCK_APPEARANCE,
  MAX_DOCK_OPACITY,
  MIN_DOCK_OPACITY,
  type DockAccent,
  type DockAppearance,
  type DockPanelSize,
  type DockTheme,
  type UpdateDockAppearanceInput,
} from "../lib/bridge";

interface AppearanceSettingsCardProps {
  appearance: DockAppearance;
  onUpdateAppearance: (patch: UpdateDockAppearanceInput) => void;
  onResetAppearance: () => void;
}

const THEME_OPTIONS: { id: DockTheme; label: string; bg: string; fg: string }[] = [
  { id: "dark", label: "Escuro", bg: "#10141d", fg: "#f2f2f2" },
  { id: "light", label: "Claro", bg: "#f5f7fa", fg: "#161d2b" },
  { id: "high-contrast", label: "Alto contraste", bg: "#0a0a0a", fg: "#ffffff" },
];

const ACCENT_OPTIONS: { id: DockAccent; label: string; swatch: string }[] = [
  { id: "violet", label: "Roxo", swatch: "#8a2be2" },
  { id: "blue", label: "Azul", swatch: "#3b82f6" },
  { id: "emerald", label: "Esmeralda", swatch: "#10b981" },
  { id: "amber", label: "Âmbar", swatch: "#f59e0b" },
];

const SIZE_OPTIONS: { id: DockPanelSize; label: string }[] = [
  { id: "compact", label: "Compacto" },
  { id: "default", label: "Padrão" },
  { id: "wide", label: "Amplo" },
];

function opacityPercent(value: number): number {
  return ((value - MIN_DOCK_OPACITY) / (MAX_DOCK_OPACITY - MIN_DOCK_OPACITY)) * 100;
}

function isDefaultAppearance(appearance: DockAppearance): boolean {
  return (
    appearance.theme === DEFAULT_DOCK_APPEARANCE.theme &&
    appearance.accent === DEFAULT_DOCK_APPEARANCE.accent &&
    appearance.expandedOpacity === DEFAULT_DOCK_APPEARANCE.expandedOpacity &&
    appearance.collapsedOpacity === DEFAULT_DOCK_APPEARANCE.collapsedOpacity &&
    appearance.panelSize === DEFAULT_DOCK_APPEARANCE.panelSize
  );
}

export function AppearanceSettingsCard({
  appearance,
  onUpdateAppearance,
  onResetAppearance,
}: AppearanceSettingsCardProps) {
  const expandedProgress = opacityPercent(appearance.expandedOpacity);
  const collapsedProgress = opacityPercent(appearance.collapsedOpacity);
  const isDefault = isDefaultAppearance(appearance);

  return (
    <section
      aria-label="Aparência"
      className="flex flex-col gap-3 rounded-[16px] border border-border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Palette className="h-3.5 w-3.5 text-foreground/75" />
          <span>Aparência</span>
        </div>
        <button
          type="button"
          onClick={onResetAppearance}
          disabled={isDefault}
          className="inline-flex items-center gap-1 rounded-[8px] border border-border bg-secondary px-2 py-1 text-[10px] font-medium text-foreground/85 transition-[background-color,color,transform,opacity] duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Restaurar padrão</span>
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-foreground/80">Tema</span>
        <div className="grid grid-cols-3 gap-1.5">
          {THEME_OPTIONS.map((opt) => {
            const active = appearance.theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => onUpdateAppearance({ theme: opt.id })}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-[10px] border px-1.5 py-2 text-[11px] transition-[background-color,color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] cursor-pointer ${
                  active
                    ? "border-primary/70 bg-accent text-accent-foreground font-medium"
                    : "border-border bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-3.5 w-7 overflow-hidden rounded-full border border-border"
                >
                  <span className="h-full w-1/2" style={{ backgroundColor: opt.bg }} />
                  <span className="h-full w-1/2" style={{ backgroundColor: opt.fg }} />
                </span>
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
        <span className="text-[11px] text-foreground/80">Cor de destaque</span>
        <div className="grid grid-cols-4 gap-1.5">
          {ACCENT_OPTIONS.map((opt) => {
            const active = appearance.accent === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => onUpdateAppearance({ accent: opt.id })}
                className={`flex items-center justify-center gap-1.5 rounded-[10px] border px-1.5 py-1.5 text-[10px] transition-[background-color,color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] cursor-pointer ${
                  active
                    ? "border-primary/70 bg-accent text-accent-foreground font-medium"
                    : "border-border bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: opt.swatch }}
                />
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
        <span className="text-[11px] text-foreground/80">Largura do painel</span>
        <div className="grid grid-cols-3 gap-1.5">
          {SIZE_OPTIONS.map((opt) => {
            const active = appearance.panelSize === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => onUpdateAppearance({ panelSize: opt.id })}
                className={`rounded-[10px] border py-1.5 text-[11px] transition-[background-color,color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] cursor-pointer ${
                  active
                    ? "border-primary/70 bg-accent text-accent-foreground font-medium"
                    : "border-border bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-border pt-2.5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="dock-expanded-opacity-slider"
              className="text-[11px] text-foreground"
            >
              Opacidade expandido
            </label>
            <span className="tabular-nums font-mono text-[11px] text-accent-foreground">
              {appearance.expandedOpacity}%
            </span>
          </div>
          <input
            id="dock-expanded-opacity-slider"
            type="range"
            min={MIN_DOCK_OPACITY}
            max={MAX_DOCK_OPACITY}
            step={1}
            value={appearance.expandedOpacity}
            aria-label="Opacidade expandido"
            onChange={(e) =>
              onUpdateAppearance({ expandedOpacity: Number(e.target.value) })
            }
            style={{
              background: `linear-gradient(to right, var(--primary) ${expandedProgress}%, var(--secondary) ${expandedProgress}%)`,
            }}
            className="dock-range h-1.5 w-full cursor-pointer appearance-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="dock-collapsed-opacity-slider"
              className="text-[11px] text-foreground"
            >
              Opacidade retraído
            </label>
            <span className="tabular-nums font-mono text-[11px] text-accent-foreground">
              {appearance.collapsedOpacity}%
            </span>
          </div>
          <input
            id="dock-collapsed-opacity-slider"
            type="range"
            min={MIN_DOCK_OPACITY}
            max={MAX_DOCK_OPACITY}
            step={1}
            value={appearance.collapsedOpacity}
            aria-label="Opacidade retraído"
            onChange={(e) =>
              onUpdateAppearance({ collapsedOpacity: Number(e.target.value) })
            }
            style={{
              background: `linear-gradient(to right, var(--primary) ${collapsedProgress}%, var(--secondary) ${collapsedProgress}%)`,
            }}
            className="dock-range h-1.5 w-full cursor-pointer appearance-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          />
        </div>
      </div>
    </section>
  );
}
