import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  setAlwaysOnTop,
  setDockEdge,
  setDockExpanded,
  type DockState,
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

beforeEach(async () => {
  setTauriInternals(false);
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

    expect(screen.getByText("0/2")).toBeInTheDocument();
    expect(within(todosRailButton).getByText("2")).toBeInTheDocument();

    const checkButtons = screen.getAllByRole("button", { name: "Concluir tarefa" });
    await user.click(checkButtons[0]);

    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(within(todosRailButton).getByText("1")).toBeInTheDocument();
  });

  it("prioriza Escape fechando primeiro o menu de contexto e só depois recolhendo o painel", async () => {
    const user = userEvent.setup();
    render(<App />);

    const rail = screen.getByRole("navigation", { name: "Barra rápida QuickNote" });
    fireEvent.contextMenu(rail);
    expect(await screen.findByRole("heading", { name: "Posição e ajustes" })).toBeInTheDocument();

    fireEvent.contextMenu(rail);
    expect(await screen.findByText("Posição do dock")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByText("Posição do dock")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Posição e ajustes" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Posição e ajustes" })).not.toBeInTheDocument();
    });
  });

  it("mantém listeners IPC únicos, preserva nota anterior no dock://new-note, sincroniza dock://state-changed e limpa no unmount", async () => {
    setTauriInternals(true);

    let state: DockState = {
      edge: "right",
      expanded: false,
      alwaysOnTop: true,
      visible: true,
      shortcuts: { toggle: "Alt+Space", newNote: "Ctrl+Shift+N" },
    };

    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "get_dock_state") return state;
      if (cmd === "set_dock_expanded") {
        state = { ...state, expanded: Boolean(args?.expanded) };
        return state;
      }
      return state;
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
    expect(screen.getByRole("button", { name: "Cliente Alpha" })).toBeInTheDocument();

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

    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "get_dock_state") return initialPromise;
      if (cmd === "set_dock_expanded") {
        return {
          edge: "right",
          expanded: Boolean(args?.expanded),
          alwaysOnTop: true,
          visible: true,
          shortcuts: { toggle: "Alt+Space", newNote: "Ctrl+Shift+N" },
        };
      }
      return initialPromise;
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
});