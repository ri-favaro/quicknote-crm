import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActiveProfile, DockState, Note, Todo } from "./bridge";

const invokeMock = vi.fn();
const listenMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

function setTauriInternals(enabled: boolean) {
  const target = window as unknown as Record<string, unknown>;
  if (enabled) {
    target.__TAURI_INTERNALS__ = {};
  } else {
    delete target.__TAURI_INTERNALS__;
  }
}

afterEach(() => {
  setTauriInternals(false);
  invokeMock.mockReset();
  listenMock.mockReset();
  vi.resetModules();
});

describe("bridge (modo web/mock)", () => {
  it("detecta ambiente fora do Tauri e preserva estado mutável do dock entre chamadas", async () => {
    const bridge = await import("./bridge");
    bridge.resetMockStore();

    expect(bridge.isTauriRuntime()).toBe(false);

    const initial = await bridge.getDockState();
    expect(initial).toEqual({
      edge: "right",
      expanded: false,
      alwaysOnTop: true,
      visible: true,
      shortcuts: { toggle: "Alt+Space", newNote: "Ctrl+Shift+N" },
    });

    const expanded = await bridge.setDockExpanded(true);
    expect(expanded.expanded).toBe(true);
    expect(expanded.edge).toBe("right");

    const movedLeft = await bridge.setDockEdge("left");
    expect(movedLeft.edge).toBe("left");
    expect(movedLeft.expanded).toBe(true);

    const unpinned = await bridge.setAlwaysOnTop(false);
    expect(unpinned.alwaysOnTop).toBe(false);
    expect(unpinned.edge).toBe("left");
    expect(unpinned.expanded).toBe(true);

    const collapsed = await bridge.toggleDockExpanded();
    expect(collapsed.expanded).toBe(false);
    expect(collapsed.visible).toBe(true);

    await bridge.hideDock();
    const afterHide = await bridge.getDockState();
    expect(afterHide.visible).toBe(false);

    const reopened = await bridge.setDockExpanded(true);
    expect(reopened.visible).toBe(true);
    expect(reopened.expanded).toBe(true);

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("reabre expandido em toggleDockExpanded quando oculto mesmo se já estava expandido", async () => {
    const bridge = await import("./bridge");
    bridge.resetMockStore();

    await bridge.setDockExpanded(true);
    await bridge.hideDock();

    const toggled = await bridge.toggleDockExpanded();
    expect(toggled.visible).toBe(true);
    expect(toggled.expanded).toBe(true);
  });

  it("retorna funções unlisten no-op para listeners fora do Tauri", async () => {
    const bridge = await import("./bridge");

    const unlistenNew = await bridge.onDockNewNote(() => {});
    const unlistenState = await bridge.onDockStateChanged(() => {});

    expect(typeof unlistenNew).toBe("function");
    expect(typeof unlistenState).toBe("function");
    expect(() => unlistenNew()).not.toThrow();
    expect(() => unlistenState()).not.toThrow();
    expect(listenMock).not.toHaveBeenCalled();
  });

  it("gerencia perfil CS write-only, notas, to-dos com prazo e cascade delete no mock", async () => {
    const bridge = await import("./bridge");
    bridge.resetMockStore();

    const fallback = await bridge.getActiveProfile();
    expect(fallback).toEqual({
      authorId: "local-cs",
      authorName: "CS Local",
      hasToken: false,
      isConfigured: false,
    });

    await expect(
      bridge.setActiveProfile({ authorId: "  ", authorName: "Ana" })
    ).rejects.toThrow("ID do CS é obrigatório.");

    const savedProfile = await bridge.setActiveProfile({
      authorId: "cs-ana",
      authorName: "Ana Paula",
      token: "segredo-local",
    });
    expect(savedProfile).toEqual({
      authorId: "cs-ana",
      authorName: "Ana Paula",
      hasToken: true,
      isConfigured: true,
    });
    expect("token" in savedProfile).toBe(false);

    const preserved = await bridge.setActiveProfile({
      authorId: "cs-ana",
      authorName: "Ana Paula Silva",
    });
    expect(preserved.hasToken).toBe(true);

    const cleared = await bridge.setActiveProfile({
      authorId: "cs-ana",
      authorName: "Ana Paula Silva",
      clearToken: true,
    });
    expect(cleared.hasToken).toBe(false);

    const note = await bridge.saveNoteDraft({
      id: "note-1",
      title: "Onboarding Acme",
      contentMd: "## Decisões",
    });
    expect(note.authorId).toBe("cs-ana");
    expect(note.authorName).toBe("Ana Paula Silva");

    const fetched = await bridge.getNote("note-1");
    expect(fetched?.title).toBe("Onboarding Acme");

    await expect(
      bridge.upsertTodo({ noteId: "inexistente", text: "Sem pai" })
    ).rejects.toThrow("Nota vinculada não encontrada.");

    await expect(
      bridge.upsertTodo({ noteId: "note-1", text: "Prazo inválido", dueDate: "2026-02-30" })
    ).rejects.toThrow("Prazo inválido");

    const todo = await bridge.upsertTodo({
      noteId: "note-1",
      text: "Enviar proposta",
      dueDate: "2026-11-25",
    });
    expect(todo.done).toBe(false);
    expect(todo.dueDate).toBe("2026-11-25");

    const toggled = await bridge.toggleTodo(todo.id);
    expect(toggled.done).toBe(true);

    expect(await bridge.listTodos("note-1")).toHaveLength(1);
    expect(await bridge.deleteNote("note-1")).toBe(true);
    expect(await bridge.listNotes()).toEqual([]);
    expect(await bridge.listTodos()).toEqual([]);
  });
});

describe("bridge (modo Tauri IPC)", () => {
  it("encaminha comandos IPC de dock e persistência com argumentos exatos", async () => {
    setTauriInternals(true);
    const bridge = await import("./bridge");
    expect(bridge.isTauriRuntime()).toBe(true);

    const rustState: DockState = {
      edge: "top",
      expanded: true,
      alwaysOnTop: false,
      visible: true,
      shortcuts: { toggle: "Alt+Space", newNote: "Ctrl+Shift+N" },
    };

    invokeMock.mockResolvedValue(rustState);

    await expect(bridge.getDockState()).resolves.toEqual(rustState);
    expect(invokeMock).toHaveBeenLastCalledWith("get_dock_state");

    await expect(bridge.setDockEdge("top")).resolves.toEqual(rustState);
    expect(invokeMock).toHaveBeenLastCalledWith("set_dock_edge", { edge: "top" });

    await expect(bridge.setDockExpanded(true)).resolves.toEqual(rustState);
    expect(invokeMock).toHaveBeenLastCalledWith("set_dock_expanded", { expanded: true });

    await expect(bridge.toggleDockExpanded()).resolves.toEqual(rustState);
    expect(invokeMock).toHaveBeenLastCalledWith("toggle_dock_expanded");

    await expect(bridge.setAlwaysOnTop(false)).resolves.toEqual(rustState);
    expect(invokeMock).toHaveBeenLastCalledWith("set_always_on_top", { enabled: false });

    invokeMock.mockResolvedValueOnce(undefined);
    await bridge.hideDock();
    expect(invokeMock).toHaveBeenLastCalledWith("hide_dock");

    const notePayload: Note = {
      id: "n-1",
      authorId: "cs-01",
      authorName: "Ana",
      title: "Call",
      contentMd: "Resumo",
      pipedriveDealId: null,
      pipedrivePersonId: null,
      createdAt: "2026-11-19T10:00:00Z",
      updatedAt: "2026-11-19T10:00:00Z",
      syncedAt: null,
    };

    invokeMock.mockResolvedValueOnce(notePayload);
    await expect(
      bridge.saveNoteDraft({ id: "n-1", title: "Call", contentMd: "Resumo" })
    ).resolves.toEqual(notePayload);
    expect(invokeMock).toHaveBeenLastCalledWith("save_note_draft", {
      note: { id: "n-1", title: "Call", contentMd: "Resumo" },
    });

    invokeMock.mockResolvedValueOnce([notePayload]);
    await expect(bridge.listNotes()).resolves.toEqual([notePayload]);
    expect(invokeMock).toHaveBeenLastCalledWith("list_notes");

    invokeMock.mockResolvedValueOnce(notePayload);
    await expect(bridge.getNote("n-1")).resolves.toEqual(notePayload);
    expect(invokeMock).toHaveBeenLastCalledWith("get_note", { id: "n-1" });

    invokeMock.mockResolvedValueOnce(true);
    await expect(bridge.deleteNote("n-1")).resolves.toBe(true);
    expect(invokeMock).toHaveBeenLastCalledWith("delete_note", { id: "n-1" });

    const todoPayload: Todo = {
      id: "t-1",
      noteId: "n-1",
      text: "Follow-up",
      done: false,
      dueDate: "2026-11-25",
      pipedriveActivityId: null,
    };

    invokeMock.mockResolvedValueOnce([todoPayload]);
    await expect(bridge.listTodos()).resolves.toEqual([todoPayload]);
    expect(invokeMock).toHaveBeenLastCalledWith("list_todos", { noteId: null });

    invokeMock.mockResolvedValueOnce([todoPayload]);
    await expect(bridge.listTodos("n-1")).resolves.toEqual([todoPayload]);
    expect(invokeMock).toHaveBeenLastCalledWith("list_todos", { noteId: "n-1" });

    invokeMock.mockResolvedValueOnce(todoPayload);
    await expect(
      bridge.upsertTodo({ noteId: "n-1", text: "Follow-up", dueDate: "2026-11-25" })
    ).resolves.toEqual(todoPayload);
    expect(invokeMock).toHaveBeenLastCalledWith("upsert_todo", {
      todo: { noteId: "n-1", text: "Follow-up", dueDate: "2026-11-25" },
    });

    invokeMock.mockResolvedValueOnce({ ...todoPayload, done: true });
    await expect(bridge.toggleTodo("t-1")).resolves.toEqual({ ...todoPayload, done: true });
    expect(invokeMock).toHaveBeenLastCalledWith("toggle_todo", { id: "t-1" });

    invokeMock.mockResolvedValueOnce(true);
    await expect(bridge.deleteTodo("t-1")).resolves.toBe(true);
    expect(invokeMock).toHaveBeenLastCalledWith("delete_todo", { id: "t-1" });

    const profilePayload: ActiveProfile = {
      authorId: "cs-01",
      authorName: "Ana",
      hasToken: true,
      isConfigured: true,
    };

    invokeMock.mockResolvedValueOnce(profilePayload);
    await expect(
      bridge.setActiveProfile({ authorId: "cs-01", authorName: "Ana", token: "tok" })
    ).resolves.toEqual(profilePayload);
    expect(invokeMock).toHaveBeenLastCalledWith("set_active_profile", {
      profile: { authorId: "cs-01", authorName: "Ana", token: "tok" },
    });

    invokeMock.mockResolvedValueOnce(profilePayload);
    await expect(bridge.getActiveProfile()).resolves.toEqual(profilePayload);
    expect(invokeMock).toHaveBeenLastCalledWith("get_active_profile");
  });

  it("executa fallbacks em memória de integrações externas no modo web", async () => {
    const bridge = await import("./bridge");
    bridge.resetMockStore();

    const deals = await bridge.searchPipedriveDeals("acme");
    expect(deals).toEqual([
      { id: 101, title: "Expansão Enterprise Q4", orgName: "Acme Corp" },
    ]);
    await expect(bridge.searchPipedriveDeals("   ")).resolves.toEqual([]);

    await expect(
      bridge.sendToPipedrive({ noteId: "inexistente", type: "note", dealId: 101 })
    ).rejects.toThrow("Nota não encontrada");

    const note = await bridge.saveNoteDraft({
      id: "note-int",
      title: "Alinhamento Acme",
      contentMd: "Resumo",
    });

    await expect(
      bridge.sendToPipedrive({ noteId: note.id, type: "activity", dealId: 101 })
    ).rejects.toThrow("Nenhuma tarefa pendente");

    await bridge.upsertTodo({
      noteId: note.id,
      text: "Enviar proposta",
      dueDate: "2026-11-28",
    });

    const pipeRes = await bridge.sendToPipedrive({
      noteId: note.id,
      type: "activity",
      dealId: 101,
    });
    expect(pipeRes.status).toBe("sent");
    expect(pipeRes.logId).toBeTruthy();

    const n8nRes = await bridge.triggerN8nWebhook({
      noteId: note.id,
      webhookKey: "pos-call",
    });
    expect(n8nRes.status).toBe("sent");
    expect(n8nRes.message).toContain("pos-call");

    const firstSync = await bridge.syncSupabase();
    expect(firstSync).toEqual({ syncedNotes: 1, syncedLogs: 2 });

    const secondSync = await bridge.syncSupabase();
    expect(secondSync).toEqual({ syncedNotes: 0, syncedLogs: 0 });
  });

  it("encaminha comandos IPC de integrações com parâmetros corretos no modo Tauri", async () => {
    setTauriInternals(true);
    const bridge = await import("./bridge");

    invokeMock.mockResolvedValueOnce([{ id: 10, title: "Deal X" }]);
    await expect(bridge.searchPipedriveDeals("Deal")).resolves.toEqual([
      { id: 10, title: "Deal X" },
    ]);
    expect(invokeMock).toHaveBeenLastCalledWith("search_pipedrive_deals", {
      query: "Deal",
    });

    const dispatch = { logId: "l-1", status: "sent" as const, message: "ok" };
    invokeMock.mockResolvedValueOnce(dispatch);
    await expect(
      bridge.sendToPipedrive({ noteId: "n-1", type: "note", dealId: 42 })
    ).resolves.toEqual(dispatch);
    expect(invokeMock).toHaveBeenLastCalledWith("send_to_pipedrive", {
      noteId: "n-1",
      kind: "note",
      dealId: 42,
    });

    invokeMock.mockResolvedValueOnce(dispatch);
    await expect(
      bridge.sendToPipedrive({
        noteId: "n-1",
        type: "activity",
        dealId: 42,
        todoId: "t-9",
      })
    ).resolves.toEqual(dispatch);
    expect(invokeMock).toHaveBeenLastCalledWith("send_to_pipedrive", {
      noteId: "n-1",
      kind: "activity",
      dealId: 42,
      todoId: "t-9",
    });

    invokeMock.mockResolvedValueOnce(dispatch);
    await expect(
      bridge.triggerN8nWebhook({ noteId: "n-1", webhookKey: "k1" })
    ).resolves.toEqual(dispatch);
    expect(invokeMock).toHaveBeenLastCalledWith("trigger_n8n_webhook", {
      noteId: "n-1",
      webhookKey: "k1",
    });

    invokeMock.mockResolvedValueOnce({ syncedNotes: 2, syncedLogs: 3 });
    await expect(bridge.syncSupabase()).resolves.toEqual({
      syncedNotes: 2,
      syncedLogs: 3,
    });
    expect(invokeMock).toHaveBeenLastCalledWith("sync_supabase");
  });

  it("atualiza pipedriveActivityId no modo browser preview ao enviar atividade", async () => {
    const bridge = await import("./bridge");
    bridge.resetMockStore();
    const note = await bridge.saveNoteDraft({
      title: "Call",
      contentMd: "Notas",
      pipedriveDealId: 101,
    });
    const todo = await bridge.upsertTodo({
      noteId: note.id,
      text: "Enviar minuta",
      dueDate: "2026-11-30",
    });

    const res = await bridge.sendToPipedrive({
      noteId: note.id,
      type: "activity",
      dealId: 101,
      todoId: todo.id,
    });
    expect(res.status).toBe("sent");

    const updatedTodos = await bridge.listTodos(note.id);
    expect(updatedTodos[0].pipedriveActivityId).toBeGreaterThan(0);

    await expect(
      bridge.sendToPipedrive({
        noteId: note.id,
        type: "activity",
        dealId: 101,
        todoId: todo.id,
      })
    ).rejects.toThrow("já foi enviada");
  });

  it("persiste, aplica clamp e restaura aparência do dock no mock e via IPC Tauri", async () => {
    const bridge = await import("./bridge");
    bridge.resetMockStore();

    expect(await bridge.getDockAppearance()).toEqual(bridge.DEFAULT_DOCK_APPEARANCE);

    const updated = await bridge.setDockAppearance({
      theme: "high-contrast",
      accent: "amber",
      expandedOpacity: 150,
      collapsedOpacity: 10,
      panelSize: "compact",
    });
    expect(updated).toEqual({
      theme: "high-contrast",
      accent: "amber",
      expandedOpacity: 100,
      collapsedOpacity: 40,
      panelSize: "compact",
    });

    const reset = await bridge.resetDockAppearance();
    expect(reset).toEqual(bridge.DEFAULT_DOCK_APPEARANCE);

    setTauriInternals(true);
    invokeMock.mockResolvedValueOnce(updated);
    const fromRust = await bridge.setDockAppearance({ theme: "high-contrast" });
    expect(invokeMock).toHaveBeenCalledWith("set_dock_appearance", {
      appearance: { theme: "high-contrast" },
    });
    expect(fromRust).toEqual(updated);
  });

  it("gerencia configurações de integrações write-only no mock e via IPC Tauri", async () => {
    const bridge = await import("./bridge");
    bridge.resetMockStore();

    expect(await bridge.getIntegrationSettings()).toEqual(
      bridge.DEFAULT_INTEGRATION_SETTINGS
    );

    await expect(
      bridge.setIntegrationSettings({ pipedriveApiBase: "ftp://invalida" })
    ).rejects.toThrow("URL base do Pipedrive");

    await expect(
      bridge.setIntegrationSettings({ pipedriveApiBase: "https://" })
    ).rejects.toThrow("URL base do Pipedrive");

    await expect(
      bridge.setIntegrationSettings({ n8nWebhookUrl: "http:///" })
    ).rejects.toThrow("URL do webhook n8n");

    const saved = await bridge.setIntegrationSettings({
      pipedriveApiBase: "https://api.pipedrive.com/v1/",
      pipedriveApiToken: "tok-pd-secret",
      n8nWebhookUrl: "https://n8n.example.com/webhook/cs",
      n8nWebhookSecret: "sec-n8n",
      supabaseUrl: "https://proj.supabase.co/",
      supabaseAnonKey: "anon-supa",
    });
    expect(saved).toEqual({
      pipedriveApiBase: "https://api.pipedrive.com/v1",
      hasPipedriveToken: true,
      n8nWebhookUrl: "https://n8n.example.com/webhook/cs",
      hasN8nSecret: true,
      supabaseUrl: "https://proj.supabase.co",
      hasSupabaseKey: true,
    });
    expect("pipedriveApiToken" in saved).toBe(false);
    expect("n8nWebhookSecret" in saved).toBe(false);
    expect("supabaseAnonKey" in saved).toBe(false);

    const cleared = await bridge.setIntegrationSettings({
      clearPipedriveToken: true,
      clearSupabaseKey: true,
    });
    expect(cleared.hasPipedriveToken).toBe(false);
    expect(cleared.hasN8nSecret).toBe(true);
    expect(cleared.hasSupabaseKey).toBe(false);
    expect(cleared.pipedriveApiBase).toBe("https://api.pipedrive.com/v1");

    setTauriInternals(true);
    invokeMock.mockResolvedValueOnce(saved);
    await expect(bridge.getIntegrationSettings()).resolves.toEqual(saved);
    expect(invokeMock).toHaveBeenLastCalledWith("get_integration_settings");

    invokeMock.mockResolvedValueOnce(cleared);
    await expect(
      bridge.setIntegrationSettings({ clearPipedriveToken: true })
    ).resolves.toEqual(cleared);
    expect(invokeMock).toHaveBeenLastCalledWith("set_integration_settings", {
      settings: { clearPipedriveToken: true },
    });
  });

  it("propaga rejeição do backend Rust quando invoke falha", async () => {
    setTauriInternals(true);
    const bridge = await import("./bridge");

    invokeMock.mockRejectedValueOnce(new Error("Janela principal não encontrada"));

    await expect(bridge.setDockEdge("left")).rejects.toThrow("Janela principal não encontrada");
  });
});
