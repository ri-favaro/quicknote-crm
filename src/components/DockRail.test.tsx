import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DockRail } from "./DockRail";

describe("DockRail", () => {
  it("renderiza os 4 botões com acessibilidade e orientação semântica por borda", () => {
    const { rerender } = render(
      <DockRail
        edge="right"
        expanded={true}
        activeTab="notes"
        pendingTodos={0}
        onSelectTab={vi.fn()}
        onNewNote={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );

    const nav = screen.getByRole("navigation", { name: "Barra rápida QuickNote" });
    expect(nav).toHaveAttribute("data-orientation", "vertical");
    expect(screen.getByRole("button", { name: "Notas rápidas" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Tarefas e follow-ups" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "Posição do dock e ajustes" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    rerender(
      <DockRail
        edge="top"
        expanded={false}
        activeTab="notes"
        pendingTodos={0}
        onSelectTab={vi.fn()}
        onNewNote={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );

    expect(nav).toHaveAttribute("data-orientation", "horizontal");
    expect(screen.getByRole("button", { name: "Notas rápidas" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("exibe badge apenas com tarefas pendentes e respeita fronteira 0, 9 e 9+", () => {
    const { rerender } = render(
      <DockRail
        edge="right"
        expanded={false}
        activeTab="notes"
        pendingTodos={0}
        onSelectTab={vi.fn()}
        onNewNote={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );

    const todosBtn = screen.getByRole("button", { name: "Tarefas e follow-ups" });
    expect(within(todosBtn).queryByText(/\d/)).not.toBeInTheDocument();

    rerender(
      <DockRail
        edge="right"
        expanded={false}
        activeTab="notes"
        pendingTodos={9}
        onSelectTab={vi.fn()}
        onNewNote={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );
    expect(within(todosBtn).getByText("9")).toBeInTheDocument();

    rerender(
      <DockRail
        edge="right"
        expanded={false}
        activeTab="notes"
        pendingTodos={12}
        onSelectTab={vi.fn()}
        onNewNote={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );
    expect(within(todosBtn).getByText("9+")).toBeInTheDocument();
  });

  it("dispara callbacks de abas, nova nota e clique direito", async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();
    const onNewNote = vi.fn();
    const onContextMenu = vi.fn();

    render(
      <DockRail
        edge="left"
        expanded={false}
        activeTab="notes"
        pendingTodos={0}
        onSelectTab={onSelectTab}
        onNewNote={onNewNote}
        onContextMenu={onContextMenu}
      />
    );

    await user.click(screen.getByRole("button", { name: "Notas rápidas" }));
    expect(onSelectTab).toHaveBeenCalledWith("notes");

    await user.click(screen.getByRole("button", { name: "Tarefas e follow-ups" }));
    expect(onSelectTab).toHaveBeenCalledWith("todos");

    await user.click(screen.getByRole("button", { name: "Nova nota rápida" }));
    expect(onNewNote).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Posição do dock e ajustes" }));
    expect(onSelectTab).toHaveBeenCalledWith("settings");

    fireEvent.contextMenu(screen.getByRole("navigation", { name: "Barra rápida QuickNote" }));
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });
});