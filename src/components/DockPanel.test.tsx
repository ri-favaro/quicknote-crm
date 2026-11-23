import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DOCK_APPEARANCE,
  DEFAULT_INTEGRATION_SETTINGS,
  type ActiveProfile,
  type DockAppearance,
  type DockState,
  type IntegrationSettings,
  type Note,
  type Todo,
} from "../lib/bridge";
import { DockPanel, type PersistenceStatus, type TodoScope } from "./DockPanel";

const BASE_DOCK: DockState = {
  edge: "right",
  expanded: true,
  alwaysOnTop: true,
  visible: true,
  shortcuts: { toggle: "Alt+Space", newNote: "Ctrl+Shift+N" },
};

const BASE_PROFILE: ActiveProfile = {
  authorId: "cs-ana",
  authorName: "Ana Paula",
  hasToken: false,
  isConfigured: true,
};

const BASE_NOTES: Note[] = [
  {
    id: "note-1",
    authorId: "cs-ana",
    authorName: "Ana Paula",
    title: "Onboarding Acme",
    contentMd: "Revisar integração Pipedrive",
    pipedriveDealId: null,
    pipedrivePersonId: null,
    createdAt: "2026-11-19T00:00:00.000Z",
    updatedAt: "2026-11-19T00:00:00.000Z",
    syncedAt: null,
  },
];

