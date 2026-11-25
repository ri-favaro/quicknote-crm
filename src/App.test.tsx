/// <reference types="vite/client" />
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import indexHtml from "../index.html?raw";
import App from "./App";
import {
  resetMockStore,
  setAlwaysOnTop,
  setDockEdge,
  setDockExpanded,
  DEFAULT_DOCK_APPEARANCE,
  DEFAULT_INTEGRATION_SETTINGS,
  type ActiveProfile,
  type DockAppearance,
  type DockState,
  type Note,
} from "./lib/bridge";

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

const DEFAULT_FALLBACK_PROFILE: ActiveProfile = {
  authorId: "local-cs",
  authorName: "CS Local",
  hasToken: false,
  isConfigured: false,
};

const DEFAULT_DOCK_STATE: DockState = {
  edge: "right",
  expanded: false,
  alwaysOnTop: true,
  visible: true,
  shortcuts: { toggle: "Alt+Space", newNote: "Ctrl+Shift+N" },
};

type InvokeHandler = (args?: Record<string, unknown>) => unknown | Promise<unknown>;

function mockTauriInvoke(overrides: Record<string, InvokeHandler> = {}) {
  const handlers: Record<string, InvokeHandler> = {
    get_dock_state: () => DEFAULT_DOCK_STATE,
    get_dock_appearance: () => DEFAULT_DOCK_APPEARANCE,
    list_notes: () => [],
    list_todos: () => [],
    get_active_profile: () => DEFAULT_FALLBACK_PROFILE,
    get_integration_settings: () => DEFAULT_INTEGRATION_SETTINGS,
    ...overrides,
  };

  invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
    const handler = handlers[cmd];
    if (!handler) {
      throw new Error(`Comando IPC não mapeado no mock: ${cmd}`);
    }
    return handler(args);
  });
}

beforeEach(async () => {
  window.localStorage.clear();
  setTauriInternals(false);
  resetMockStore();
  await setDockEdge("right");
  await setDockExpanded(true);
  await setDockExpanded(false);
  await setAlwaysOnTop(true);
});

afterEach(() => {
  setTauriInternals(false);
  invokeMock.mockReset();
  listenMock.mockReset();
});

