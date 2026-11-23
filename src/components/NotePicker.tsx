import { Briefcase, List, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Note } from "../lib/bridge";

interface NotePickerProps {
  notes: Note[];
  activeNoteId: string;
  onSelectNote: (id: string) => void;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function noteSnippet(contentMd: string): string {
  const line = contentMd
    .split("\n")
    .map((l) => l.replace(/^\s*(#+|[-*+]\s+\[[ xX]\]|[-*+>]|\d+\.)\s*/, "").trim())
    .find((l) => l.length > 0);
  return line ?? "";
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;

  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  if (date >= startOfToday) return `hoje ${time}`;
  if (date >= startOfYesterday) return `ontem ${time}`;

  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${day} ${time}`;
}

export function filterNotes(notes: Note[], query: string): Note[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return notes;
  return notes.filter((note) => {
    const haystack = normalize(`${note.title}\n${note.contentMd}`);
    return terms.every((term) => haystack.includes(term));
  });
}

export function NotePicker({ notes, activeNoteId, onSelectNote }: NotePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = filterNotes(notes, query);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  const close = () => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  const select = (id: string) => {
    onSelectNote(id);
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const note = results[highlighted];
      if (note) select(note.id);
    }
  };

  const optionId = (index: number) => `${listId}-opt-${index}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        title="Buscar notas"
        aria-label={`Buscar notas (${notes.length})`}
        aria-expanded={open}
        className={`flex h-9 shrink-0 items-center gap-1 rounded-[12px] border px-2 text-[11px] tabular-nums transition-[background-color,color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] cursor-pointer ${
          open
            ? "border-primary/50 bg-accent text-accent-foreground"
            : "border-border bg-secondary text-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        <List className="h-3.5 w-3.5" />
        {notes.length}
      </button>

      {open && (
        <div className="order-last basis-full rounded-[12px] border border-border bg-secondary p-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results[highlighted] ? optionId(highlighted) : undefined}
              aria-label="Buscar por título ou conteúdo"
              placeholder="Buscar por título ou conteúdo..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-lg border border-input bg-background py-1.5 pl-8 pr-2 text-[12px] text-foreground placeholder:text-foreground/55 focus:border-ring focus:ring-1 focus:ring-ring/40 focus:outline-none"
            />
          </div>

          {results.length === 0 ? (
            <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
              Nenhuma nota encontrada.
            </p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Notas" className="mt-1.5 max-h-60 overflow-y-auto">
              {results.map((note, index) => {
                const snippet = noteSnippet(note.contentMd);
                const isActive = note.id === activeNoteId;
                const isHighlighted = index === highlighted;
                return (
                  <li
                    key={note.id}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isHighlighted}
                    aria-current={isActive || undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => select(note.id)}
                    className={`cursor-pointer rounded-lg px-2 py-1.5 ${
                      isHighlighted ? "bg-accent text-accent-foreground" : "text-foreground"
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[12px] ${isActive ? "font-semibold" : "font-medium"}`}>
                        {note.title.trim() || "Sem título"}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {formatRelativeTime(note.updatedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate">{snippet || "Nota vazia"}</span>
                      {note.pipedriveDealId !== null && (
                        <span
                          className="flex shrink-0 items-center gap-0.5 text-[10px]"
                          title={`Vinculada ao deal #${note.pipedriveDealId}`}
                        >
                          <Briefcase className="h-3 w-3" />#{note.pipedriveDealId}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
