import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Loader2,
  RotateCw,
  Search,
  Send,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DealSummary, PipedriveSendType } from "../lib/bridge";

export type PipedriveDispatchState =
  | { kind: "idle" }
  | { kind: "sending"; type: PipedriveSendType; todoId?: string }
  | { kind: "sent"; type: PipedriveSendType; message: string }
  | {
      kind: "error";
      type: PipedriveSendType;
      todoId?: string;
      message: string;
    };

interface PipedriveBarProps {
  dealId: number | null;
  linkedDeal: DealSummary | null;
  pendingActivityCount: number;
  dispatchState: PipedriveDispatchState;
  onSearchDeals: (query: string) => Promise<DealSummary[]>;
  onSelectDeal: (deal: DealSummary | null) => void;
  onSend: (type: PipedriveSendType, todoId?: string) => void;
}

const SEARCH_DEBOUNCE_MS = 250;

export function PipedriveBar({
  dealId,
  linkedDeal,
  pendingActivityCount,
  dispatchState,
  onSearchDeals,
  onSelectDeal,
  onSend,
}: PipedriveBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DealSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchSeqRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery("");
    setResults([]);
    setSearchError(null);
    setDropdownOpen(false);
  }, [dealId]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      searchSeqRef.current += 1;
      setResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const seq = ++searchSeqRef.current;
    setIsSearching(true);
    setSearchError(null);

    const timer = setTimeout(() => {
      void onSearchDeals(trimmed)
        .then((deals) => {
          if (searchSeqRef.current !== seq) return;
          setResults(deals);
          setDropdownOpen(true);
        })
        .catch((err) => {
          if (searchSeqRef.current !== seq) return;
          const message = err instanceof Error ? err.message : String(err);
          setResults([]);
          setSearchError(message);
          setDropdownOpen(true);
        })
        .finally(() => {
          if (searchSeqRef.current === seq) {
            setIsSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, onSearchDeals]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const isSending = dispatchState.kind === "sending";

  return (
    <section
      ref={containerRef}
      aria-label="Integração Pipedrive"
      className="flex shrink-0 flex-col gap-1.5 rounded-[14px] border border-border bg-card p-2"
    >
      {dealId !== null ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
              <Briefcase className="h-3.5 w-3.5 shrink-0 text-accent-foreground" />
              <span className="tabular-nums shrink-0 rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent-foreground">
                #{dealId}
              </span>
              <span className="truncate font-medium text-foreground">
                {linkedDeal ? linkedDeal.title : `Negócio #${dealId}`}
              </span>
              {linkedDeal?.orgName && (
                <span className="truncate text-muted-foreground">
                  · {linkedDeal.orgName}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onSelectDeal(null)}
              disabled={isSending}
              aria-label="Desvincular negócio do Pipedrive"
              title="Desvincular negócio"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-muted-foreground transition-[background-color,color] duration-150 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSend("note")}
              disabled={isSending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[9px] bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:opacity-60 cursor-pointer"
            >
              {isSending && dispatchState.type === "note" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              <span>Enviar nota</span>
            </button>

            <button
              type="button"
              onClick={() => onSend("activity")}
              disabled={isSending || pendingActivityCount === 0}
              title={
                pendingActivityCount === 0
                  ? "Nenhuma tarefa pendente sem envio nesta nota"
                  : `Criar ${pendingActivityCount} atividade(s) no Pipedrive`
              }
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-border bg-secondary px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-[background-color,border-color,transform] duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {isSending &&
              dispatchState.type === "activity" &&
              !dispatchState.todoId ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              <span className="tabular-nums">
                Atividades ({pendingActivityCount})
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-1.5 rounded-[10px] border border-input bg-secondary px-2.5 py-1.5 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/40">
            {isSearching ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (results.length > 0 || searchError) {
                  setDropdownOpen(true);
                }
              }}
              placeholder="Vincular negócio no Pipedrive..."
              aria-label="Buscar negócio no Pipedrive"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground placeholder:text-foreground/55 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setSearchError(null);
                  setDropdownOpen(false);
                }}
                aria-label="Limpar busca de negócio"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {dropdownOpen && (
            <div
              role="listbox"
              aria-label="Resultados de negócios no Pipedrive"
              className="absolute right-0 left-0 z-20 mt-1 max-h-40 overflow-y-auto rounded-[10px] border border-border bg-popover p-1 shadow-xl"
            >
              {searchError ? (
                <div className="flex items-start gap-1.5 px-2 py-1.5 text-[11px] text-status-danger">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{searchError}</span>
                </div>
              ) : results.length === 0 ? (
                <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  Nenhum negócio encontrado para "{query.trim()}".
                </div>
              ) : (
                results.map((deal) => (
                  <button
                    key={deal.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      onSelectDeal(deal);
                      setDropdownOpen(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-[7px] px-2 py-1.5 text-left text-[11px] transition-[background-color] duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">
                        {deal.title}
                      </div>
                      {deal.orgName && (
                        <div className="truncate text-[10px] text-muted-foreground">
                          {deal.orgName}
                        </div>
                      )}
                    </div>
                    <span className="tabular-nums shrink-0 font-mono text-[10px] text-muted-foreground">
                      #{deal.id}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {dispatchState.kind === "sent" && (
        <div
          role="status"
          className="flex items-center gap-1.5 rounded-[8px] border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[11px] text-status-success"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{dispatchState.message}</span>
        </div>
      )}

      {dispatchState.kind === "error" && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-[8px] border border-destructive/40 bg-destructive/15 px-2 py-1 text-[11px] text-status-danger"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={dispatchState.message}>
              {dispatchState.message}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSend(dispatchState.type, dispatchState.todoId)}
            className="flex shrink-0 items-center gap-1 rounded-[6px] border border-destructive/50 bg-destructive/25 px-2 py-0.5 text-[10px] font-medium text-status-danger transition-[background-color,transform] duration-150 hover:bg-destructive/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] cursor-pointer"
          >
            <RotateCw className="h-2.5 w-2.5" />
            <span>Reenviar</span>
          </button>
        </div>
      )}
    </section>
  );
}
