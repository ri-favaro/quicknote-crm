import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DockState } from "../lib/bridge";
import { DockPanel, type SessionNote, type SessionTodo } from "./DockPanel";

const BASE_DOCK: DockState = {
  edge: "right",
  expanded: true,
  alwaysOnTop: true,
  visible: true,
  shortcuts: { toggle: "Alt+Space", newNote: "Ctrl+Shift+N" },
};

const BASE_NOTES: SessionNote[] = [
  {
    id: "note-1",
    title: "Onboarding Acme",
    body: "Revisar integração Pipedrive",
    updatedAt: "2026-11-19T00:00:00.000Z",
  },
];

function renderPanel(overrides: Partial<Parameters<typeof DockPanel>[0]> = {}) {
  const props = {
    dock: BASE_DOCK,
    activeTab: "notes" as const,
    notes: BASE_NOTES,
    activeNoteId: "note-1",
    todos: [] as SessionTodo[],
    todoDraft: "",
    statusNotice: null,
    dockOpacity: 100,
    noteBodyRef: createRef<HTMLTextAreaElement>(),
    onSelectEdge: vi.fn(),
    onTogglePin: vi.fn(),
    onOpacityChange: vi.fn(),
    onCollapse: vi.fn(),
    onHide: vi.fn(),
    onSelectNote: vi.fn(),
    onUpdateNote: vi.fn(),
    onNewNote: vi.fn(),
    onTodoDraftChange: vi.fn(),
    onAddTodo: vi.fn((e) => e.preventDefault()),
    onToggleTodo: vi.fn(),
    onRemoveTodo: vi.fn(),
    ...overrides,
  };
  return { ...render(<DockPanel {...props} />), props };
}

describe("DockPanel", () => {
  it("expõe tooltips, aria-label e aria-pressed corretos no cabeçalho", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel({ dock: { ...BASE_DOCK, edge: "top", alwaysOnTop: true } });

    const leftBtn = screen.getByRole("button", { name: "Encaixar na esquerda" });
    const topBtn = screen.getByRole("button", { name: "Encaixar no topo" });
    const rightBtn = screen.getByRole("button", { name: "Encaixar na direita" });

    expect(leftBtn).toHaveAttribute("title", "Encaixar na esquerda");
    expect(leftBtn).toHaveAttribute("aria-pressed", "false");
    expect(topBtn).toHaveAttribute("title", "Encaixar no topo");
    expect(topBtn).toHaveAttribute("aria-pressed", "true");
    expect(rightBtn).toHaveAttribute("title", "Encaixar na direita");
    expect(rightBtn).toHaveAttribute("aria-pressed", "false");

    await user.click(leftBtn);
    expect(props.onSelectEdge).toHaveBeenCalledWith("left");

    const pinBtn = screen.getByRole("button", { name: "Desafixar do topo" });
    expect(pinBtn).toHaveAttribute("aria-pressed", "true");
    await user.click(pinBtn);
    expect(props.onTogglePin).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Recolher para a barra minimalista" }));
    expect(props.onCollapse).toHaveBeenCalledTimes(1);
  });

  it("permite editar nota e alternar entre notas da sessão", async () => {
    const user = userEvent.setup();
    const secondNote: SessionNote = {
      id: "note-2",
      title: "QBR Beta",
      body: "Follow-up renovação",
      updatedAt: "2026-11-19T00:01:00.000Z",
    };

    const { props } = renderPanel({
      notes: [BASE_NOTES[0], secondNote],
      activeNoteId: "note-1",
    });

    await user.click(screen.getByRole("button", { name: "QBR Beta" }));
    expect(props.onSelectNote).toHaveBeenCalledWith("note-2");

    const titleInput = screen.getByPlaceholderText("Cliente ou título da call...");
    await user.type(titleInput, "!");
    expect(props.onUpdateNote).toHaveBeenCalledWith("note-1", { title: "Onboarding Acme!" });
  });

  it("renderiza checklist de tarefas com contador e rótulos semânticos de concluir/desmarcar/remover", async () => {
    const user = userEvent.setup();
    const todos: SessionTodo[] = [
      { id: "t1", text: "Enviar ata", done: true },
      { id: "t2", text: "Agendar QBR", done: false },
    ];

    const { props } = renderPanel({ activeTab: "todos", todos });

    expect(screen.getByText("1/2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Desmarcar tarefa" }));
    expect(props.onToggleTodo).toHaveBeenCalledWith("t1");

    await user.click(screen.getByRole("button", { name: "Concluir tarefa" }));
    expect(props.onToggleTodo).toHaveBeenCalledWith("t2");

    const removeButtons = screen.getAllByRole("button", { name: "Remover tarefa" });
    await user.click(removeButtons[1]);
    expect(props.onRemoveTodo).toHaveBeenCalledWith("t2");
  });

  it("exibe opções de posição, slider de opacidade, atalhos e ocultar para bandeja na aba de ajustes", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel({ activeTab: "settings", dockOpacity: 85 });

    expect(screen.getByText("Alt+Space")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+Shift+N")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();

    const opacitySlider = screen.getByRole("slider", { name: "Opacidade do dock" });
    expect(opacitySlider).toHaveAttribute("min", "40");
    expect(opacitySlider).toHaveAttribute("max", "100");
    expect(opacitySlider).toHaveValue("85");

    fireEvent.change(opacitySlider, { target: { value: "65" } });
    expect(props.onOpacityChange).toHaveBeenCalledWith(65);

    await user.click(screen.getByRole("button", { name: "Esquerda" }));
    expect(props.onSelectEdge).toHaveBeenCalledWith("left");

    await user.click(
      screen.getByRole("button", { name: "Ocultar completamente para a bandeja" })
    );
    expect(props.onHide).toHaveBeenCalledTimes(1);
  });
});