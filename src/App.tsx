import { useEffect, useRef, useState } from "react";
import { Command, Plus } from "lucide-react";
import { DockHeader } from "./components/DockHeader";
import {
  getDockState,
  hideDock,
  isTauriRuntime,
  onDockNewNote,
  onDockStateChanged,
  setAlwaysOnTop,
  snapDock,
  type DockAnchor,
  type DockState,
} from "./lib/bridge";

const ANCHOR_LABELS: Record<DockAnchor, string> = {
  "top-left": "Topo esquerdo",
  "top-center": "Topo centro",
  "top-right": "Topo direito",
  "bottom-left": "Base esquerda",
  "bottom-right": "Base direita",
};

export default function App() {
  const [dock, setDock] = useState<DockState>({
    anchor: "top-right",
    alwaysOnTop: true,
    visible: true,
    shortcuts: { toggle: "Alt+Space", newNote: "Ctrl+Shift+N" },
  });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    getDockState()
      .then((state) => {
        if (active) setDock(state);
      })
      .catch(() => {});

    const cleanups: Array<() => void> = [];

    onDockNewNote(() => {
      setTitle("");
      setBody("");
      setStatusNotice("Nova nota pronta (Ctrl+Shift+N)");
      requestAnimationFrame(() => titleInputRef.current?.focus());
    }).then((unlisten) => cleanups.push(unlisten));

    onDockStateChanged((next) => {
      if (active) setDock(next);
    }).then((unlisten) => cleanups.push(unlisten));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hideDock().catch(() => {});
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      active = false;
      window.removeEventListener("keydown", handleKeyDown);
      cleanups.forEach((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!statusNotice) return;
    const timer = window.setTimeout(() => setStatusNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [statusNotice]);

  async function handleSnap(anchor: DockAnchor) {
    const next = await snapDock(anchor);
    setDock(next);
    setStatusNotice(`Ancorado em ${ANCHOR_LABELS[anchor]}`);
  }

  async function handleTogglePin() {
    const next = await setAlwaysOnTop(!dock.alwaysOnTop);
    setDock(next);
    setStatusNotice(next.alwaysOnTop ? "Fixado no topo" : "Solto no fundo");
  }

  function handleResetDraft() {
    setTitle("");
    setBody("");
    setStatusNotice("Rascunho limpo");
    titleInputRef.current?.focus();
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl">
      <DockHeader
        anchor={dock.anchor}
        alwaysOnTop={dock.alwaysOnTop}
        onSnap={handleSnap}
        onTogglePin={handleTogglePin}
        onHide={() => void hideDock()}
      />

      <main className="flex flex-1 flex-col gap-3 p-3.5 min-h-0">
        <div className="flex items-center justify-between gap-2">
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título da reunião ou conta..."
            className="w-full bg-transparent text-sm font-medium text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleResetDraft}
            title="Nova nota"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-100 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"Anote pontos da call ou tarefas rápidas:\n- [ ] Próximo passo com o cliente\n- Decisões e riscos"}
          className="flex-1 w-full resize-none rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3 text-[13px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
        />

        <div className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-2.5 py-2 text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5">
            <Command className="h-3 w-3 text-zinc-500" />
            <span>{dock.shortcuts.toggle}</span>
            <span className="text-zinc-700">·</span>
            <span>{dock.shortcuts.newNote}</span>
          </div>
          <span className="text-zinc-500">{ANCHOR_LABELS[dock.anchor]}</span>
        </div>
      </main>

      <footer className="flex items-center justify-between border-t border-zinc-800/80 bg-zinc-900/70 px-3.5 py-2 text-[11px] text-zinc-500">
        <span className="truncate">
          {statusNotice ??
            (isTauriRuntime()
              ? "Rascunho em memória · SQLite no próximo marco"
              : "Preview web · execute pnpm tauri dev para o dock nativo")}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-zinc-600">
          v0.1
        </span>
      </footer>
    </div>
  );
}