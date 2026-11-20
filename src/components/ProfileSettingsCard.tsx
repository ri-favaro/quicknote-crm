import { Check, KeyRound, User } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { ActiveProfile, SetActiveProfileInput } from "../lib/bridge";

interface ProfileSettingsCardProps {
  profile: ActiveProfile;
  onSaveProfile: (input: SetActiveProfileInput) => Promise<void>;
}

export function ProfileSettingsCard({
  profile,
  onSaveProfile,
}: ProfileSettingsCardProps) {
  const [authorId, setAuthorId] = useState(
    profile.isConfigured ? profile.authorId : ""
  );
  const [authorName, setAuthorName] = useState(
    profile.isConfigured ? profile.authorName : ""
  );
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "saved" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setAuthorId(profile.isConfigured ? profile.authorId : "");
    setAuthorName(profile.isConfigured ? profile.authorName : "");
  }, [profile.authorId, profile.authorName, profile.isConfigured]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedId = authorId.trim();
    const trimmedName = authorName.trim();
    if (!trimmedId || !trimmedName) {
      setFeedback({
        kind: "error",
        text: "Preencha o ID e o nome do CS.",
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      await onSaveProfile({
        authorId: trimmedId,
        authorName: trimmedName,
        token: token.trim() ? token.trim() : undefined,
      });
      setToken("");
      setFeedback({ kind: "saved", text: "Perfil salvo no SQLite." });
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClearToken = async () => {
    const trimmedId = authorId.trim() || profile.authorId;
    const trimmedName = authorName.trim() || profile.authorName;
    if (!trimmedId || !trimmedName) return;

    setSaving(true);
    setFeedback(null);
    try {
      await onSaveProfile({
        authorId: trimmedId,
        authorName: trimmedName,
        clearToken: true,
      });
      setToken("");
      setFeedback({ kind: "saved", text: "Token removido do backend." });
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[18px] border border-border bg-card p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <User className="h-3.5 w-3.5 text-foreground/75" />
          <span>Perfil CS ativo</span>
        </div>
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
            profile.isConfigured
              ? "bg-emerald-500/15 text-status-success"
              : "bg-amber-500/15 text-status-warning"
          }`}
        >
          {profile.isConfigured ? "Configurado" : "Padrão local"}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="cs-author-id"
              className="px-0.5 text-[10px] text-foreground/75"
            >
              ID do CS
            </label>
            <input
              id="cs-author-id"
              type="text"
              value={authorId}
              onChange={(e) => setAuthorId(e.target.value)}
              placeholder="cs-01"
              className="w-full rounded-[8px] border border-border bg-secondary px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-foreground/50 focus:border-ring focus:ring-1 focus:ring-ring/40 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="cs-author-name"
              className="px-0.5 text-[10px] text-foreground/75"
            >
              Nome exibido
            </label>
            <input
              id="cs-author-name"
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Ana Paula"
              className="w-full rounded-[8px] border border-border bg-secondary px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-foreground/50 focus:border-ring focus:ring-1 focus:ring-ring/40 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-0.5">
            <label
              htmlFor="cs-token"
              className="text-[10px] text-foreground/75"
            >
              Token CS (opcional)
            </label>
            {profile.hasToken && (
              <span className="inline-flex items-center gap-1 text-[10px] text-status-success">
                <KeyRound className="h-2.5 w-2.5" />
                Salvo no backend
              </span>
            )}
          </div>
          <input
            id="cs-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              profile.hasToken
                ? "Salvo no SQLite (digite para substituir)"
                : "Token identificador opcional"
            }
            className="w-full rounded-[8px] border border-border bg-secondary px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-foreground/50 focus:border-ring focus:ring-1 focus:ring-ring/40 focus:outline-none"
          />
        </div>

        {feedback && (
          <p
            className={
              feedback.kind === "error"
                ? "rounded-md border border-destructive/40 bg-background/70 px-2 py-1 text-[11px] text-status-danger"
                : "px-0.5 text-[11px] text-status-success"
            }
          >
            {feedback.text}
          </p>
        )}

        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="submit"
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground transition-[background-color,color,transform] duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:opacity-50 cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            <span>{saving ? "Salvando..." : "Salvar perfil"}</span>
          </button>

          {profile.hasToken && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleClearToken()}
              className="rounded-[8px] border border-border bg-secondary px-2.5 py-1.5 text-[11px] text-foreground/85 transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:opacity-50 cursor-pointer"
            >
              Limpar token
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
