import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DockRail } from "./DockRail";

describe("DockRail", () => {
  it("renderiza os 4 botões com acessibilidade e orientação correta nas bordas", () => {
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
    expect(nav.className).toContain("flex-col");
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

    expect(nav.className).toContain("flex-row");
    expect(screen.getByRole("button", { name: "Notas rápidas" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("exibe contador de tarefas pendentes e limita a 9+", () => {
    const { rerender } = render(
      <DockRail
        edge="right"
        expanded={false}
        activeTab="notes"
        pendingTodos={3}
        onSelectTab={vi.fn()}
        onNewNote={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );

    expect(screen.getByText("3")).toBeInTheDocument();

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

    expect(screen.getByText("9+")).toBeInTheDocument();
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