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
    <section className="rounded-[18px] border border-white/[0.07] bg-black/20 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
          <User className="h-3.5 w-3.5 text-zinc-400" />
          <span>Perfil CS ativo</span>
        </div>
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
            profile.isConfigured
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-amber-500/15 text-amber-300"
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
              className="px-0.5 text-[10px] text-zinc-400"
            >
              ID do CS
            </label>
            <input
              id="cs-author-id"
              type="text"
              value={authorId}
              onChange={(e) => setAuthorId(e.target.value)}
              placeholder="cs-01"
              className="w-full rounded-[8px] border border-white/[0.07] bg-black/30 px-2.5 py-1.5 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-white/[0.18] focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="cs-author-name"
              className="px-0.5 text-[10px] text-zinc-400"
            >
              Nome exibido
            </label>
            <input
              id="cs-author-name"
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Ana Paula"
              className="w-full rounded-[8px] border border-white/[0.07] bg-black/30 px-2.5 py-1.5 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-white/[0.18] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-0.5">
            <label
              htmlFor="cs-token"
              className="text-[10px] text-zinc-400"
            >
              Token CS (opcional)
            </label>
            {profile.hasToken && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
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
            className="w-full rounded-[8px] border border-white/[0.07] bg-black/30 px-2.5 py-1.5 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-white/[0.18] focus:outline-none"
          />
        </div>

        {feedback && (
          <p
            className={`px-0.5 text-[11px] ${
              feedback.kind === "error" ? "text-rose-300" : "text-emerald-300"
            }`}
          >
            {feedback.text}
          </p>
        )}

        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="submit"
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-emerald-500/15 px-3 py-1.5 text-[11px] font-medium text-emerald-200 transition-[background-color,color,transform] duration-150 hover:bg-emerald-500/25 active:scale-[0.96] disabled:opacity-50 cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            <span>{saving ? "Salvando..." : "Salvar perfil"}</span>
          </button>

          {profile.hasToken && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleClearToken()}
              className="rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-zinc-300 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.08] hover:text-zinc-100 active:scale-[0.96] disabled:opacity-50 cursor-pointer"
            >
              Limpar token
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
