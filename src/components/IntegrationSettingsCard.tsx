import { Check, KeyRound, Plug } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type {
  IntegrationSettings,
  SetIntegrationSettingsInput,
} from "../lib/bridge";

interface IntegrationSettingsCardProps {
  settings: IntegrationSettings;
  onSaveSettings: (input: SetIntegrationSettingsInput) => Promise<void>;
}

export function IntegrationSettingsCard({
  settings,
  onSaveSettings,
}: IntegrationSettingsCardProps) {
  const [pipedriveApiBase, setPipedriveApiBase] = useState(
    settings.pipedriveApiBase
  );
  const [pipedriveApiToken, setPipedriveApiToken] = useState("");
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState(settings.n8nWebhookUrl);
  const [n8nWebhookSecret, setN8nWebhookSecret] = useState("");
  const [supabaseUrl, setSupabaseUrl] = useState(settings.supabaseUrl);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "saved" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setPipedriveApiBase(settings.pipedriveApiBase);
    setN8nWebhookUrl(settings.n8nWebhookUrl);
    setSupabaseUrl(settings.supabaseUrl);
  }, [
    settings.pipedriveApiBase,
    settings.n8nWebhookUrl,
    settings.supabaseUrl,
  ]);

  const pipedriveReady =
    settings.pipedriveApiBase.trim().length > 0 && settings.hasPipedriveToken;
  const n8nReady = settings.n8nWebhookUrl.trim().length > 0;
  const supabaseReady =
    settings.supabaseUrl.trim().length > 0 && settings.hasSupabaseKey;
  const configuredCount =
    Number(pipedriveReady) + Number(n8nReady) + Number(supabaseReady);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await onSaveSettings({
        pipedriveApiBase: pipedriveApiBase.trim(),
        pipedriveApiToken: pipedriveApiToken.trim() || undefined,
        n8nWebhookUrl: n8nWebhookUrl.trim(),
        n8nWebhookSecret: n8nWebhookSecret.trim() || undefined,
        supabaseUrl: supabaseUrl.trim(),
        supabaseAnonKey: supabaseAnonKey.trim() || undefined,
      });
      setPipedriveApiToken("");
      setN8nWebhookSecret("");
      setSupabaseAnonKey("");
      setFeedback({
        kind: "saved",
        text: "Integrações salvas no SQLite.",
      });
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClearSecret = async (
    target: "pipedrive" | "n8n" | "supabase"
  ) => {
    setSaving(true);
    setFeedback(null);
    try {
      if (target === "pipedrive") {
        await onSaveSettings({ clearPipedriveToken: true });
        setPipedriveApiToken("");
        setFeedback({ kind: "saved", text: "Token Pipedrive removido." });
      } else if (target === "n8n") {
        await onSaveSettings({ clearN8nSecret: true });
        setN8nWebhookSecret("");
        setFeedback({ kind: "saved", text: "Secret n8n removido." });
      } else {
        await onSaveSettings({ clearSupabaseKey: true });
        setSupabaseAnonKey("");
        setFeedback({ kind: "saved", text: "Chave Supabase removida." });
      }
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-[8px] border border-border bg-secondary px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-foreground/50 focus:border-ring focus:ring-1 focus:ring-ring/40 focus:outline-none";

  return (
    <section
      aria-label="Integrações"
      className="rounded-[16px] border border-border bg-card p-3"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Plug className="h-3.5 w-3.5 text-foreground/75" />
          <span>Integrações</span>
        </div>
        <span
          className={`tabular-nums rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
            configuredCount > 0
              ? "bg-emerald-500/15 text-status-success"
              : "bg-amber-500/15 text-status-warning"
          }`}
        >
          {configuredCount}/3 prontas
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-foreground/90">
              Pipedrive
            </span>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                pipedriveReady
                  ? "bg-emerald-500/15 text-status-success"
                  : "bg-amber-500/15 text-status-warning"
              }`}
            >
              {pipedriveReady ? "Configurado" : "Pendente"}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="integration-pipedrive-base"
              className="px-0.5 text-[10px] text-foreground/75"
            >
              URL base Pipedrive
            </label>
            <input
              id="integration-pipedrive-base"
              type="url"
              value={pipedriveApiBase}
              onChange={(e) => setPipedriveApiBase(e.target.value)}
              placeholder="https://api.pipedrive.com/v1"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-0.5">
              <label
                htmlFor="integration-pipedrive-token"
                className="text-[10px] text-foreground/75"
              >
                Token API Pipedrive
              </label>
              {settings.hasPipedriveToken && (
                <span className="inline-flex items-center gap-1 text-[10px] text-status-success">
                  <KeyRound className="h-2.5 w-2.5" />
                  Salvo no backend
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                id="integration-pipedrive-token"
                type="password"
                value={pipedriveApiToken}
                onChange={(e) => setPipedriveApiToken(e.target.value)}
                placeholder={
                  settings.hasPipedriveToken
                    ? "Salvo no SQLite (digite para substituir)"
                    : "Cole o token da API"
                }
                className={inputClass}
              />
              {settings.hasPipedriveToken && (
                <button
                  type="button"
                  disabled={saving}
                  aria-label="Limpar token Pipedrive"
                  onClick={() => void handleClearSecret("pipedrive")}
                  className="shrink-0 rounded-[8px] border border-border bg-secondary px-2 py-1.5 text-[10px] text-foreground/85 transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:opacity-50 cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-foreground/90">
              n8n
            </span>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                n8nReady
                  ? "bg-emerald-500/15 text-status-success"
                  : "bg-amber-500/15 text-status-warning"
              }`}
            >
              {n8nReady ? "Configurado" : "Pendente"}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="integration-n8n-url"
              className="px-0.5 text-[10px] text-foreground/75"
            >
              URL webhook n8n
            </label>
            <input
              id="integration-n8n-url"
              type="url"
              value={n8nWebhookUrl}
              onChange={(e) => setN8nWebhookUrl(e.target.value)}
              placeholder="https://n8n.suaempresa.com/webhook/quicknote"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-0.5">
              <label
                htmlFor="integration-n8n-secret"
                className="text-[10px] text-foreground/75"
              >
                Secret webhook n8n (opcional)
              </label>
              {settings.hasN8nSecret && (
                <span className="inline-flex items-center gap-1 text-[10px] text-status-success">
                  <KeyRound className="h-2.5 w-2.5" />
                  Salvo no backend
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                id="integration-n8n-secret"
                type="password"
                value={n8nWebhookSecret}
                onChange={(e) => setN8nWebhookSecret(e.target.value)}
                placeholder={
                  settings.hasN8nSecret
                    ? "Salvo no SQLite (digite para substituir)"
                    : "Header X-Webhook-Secret opcional"
                }
                className={inputClass}
              />
              {settings.hasN8nSecret && (
                <button
                  type="button"
                  disabled={saving}
                  aria-label="Limpar secret n8n"
                  onClick={() => void handleClearSecret("n8n")}
                  className="shrink-0 rounded-[8px] border border-border bg-secondary px-2 py-1.5 text-[10px] text-foreground/85 transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:opacity-50 cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-foreground/90">
              Supabase
            </span>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                supabaseReady
                  ? "bg-emerald-500/15 text-status-success"
                  : "bg-amber-500/15 text-status-warning"
              }`}
            >
              {supabaseReady ? "Configurado" : "Pendente"}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="integration-supabase-url"
              className="px-0.5 text-[10px] text-foreground/75"
            >
              URL projeto Supabase
            </label>
            <input
              id="integration-supabase-url"
              type="url"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://projeto.supabase.co"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-0.5">
              <label
                htmlFor="integration-supabase-key"
                className="text-[10px] text-foreground/75"
              >
                Chave anon Supabase
              </label>
              {settings.hasSupabaseKey && (
                <span className="inline-flex items-center gap-1 text-[10px] text-status-success">
                  <KeyRound className="h-2.5 w-2.5" />
                  Salvo no backend
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                id="integration-supabase-key"
                type="password"
                value={supabaseAnonKey}
                onChange={(e) => setSupabaseAnonKey(e.target.value)}
                placeholder={
                  settings.hasSupabaseKey
                    ? "Salvo no SQLite (digite para substituir)"
                    : "Cole a chave anon/PostgREST"
                }
                className={inputClass}
              />
              {settings.hasSupabaseKey && (
                <button
                  type="button"
                  disabled={saving}
                  aria-label="Limpar chave Supabase"
                  onClick={() => void handleClearSecret("supabase")}
                  className="shrink-0 rounded-[8px] border border-border bg-secondary px-2 py-1.5 text-[10px] text-foreground/85 transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:opacity-50 cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        </div>

        {feedback && (
          <p
            role={feedback.kind === "error" ? "alert" : "status"}
            className={
              feedback.kind === "error"
                ? "rounded-md border border-destructive/40 bg-background/70 px-2 py-1 text-[11px] text-status-danger"
                : "px-0.5 text-[11px] text-status-success"
            }
          >
            {feedback.text}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-[8px] bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground transition-[background-color,color,transform] duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:opacity-50 cursor-pointer"
        >
          <Check className="h-3.5 w-3.5" />
          <span>{saving ? "Salvando..." : "Salvar integrações"}</span>
        </button>
      </form>
    </section>
  );
}
