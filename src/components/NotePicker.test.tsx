import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Note } from "../lib/bridge";
import { NotePicker, filterNotes, formatRelativeTime, noteSnippet } from "./NotePicker";

function makeNote(overrides: Partial<Note>): Note {
  return {
    id: "n",
    authorId: "cs-ana",
    authorName: "Ana Paula",
    title: "",
    contentMd: "",
    pipedriveDealId: null,
    pipedrivePersonId: null,
    createdAt: "2026-11-19T00:00:00.000Z",
    updatedAt: "2026-11-19T00:00:00.000Z",
    syncedAt: null,
    ...overrides,
  };
}

const NOTES: Note[] = [
  makeNote({ id: "n1", title: "Onboarding Acme", contentMd: "Revisar integração" }),
  makeNote({ id: "n2", title: "QBR Beta", contentMd: "Renovação do contrato", pipedriveDealId: 42 }),
  makeNote({ id: "n3", title: "", contentMd: "\n## Reunião de alinhamento\n- churn alto" }),
];

function renderPicker() {
  const onSelectNote = vi.fn();
  render(<NotePicker notes={NOTES} activeNoteId="n1" onSelectNote={onSelectNote} />);
  return { onSelectNote };
}

describe("filterNotes", () => {
  it("filtra por título e conteúdo ignorando caixa e acentos", () => {
    expect(filterNotes(NOTES, "acme").map((n) => n.id)).toEqual(["n1"]);
    expect(filterNotes(NOTES, "RENOVACAO").map((n) => n.id)).toEqual(["n2"]);
    expect(filterNotes(NOTES, "reuniao churn").map((n) => n.id)).toEqual(["n3"]);
    expect(filterNotes(NOTES, "  ")).toHaveLength(3);
  });
});

describe("noteSnippet", () => {
  it("retorna a primeira linha não vazia sem marcação markdown", () => {
    expect(noteSnippet("\n## Reunião\n- item")).toBe("Reunião");
    expect(noteSnippet("- [ ] tarefa")).toBe("tarefa");
    expect(noteSnippet("   \n")).toBe("");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date(2026, 10, 23, 15, 0);
  it("formata intervalos recentes, ontem e datas antigas", () => {
    expect(formatRelativeTime(new Date(2026, 10, 23, 14, 59, 40).toISOString(), now)).toBe("agora");
    expect(formatRelativeTime(new Date(2026, 10, 23, 14, 30).toISOString(), now)).toBe("há 30 min");
    expect(formatRelativeTime(new Date(2026, 10, 23, 9, 5).toISOString(), now)).toBe("hoje 09:05");
    expect(formatRelativeTime(new Date(2026, 10, 22, 18, 0).toISOString(), now)).toBe("ontem 18:00");
    expect(formatRelativeTime(new Date(2026, 10, 10, 8, 0).toISOString(), now)).toBe("10/11 08:00");
    expect(formatRelativeTime("inválido", now)).toBe("");
  });
});

describe("NotePicker", () => {
  it("lista notas com trecho, deal e filtra pelo conteúdo", async () => {
    const user = userEvent.setup();
    const { onSelectNote } = renderPicker();

    await user.click(screen.getByRole("button", { name: "Buscar notas (3)" }));
    const input = screen.getByRole("combobox", { name: "Buscar por título ou conteúdo" });
    expect(input).toHaveFocus();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByText("Sem título")).toBeInTheDocument();
    expect(screen.getByText("Reunião de alinhamento")).toBeInTheDocument();
    expect(screen.getByTitle("Vinculada ao deal #42")).toBeInTheDocument();

    await user.type(input, "contrato");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.click(screen.getByRole("option", { name: /QBR Beta/ }));
    expect(onSelectNote).toHaveBeenCalledWith("n2");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("mostra estado vazio quando nada corresponde à busca", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: "Buscar notas (3)" }));
    await user.type(screen.getByRole("combobox"), "inexistente");
    expect(screen.getByText("Nenhuma nota encontrada.")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("navega por teclado e fecha com Esc sem propagar para a janela", async () => {
    const user = userEvent.setup();
    const { onSelectNote } = renderPicker();
    const windowEsc = vi.fn();
    window.addEventListener("keydown", windowEsc);

    const trigger = screen.getByRole("button", { name: "Buscar notas (3)" });
    await user.click(trigger);
    const input = screen.getByRole("combobox");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(onSelectNote).toHaveBeenCalledWith("n2");

    await user.click(trigger);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(windowEsc).not.toHaveBeenCalledWith(expect.objectContaining({ key: "Escape" }));
    expect(input).not.toBeInTheDocument();

    window.removeEventListener("keydown", windowEsc);
  });

  it("reseta o destaque ao reabrir e limita o índice quando notas somem", async () => {
    const user = userEvent.setup();
    const onSelectNote = vi.fn();
    const { rerender } = render(
      <NotePicker notes={NOTES} activeNoteId="n1" onSelectNote={onSelectNote} />
    );
    const trigger = screen.getByRole("button", { name: "Buscar notas (3)" });

    await user.click(trigger);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getAllByRole("option")[2]).toHaveAttribute("aria-selected", "true");
    await user.click(trigger);
    await user.click(trigger);
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    rerender(
      <NotePicker notes={NOTES.slice(0, 2)} activeNoteId="n1" onSelectNote={onSelectNote} />
    );
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(onSelectNote).toHaveBeenCalledWith("n2");
  });

  it("não grava índice negativo sem resultados e omite aria-controls", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: "Buscar notas (3)" }));
    const input = screen.getByRole("combobox");
    await user.type(input, "zzz");
    expect(input).not.toHaveAttribute("aria-controls");
    expect(input).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await user.clear(input);
    expect(input).toHaveAttribute("aria-controls");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
  });

  it("rola o item destacado para a área visível ao navegar por teclado", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderPicker();
    await user.click(screen.getByRole("button", { name: "Buscar notas (3)" }));
    scrollIntoView.mockClear();
    await user.keyboard("{ArrowDown}");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(screen.getAllByRole("option")[1]);
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("fecha com Esc fora do input sem recolher o dock e ao clicar fora", async () => {
    const user = userEvent.setup();
    const onSelectNote = vi.fn();
    render(
      <>
        <button type="button">fora</button>
        <NotePicker notes={NOTES} activeNoteId="n1" onSelectNote={onSelectNote} />
      </>
    );
    const windowEsc = vi.fn();
    window.addEventListener("keydown", windowEsc);
    const trigger = screen.getByRole("button", { name: "Buscar notas (3)" });

    await user.click(trigger);
    trigger.focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(windowEsc).not.toHaveBeenCalled();

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "fora" }));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(onSelectNote).not.toHaveBeenCalled();

    window.removeEventListener("keydown", windowEsc);
  });
});
