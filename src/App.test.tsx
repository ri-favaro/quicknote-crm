import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAlwaysOnTop, setDockEdge, setDockExpanded } from "./lib/bridge";
import App from "./App";

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

  it("gerencia tarefas e sincroniza badge de pendentes na barra", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Tarefas e follow-ups" }));
    const input = await screen.findByPlaceholderText("Adicionar follow-up...");

    await user.type(input, "Enviar proposta{Enter}");
    await user.type(input, "Confirmar kickoff{Enter}");

    expect(screen.getByText("0/2")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    const checkButtons = screen.getAllByRole("button", { name: "Concluir tarefa" });
    await user.click(checkButtons[0]);

    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("abre ajustes no clique direito quando recolhido e menu de contexto quando expandido", async () => {
    render(<App />);

    const rail = screen.getByRole("navigation", { name: "Barra rápida QuickNote" });
    fireEvent.contextMenu(rail);

    expect(await screen.findByRole("heading", { name: "Posição e ajustes" })).toBeInTheDocument();

    fireEvent.contextMenu(rail);
    expect(await screen.findByText("Posição do dock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recolher barra" })).toBeInTheDocument();
  });

  it("registra listeners IPC apenas uma vez mesmo após digitar notas no modo Tauri", async () => {
    setTauriInternals(true);

    let state = {
      edge: "right" as const,
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
    listenMock.mockImplementation(
      async (eventName: string, cb: (event: { payload: unknown }) => void) => {
        listeners.set(eventName, cb);
        return vi.fn();
      }
    );

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledWith("dock://new-note", expect.any(Function));
      expect(listenMock).toHaveBeenCalledWith("dock://state-changed", expect.any(Function));
    });

    await user.click(screen.getByRole("button", { name: "Notas rápidas" }));
    const titleInput = await screen.findByPlaceholderText("Cliente ou título da call...");
    await user.type(titleInput, "Cliente Alpha");

    expect(listenMock).toHaveBeenCalledTimes(2);

    listeners.get("dock://new-note")?.({ payload: undefined });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Cliente ou título da call...")).toHaveValue("");
    });
  });
});