function renderPanel(overrides: Partial<Parameters<typeof DockPanel>[0]> = {}) {
  const props = {
    dock: BASE_DOCK,
    activeTab: "notes" as const,
    notes: BASE_NOTES,
    activeNoteId: "note-1",
    todos: [] as Todo[],
    todoDraft: "",
    todoDueDate: "",
    todoScope: "all" as TodoScope,
    profile: BASE_PROFILE,
    persistenceStatus: { kind: "idle" } as PersistenceStatus,
    statusNotice: null,
    appearance: { ...DEFAULT_DOCK_APPEARANCE } as DockAppearance,
    noteBodyRef: createRef<HTMLTextAreaElement>(),
    onSelectEdge: vi.fn(),
    onTogglePin: vi.fn(),
    onUpdateAppearance: vi.fn(),
    onResetAppearance: vi.fn(),
    onCollapse: vi.fn(),
    onHide: vi.fn(),
    onSelectNote: vi.fn(),
    onUpdateNote: vi.fn(),
    onNewNote: vi.fn(),
    onDeleteNote: vi.fn(),
    onRetrySave: vi.fn(),
    onTodoDraftChange: vi.fn(),
    onTodoDueDateChange: vi.fn(),
    onTodoScopeChange: vi.fn(),
    onAddTodo: vi.fn((e) => e.preventDefault()),
    onToggleTodo: vi.fn(),
    onRemoveTodo: vi.fn(),
    onOpenNoteFromTodo: vi.fn(),
    onSaveProfile: vi.fn().mockResolvedValue(undefined),
    integrationSettings: {
      ...DEFAULT_INTEGRATION_SETTINGS,
    } as IntegrationSettings,
    onSaveIntegrationSettings: vi.fn().mockResolvedValue(undefined),
    onOpenSettings: vi.fn(),
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

  it("permite editar nota, alternar entre notas, usar checklist compacto e confirmar exclusão inline", async () => {
    const user = userEvent.setup();
    const secondNote: Note = {
      ...BASE_NOTES[0],
      id: "note-2",
      title: "QBR Beta",
      contentMd: "Follow-up renovação",
      updatedAt: "2026-11-19T00:01:00.000Z",
    };

    const { props } = renderPanel({
      notes: [BASE_NOTES[0], secondNote],
      activeNoteId: "note-1",
      profile: {
        authorId: "local-cs",
        authorName: "CS Local",
        hasToken: false,
        isConfigured: false,
      },
      todos: [
        {
          id: "t-1",
          noteId: "note-1",
          text: "Enviar ata",
          done: false,
          dueDate: "2026-11-28",
          pipedriveActivityId: null,
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Configurar" }));
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Buscar notas (2)" }));
    await user.click(screen.getByRole("option", { name: /QBR Beta/ }));
    expect(props.onSelectNote).toHaveBeenCalledWith("note-2");

    const titleInput = screen.getByPlaceholderText("Cliente ou título da call...");
    await user.type(titleInput, "!");
    expect(props.onUpdateNote).toHaveBeenCalledWith("note-1", { title: "Onboarding Acme!" });

    const inlineTodoInput = screen.getByPlaceholderText("Novo follow-up nesta nota...");
    await user.type(inlineTodoInput, "Agendar review{Enter}");
    expect(props.onAddTodo).toHaveBeenLastCalledWith(expect.any(Object), {
      text: "Agendar review",
    });

    await user.click(screen.getByRole("button", { name: "Excluir nota" }));
    expect(screen.getByText("Excluir nota e tarefas vinculadas?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    expect(props.onDeleteNote).toHaveBeenCalledWith("note-1");
  });

  it("renderiza checklist de tarefas com contador, filtro por nota e prazo", async () => {
    const user = userEvent.setup();
    const todos: Todo[] = [
      {
        id: "t1",
        noteId: "note-1",
        text: "Enviar ata",
        done: true,
        dueDate: null,
        pipedriveActivityId: null,
      },
      {
        id: "t2",
        noteId: "note-2",
        text: "Agendar QBR",
        done: false,
        dueDate: "2026-11-29",
        pipedriveActivityId: null,
      },
    ];
    const secondNote: Note = {
      ...BASE_NOTES[0],
      id: "note-2",
      title: "QBR Beta",
    };

    const { props } = renderPanel({
      activeTab: "todos",
      notes: [BASE_NOTES[0], secondNote],
      todos,
      todoDraft: "Ligar para cliente",
      todoDueDate: "2026-11-30",
    });

    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("29/11")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "QBR Beta" }));
    expect(props.onOpenNoteFromTodo).toHaveBeenCalledWith("note-2");

    await user.click(screen.getByRole("button", { name: "Nota atual" }));
    expect(props.onTodoScopeChange).toHaveBeenCalledWith("note");

    await user.click(screen.getByRole("button", { name: "Desmarcar tarefa" }));
    expect(props.onToggleTodo).toHaveBeenCalledWith("t1");

    await user.click(screen.getByRole("button", { name: "Concluir tarefa" }));
    expect(props.onToggleTodo).toHaveBeenCalledWith("t2");

    const removeButtons = screen.getAllByRole("button", { name: "Remover tarefa" });
    await user.click(removeButtons[1]);
    expect(props.onRemoveTodo).toHaveBeenCalledWith("t2");

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa" }));
    expect(props.onAddTodo).toHaveBeenCalledWith(expect.any(Object), {
      dueDate: "2026-11-30",
    });
  });

  it("exibe formulário de perfil CS write-only, aparência, posição e ações do dock na aba ajustes", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel({
      activeTab: "settings",
      appearance: {
        theme: "light",
        accent: "blue",
        expandedOpacity: 85,
        collapsedOpacity: 60,
        panelSize: "wide",
      },
      profile: {
        authorId: "cs-ana",
        authorName: "Ana Paula",
        hasToken: true,
        isConfigured: true,
      },
    });

    const tokenInput = screen.getByLabelText("Token CS (opcional)") as HTMLInputElement;
    expect(tokenInput).toHaveValue("");
    await user.type(tokenInput, "novo-segredo");
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));

    await waitFor(() => {
      expect(props.onSaveProfile).toHaveBeenCalledWith({
        authorId: "cs-ana",
        authorName: "Ana Paula",
        token: "novo-segredo",
      });
    });
    expect(tokenInput).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Limpar token" }));
    expect(props.onSaveProfile).toHaveBeenLastCalledWith({
      authorId: "cs-ana",
      authorName: "Ana Paula",
      clearToken: true,
    });

    expect(screen.getByText("Alt+Space")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+Shift+N")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Claro" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Azul" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Amplo" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Alto contraste" }));
    expect(props.onUpdateAppearance).toHaveBeenCalledWith({ theme: "high-contrast" });

    await user.click(screen.getByRole("button", { name: "Esmeralda" }));
    expect(props.onUpdateAppearance).toHaveBeenCalledWith({ accent: "emerald" });

    await user.click(screen.getByRole("button", { name: "Compacto" }));
    expect(props.onUpdateAppearance).toHaveBeenCalledWith({ panelSize: "compact" });

    const expandedSlider = screen.getByRole("slider", { name: "Opacidade expandido" });
    expect(expandedSlider).toHaveAttribute("min", "40");
    expect(expandedSlider).toHaveAttribute("max", "100");
    expect(expandedSlider).toHaveValue("85");
    fireEvent.change(expandedSlider, { target: { value: "70" } });
    expect(props.onUpdateAppearance).toHaveBeenCalledWith({ expandedOpacity: 70 });

    const collapsedSlider = screen.getByRole("slider", { name: "Opacidade retraído" });
    expect(collapsedSlider).toHaveValue("60");
    fireEvent.change(collapsedSlider, { target: { value: "50" } });
    expect(props.onUpdateAppearance).toHaveBeenCalledWith({ collapsedOpacity: 50 });

    await user.click(screen.getByRole("button", { name: "Restaurar padrão" }));
    expect(props.onResetAppearance).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Esquerda" }));
    expect(props.onSelectEdge).toHaveBeenCalledWith("left");

    await user.click(
      screen.getByRole("button", { name: "Ocultar completamente para a bandeja" })
    );
    expect(props.onHide).toHaveBeenCalledTimes(1);
  });

  it("exibe erro de persistência no rodapé com ação de tentar novamente", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel({
      persistenceStatus: { kind: "error", message: "Falha ao gravar no SQLite" },
    });

    expect(screen.getByText("Falha ao gravar no SQLite")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(props.onRetrySave).toHaveBeenCalledTimes(1);
  });

  it("permite buscar e vincular um Deal do Pipedrive na nota atual", async () => {
    const user = userEvent.setup();
    const onSearchPipedriveDeals = vi.fn().mockResolvedValue([
      { id: 101, title: "Expansão Enterprise", orgName: "Acme Corp" },
    ]);
    const onSelectPipedriveDeal = vi.fn();
    const onSendToPipedrive = vi.fn();

    renderPanel({
      onSearchPipedriveDeals,
      onSelectPipedriveDeal,
      onSendToPipedrive,
    });

    const input = screen.getByLabelText("Buscar negócio no Pipedrive");
    await user.type(input, "Acme");

    await waitFor(() => {
      expect(onSearchPipedriveDeals).toHaveBeenCalledWith("Acme");
    });

    const option = await screen.findByRole("option");
    expect(option).toHaveTextContent("Expansão Enterprise");
    expect(option).toHaveTextContent("Acme Corp");

    await user.click(option);
    expect(onSelectPipedriveDeal).toHaveBeenCalledWith("note-1", {
      id: 101,
      title: "Expansão Enterprise",
      orgName: "Acme Corp",
    });
  });

  it("exibe ações de envio ao Pipedrive, badge de atividade enviada e permite reenvio em caso de erro", async () => {
    const user = userEvent.setup();
    const onSendToPipedrive = vi.fn();
    const onSelectPipedriveDeal = vi.fn();

    const todos: Todo[] = [
      {
        id: "t-pending",
        noteId: "note-1",
        text: "Agendar QBR",
        done: false,
        dueDate: "2026-11-30",
        pipedriveActivityId: null,
      },
      {
        id: "t-synced",
        noteId: "note-1",
        text: "Enviar ata",
        done: false,
        dueDate: null,
        pipedriveActivityId: 8821,
      },
    ];

    renderPanel({
      notes: [{ ...BASE_NOTES[0], pipedriveDealId: 101 }],
      todos,
      linkedDeal: { id: 101, title: "Expansão Enterprise", orgName: "Acme Corp" },
      pipedriveDispatch: {
        kind: "error",
        type: "note",
        message: "Pipedrive retornou HTTP 401: Invalid token",
      },
      onSelectPipedriveDeal,
      onSendToPipedrive,
    });

    expect(screen.getByText("#101")).toBeInTheDocument();
    expect(screen.getByText("PD #8821")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Enviar nota/i }));
    expect(onSendToPipedrive).toHaveBeenCalledWith("note");

    await user.click(screen.getByRole("button", { name: /Atividades \(1\)/i }));
    expect(onSendToPipedrive).toHaveBeenCalledWith("activity");

    expect(screen.getByRole("alert")).toHaveTextContent("HTTP 401");
    await user.click(screen.getByRole("button", { name: /Reenviar/i }));
    expect(onSendToPipedrive).toHaveBeenCalledWith("note", undefined);
  });

  it("permite configurar e limpar segredos write-only das integrações na aba ajustes", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel({
      activeTab: "settings",
      integrationSettings: {
        pipedriveApiBase: "https://api.pipedrive.com/v1",
        hasPipedriveToken: true,
        n8nWebhookUrl: "",
        hasN8nSecret: false,
        supabaseUrl: "https://proj.supabase.co",
        hasSupabaseKey: true,
      },
    });

    expect(screen.getByText("2/3 prontas")).toBeInTheDocument();

    const pipedriveTokenInput = screen.getByLabelText(
      "Token API Pipedrive"
    ) as HTMLInputElement;
    const n8nUrlInput = screen.getByLabelText(
      "URL webhook n8n"
    ) as HTMLInputElement;
    const n8nSecretInput = screen.getByLabelText(
      "Secret webhook n8n (opcional)"
    ) as HTMLInputElement;

    expect(pipedriveTokenInput).toHaveValue("");
    await user.type(pipedriveTokenInput, "pd-novo-token");
    await user.type(n8nUrlInput, "https://n8n.example.com/webhook/cs");
    await user.type(n8nSecretInput, "n8n-segredo");

    await user.click(screen.getByRole("button", { name: "Salvar integrações" }));

    await waitFor(() => {
      expect(props.onSaveIntegrationSettings).toHaveBeenCalledWith({
        pipedriveApiBase: "https://api.pipedrive.com/v1",
        pipedriveApiToken: "pd-novo-token",
        n8nWebhookUrl: "https://n8n.example.com/webhook/cs",
        n8nWebhookSecret: "n8n-segredo",
        supabaseUrl: "https://proj.supabase.co",
        supabaseAnonKey: undefined,
      });
    });

    expect(pipedriveTokenInput).toHaveValue("");
    expect(n8nSecretInput).toHaveValue("");

    await user.click(
      screen.getByRole("button", { name: "Limpar token Pipedrive" })
    );
    expect(props.onSaveIntegrationSettings).toHaveBeenLastCalledWith({
      clearPipedriveToken: true,
    });
  });
});