describe("App (fluxos integrados do dock)", () => {
  it("expande, troca de borda sem recolher o painel e recolhe com Escape", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByRole("heading", { name: "Notas rápidas" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Notas rápidas" }));
    expect(await screen.findByRole("heading", { name: "Notas rápidas" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Encaixar no topo" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Encaixar no topo" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
    });
    expect(screen.getByRole("heading", { name: "Notas rápidas" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Notas rápidas" })).not.toBeInTheDocument();
    });
  });

  it("gerencia tarefas e sincroniza badge de pendentes no botão da barra", async () => {
    const user = userEvent.setup();
    render(<App />);

    const todosRailButton = screen.getByRole("button", { name: "Tarefas e follow-ups" });
    await user.click(todosRailButton);
    const input = await screen.findByPlaceholderText("Adicionar follow-up...");

    await user.type(input, "Enviar proposta{Enter}");
    await user.type(input, "Confirmar kickoff{Enter}");

    expect(await screen.findByText("0/2")).toBeInTheDocument();
    expect(within(todosRailButton).getByText("2")).toBeInTheDocument();

    const checkButtons = screen.getAllByRole("button", { name: "Concluir tarefa" });
    await user.click(checkButtons[0]);

    expect(await screen.findByText("1/2")).toBeInTheDocument();
    expect(within(todosRailButton).getByText("1")).toBeInTheDocument();
  });

  it("prioriza Escape fechando primeiro o menu de contexto e só depois recolhendo o painel", async () => {
    const user = userEvent.setup();
    render(<App />);

    const rail = screen.getByRole("navigation", { name: "Barra rápida QuickNote" });
    fireEvent.contextMenu(rail);
    expect(await screen.findByRole("heading", { name: "Posição e ajustes" })).toBeInTheDocument();

    fireEvent.contextMenu(rail);
    const contextMenu = await screen.findByRole("menu", { name: "Posição do dock" });
    expect(within(contextMenu).getByRole("button", { name: "Direita" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(contextMenu).getByRole("button", { name: "Esquerda" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Posição do dock" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Posição e ajustes" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Posição e ajustes" })).not.toBeInTheDocument();
    });
  });

  it("mantém listeners IPC únicos, preserva nota anterior no dock://new-note, sincroniza dock://state-changed e limpa no unmount", async () => {
    setTauriInternals(true);

    let state: DockState = { ...DEFAULT_DOCK_STATE };

    mockTauriInvoke({
      get_dock_state: () => state,
      set_dock_expanded: (args) => {
        state = { ...state, expanded: Boolean(args?.expanded) };
        return state;
      },
      save_note_draft: (args) => {
        const note = args?.note as { id?: string; title: string; contentMd: string };
        return {
          id: note.id ?? "n-saved",
          authorId: "local-cs",
          authorName: "CS Local",
          title: note.title,
          contentMd: note.contentMd,
          pipedriveDealId: null,
          pipedrivePersonId: null,
          createdAt: "2026-11-19T10:00:00Z",
          updatedAt: "2026-11-19T10:00:00Z",
          syncedAt: null,
        } satisfies Note;
      },
    });

    const listeners = new Map<string, (event: { payload: unknown }) => void>();
    const unlistenSpies = new Map<string, ReturnType<typeof vi.fn>>();
    listenMock.mockImplementation(
      async (eventName: string, cb: (event: { payload: unknown }) => void) => {
        listeners.set(eventName, cb);
        const unlisten = vi.fn();
        unlistenSpies.set(eventName, unlisten);
        return unlisten;
      }
    );

    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledWith("dock://new-note", expect.any(Function));
      expect(listenMock).toHaveBeenCalledWith("dock://state-changed", expect.any(Function));
    });

    await user.click(screen.getByRole("button", { name: "Notas rápidas" }));
    const titleInput = await screen.findByPlaceholderText("Cliente ou título da call...");
    await user.type(titleInput, "Cliente Alpha");

    expect(listenMock).toHaveBeenCalledTimes(2);

    act(() => {
      listeners.get("dock://new-note")?.({ payload: undefined });
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Cliente ou título da call...")).toHaveValue("");
    });
    await user.click(screen.getByRole("button", { name: "Buscar notas (2)" }));
    expect(screen.getByRole("option", { name: /Cliente Alpha/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    act(() => {
      listeners.get("dock://state-changed")?.({
        payload: { ...state, edge: "left", expanded: true },
      });
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Encaixar na esquerda" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
    });

    unmount();
    expect(unlistenSpies.get("dock://new-note")).toHaveBeenCalledTimes(1);
    expect(unlistenSpies.get("dock://state-changed")).toHaveBeenCalledTimes(1);
  });

  it("impede que getDockState inicial atrasado sobrescreva ação já executada pelo usuário", async () => {
    setTauriInternals(true);

    let resolveInitialState!: (value: DockState) => void;
    const initialPromise = new Promise<DockState>((resolve) => {
      resolveInitialState = resolve;
    });

    mockTauriInvoke({
      get_dock_state: () => initialPromise,
      set_dock_expanded: (args) => ({
        ...DEFAULT_DOCK_STATE,
        expanded: Boolean(args?.expanded),
      }),
    });
    listenMock.mockResolvedValue(vi.fn());

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Notas rápidas" }));
    expect(await screen.findByRole("heading", { name: "Notas rápidas" })).toBeInTheDocument();

    await act(async () => {
      resolveInitialState({
        edge: "right",
        expanded: false,
        alwaysOnTop: true,
        visible: true,
        shortcuts: { toggle: "Alt+Space", newNote: "Ctrl+Shift+N" },
      });
    });

    expect(screen.getByRole("heading", { name: "Notas rápidas" })).toBeInTheDocument();
  });

  it("preserva fundo transparente no index.html e aplica atributos iniciais de aparência no runtime Tauri", async () => {
    const bodyMatch = indexHtml.match(/<body[^>]*class="([^"]*)"/i);
    expect(bodyMatch).not.toBeNull();
    const bodyClasses = bodyMatch?.[1].split(/\s+/) ?? [];
    expect(bodyClasses).toContain("bg-transparent");
    expect(bodyClasses).toContain("text-foreground");
    expect(bodyClasses.some((cls) => /^bg-(zinc|black|slate|neutral|gray|stone)-?/.test(cls))).toBe(
      false
    );

    setTauriInternals(true);
    mockTauriInvoke();
    listenMock.mockResolvedValue(vi.fn());

    const { container } = render(<App />);
    const shell = container.querySelector<HTMLElement>("[data-theme]");
    expect(shell).not.toBeNull();
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_dock_appearance");
    });
    expect(shell).toHaveAttribute("data-theme", DEFAULT_DOCK_APPEARANCE.theme);
    expect(shell).toHaveAttribute("data-accent", DEFAULT_DOCK_APPEARANCE.accent);
    expect(shell).toHaveAttribute("data-panel-size", DEFAULT_DOCK_APPEARANCE.panelSize);
    expect(shell?.style.opacity).toBe(String(DEFAULT_DOCK_APPEARANCE.collapsedOpacity / 100));
    expect(screen.getByRole("navigation", { name: "Barra rápida QuickNote" })).toBeInTheDocument();
  });

  it("aplica tema, cor, largura e opacidades expandido/retraído em tempo real, persiste no backend e restaura padrão", async () => {
    const user = userEvent.setup();
    setTauriInternals(true);

    let state: DockState = { ...DEFAULT_DOCK_STATE };
    let savedAppearance: DockAppearance = { ...DEFAULT_DOCK_APPEARANCE };

    mockTauriInvoke({
      get_dock_state: () => state,
      get_dock_appearance: () => savedAppearance,
      set_dock_appearance: (args) => {
        const patch = (args?.appearance ?? {}) as Partial<DockAppearance>;
        savedAppearance = {
          theme: patch.theme ?? savedAppearance.theme,
          accent: patch.accent ?? savedAppearance.accent,
          expandedOpacity: patch.expandedOpacity ?? savedAppearance.expandedOpacity,
          collapsedOpacity: patch.collapsedOpacity ?? savedAppearance.collapsedOpacity,
          panelSize: patch.panelSize ?? savedAppearance.panelSize,
        };
        return savedAppearance;
      },
      reset_dock_appearance: () => {
        savedAppearance = { ...DEFAULT_DOCK_APPEARANCE };
        return savedAppearance;
      },
      set_dock_expanded: (args) => {
        state = { ...state, expanded: Boolean(args?.expanded) };
        return state;
      },
    });
    listenMock.mockResolvedValue(vi.fn());

    const { container, unmount } = render(<App />);
    const shell = container.querySelector<HTMLElement>("[data-theme]");
    expect(shell).not.toBeNull();
    expect(shell?.style.opacity).toBe("1");
    expect(shell).toHaveAttribute("data-theme", "dark");

    await user.click(screen.getByRole("button", { name: "Posição do dock e ajustes" }));
    const expandedSlider = await screen.findByRole("slider", { name: "Opacidade expandido" });
    const collapsedSlider = screen.getByRole("slider", { name: "Opacidade retraído" });

    await user.click(screen.getByRole("button", { name: "Claro" }));
    await user.click(screen.getByRole("button", { name: "Esmeralda" }));
    await user.click(screen.getByRole("button", { name: "Amplo" }));
    fireEvent.change(expandedSlider, { target: { value: "80" } });
    fireEvent.change(collapsedSlider, { target: { value: "55" } });

    expect(shell).toHaveAttribute("data-theme", "light");
    expect(shell).toHaveAttribute("data-accent", "emerald");
    expect(shell).toHaveAttribute("data-panel-size", "wide");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(shell?.style.opacity).toBe("0.8");

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("slider", { name: "Opacidade expandido" })).not.toBeInTheDocument();
    });
    expect(shell?.style.opacity).toBe("0.55");

    unmount();

    const remounted = render(<App />);
    const remountedShell = remounted.container.querySelector<HTMLElement>("[data-theme]");
    expect(remountedShell).not.toBeNull();
    await waitFor(() => {
      expect(remountedShell).toHaveAttribute("data-theme", "light");
      expect(remountedShell).toHaveAttribute("data-accent", "emerald");
      expect(remountedShell).toHaveAttribute("data-panel-size", "wide");
      expect(remountedShell?.style.opacity).toBe("0.55");
    });

    await user.click(screen.getByRole("button", { name: "Posição do dock e ajustes" }));
    await user.click(await screen.findByRole("button", { name: "Restaurar padrão" }));

    await waitFor(() => {
      expect(remountedShell).toHaveAttribute("data-theme", "dark");
      expect(remountedShell).toHaveAttribute("data-accent", "violet");
      expect(remountedShell).toHaveAttribute("data-panel-size", "default");
      expect(remountedShell?.style.opacity).toBe("1");
    });
    remounted.unmount();
  });

  it("persiste perfil CS, nota com autosave e tarefas vinculadas ao reabrir o dock e remove em cascata ao excluir nota", async () => {
    const user = userEvent.setup();
    const firstMount = render(<App />);

    await user.click(screen.getByRole("button", { name: "Posição do dock e ajustes" }));
    await user.type(await screen.findByLabelText("ID do CS"), "cs-bia");
    await user.type(screen.getByLabelText("Nome exibido"), "Bia Santos");
    await user.type(screen.getByLabelText("Token CS (opcional)"), "tok-bia");
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
    expect(await screen.findByText("Perfil salvo no SQLite.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Notas rápidas" }));
    await user.type(
      await screen.findByPlaceholderText("Cliente ou título da call..."),
      "Call Cliente Delta"
    );
    await user.type(
      screen.getByPlaceholderText("Anote pontos da reunião, dores do cliente e próximos passos..."),
      "Migrar pipeline"
    );

    expect(await screen.findByText(/Salvo às/)).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("Novo follow-up nesta nota..."),
      "Enviar contrato{Enter}"
    );
    expect(await screen.findByText("Enviar contrato")).toBeInTheDocument();

    firstMount.unmount();

    await setDockExpanded(true);
    const secondMount = render(<App />);

    expect(await screen.findByPlaceholderText("Cliente ou título da call...")).toHaveValue(
      "Call Cliente Delta"
    );
    expect(
      screen.getByPlaceholderText("Anote pontos da reunião, dores do cliente e próximos passos...")
    ).toHaveValue("Migrar pipeline");
    expect(screen.getByText(/Bia Santos/)).toBeInTheDocument();
    expect(screen.getByText("Enviar contrato")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Excluir nota" }));
    await user.click(screen.getByRole("button", { name: "Confirmar exclusão" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Cliente ou título da call...")).toHaveValue("");
    });
    expect(screen.queryByText("Enviar contrato")).not.toBeInTheDocument();

    secondMount.unmount();

    const thirdMount = render(<App />);
    expect(await screen.findByPlaceholderText("Cliente ou título da call...")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Tarefas e follow-ups" }));
    expect(await screen.findByText("0/0")).toBeInTheDocument();
    thirdMount.unmount();
  });

  it("filtra tarefas por Todas vs Nota atual e permite tentar novamente quando save_note_draft falha", async () => {
    const user = userEvent.setup();
    setTauriInternals(true);

    let failNextSave = true;
    const state: DockState = {
      ...DEFAULT_DOCK_STATE,
      expanded: true,
    };

    mockTauriInvoke({
      get_dock_state: () => state,
      save_note_draft: (args) => {
        if (failNextSave) {
          throw new Error("Erro de escrita SQLite");
        }
        const note = args?.note as { id?: string; title: string; contentMd: string };
        return {
          id: note.id ?? "n1",
          authorId: "local-cs",
          authorName: "CS Local",
          title: note.title,
          contentMd: note.contentMd,
          pipedriveDealId: null,
          pipedrivePersonId: null,
          createdAt: "2026-11-19T10:00:00Z",
          updatedAt: "2026-11-19T10:00:00Z",
          syncedAt: null,
        } satisfies Note;
      },
    });
    listenMock.mockResolvedValue(vi.fn());

    render(<App />);

    const titleInput = await screen.findByPlaceholderText("Cliente ou título da call...");
    await user.type(titleInput, "Nota com erro");

    expect(await screen.findByText("Erro de escrita SQLite")).toBeInTheDocument();
    failNextSave = false;

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText(/Salvo às/)).toBeInTheDocument();
  });

  it("alterna filtro Todas vs Nota atual com duas notas distintas", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Notas rápidas" }));
    await user.type(await screen.findByPlaceholderText("Cliente ou título da call..."), "Nota Um");
    await user.type(screen.getByPlaceholderText("Novo follow-up nesta nota..."), "Tarefa Um{Enter}");
    expect(await screen.findByText("Tarefa Um")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Criar nova nota" }));
    await user.type(await screen.findByPlaceholderText("Cliente ou título da call..."), "Nota Dois");
    await user.type(
      screen.getByPlaceholderText("Novo follow-up nesta nota..."),
      "Tarefa Dois{Enter}"
    );
    expect(await screen.findByText("Tarefa Dois")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tarefas e follow-ups" }));
    expect(await screen.findByText("0/2")).toBeInTheDocument();
    expect(screen.getByText("Tarefa Um")).toBeInTheDocument();
    expect(screen.getByText("Tarefa Dois")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nota atual" }));
    expect(await screen.findByText("0/1")).toBeInTheDocument();
    expect(screen.queryByText("Tarefa Um")).not.toBeInTheDocument();
    expect(screen.getByText("Tarefa Dois")).toBeInTheDocument();
  });
});
