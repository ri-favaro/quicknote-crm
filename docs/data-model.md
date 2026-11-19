# Modelo de Dados e Contrato IPC

## 1. Tabelas (SQLite Local & Supabase)

O backend Rust inicializa o arquivo `quicknote.db` em `app_data_dir` com `PRAGMA journal_mode = WAL`, `PRAGMA busy_timeout = 5000` e `PRAGMA foreign_keys = ON`.

### `notes`
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `TEXT (UUID)` | Identificador único da nota |
| `author_id` | `TEXT` | Identificador do usuário CS (perfil local ou fallback `local-cs`) |
| `author_name` | `TEXT` | Nome exibido nos logs e envios |
| `title` | `TEXT` | Título curto da reunião/nota |
| `content_md` | `TEXT` | Corpo da nota em Markdown |
| `pipedrive_deal_id` | `INTEGER` (nullable) | ID do negócio vinculado no Pipedrive |
| `pipedrive_person_id` | `INTEGER` (nullable) | ID do contato vinculado no Pipedrive |
| `created_at` | `TEXT (ISO-8601)` | Data/hora de criação |
| `updated_at` | `TEXT (ISO-8601)` | Última edição local |
| `synced_at` | `TEXT (ISO-8601)` (nullable) | Última sincronização bem-sucedida no Supabase |

### `todos`
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `TEXT (UUID)` | Identificador único da tarefa |
| `note_id` | `TEXT (FK -> notes.id ON DELETE CASCADE)` | Nota de origem |
| `text` | `TEXT` | Descrição do item |
| `done` | `INTEGER (0/1)` | Estado de conclusão (`CHECK (done IN (0, 1))`) |
| `due_date` | `TEXT (ISO-8601)` (nullable) | Prazo opcional para follow-up (`YYYY-MM-DD` ou RFC3339) |
| `pipedrive_activity_id` | `INTEGER` (nullable) | ID da atividade criada no Pipedrive |

### `integration_logs`
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `TEXT (UUID)` | Identificador do log |
| `note_id` | `TEXT (FK -> notes.id ON DELETE CASCADE)` | Nota relacionada |
| `author_id` | `TEXT` | Usuário CS que disparou a ação |
| `target` | `TEXT` | `pipedrive` ou `n8n` |
| `status` | `TEXT` | `pending`, `sent` ou `error` |
| `payload_json` | `TEXT` | Payload enviado (para auditoria e retry) |
| `response_status` | `INTEGER` (nullable) | Código HTTP retornado |
| `error_message` | `TEXT` (nullable) | Mensagem de erro, quando houver |
| `created_at` | `TEXT (ISO-8601)` | Momento da tentativa |

### `cs_profile` (apenas SQLite local)
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `singleton` | `INTEGER (PK CHECK (singleton = 1))` | Garante registro único do perfil local ativo |
| `author_id` | `TEXT` | Identificador do usuário CS |
| `author_name` | `TEXT` | Nome exibido nas notas e futuros logs |
| `token` | `TEXT` | Token identificador write-only (nunca retornado ao frontend) |
| `updated_at` | `TEXT (ISO-8601)` | Última atualização do perfil |

### `dock_appearance` (apenas SQLite local)
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `singleton` | `INTEGER (PK CHECK (singleton = 1))` | Garante registro único de preferências visuais do dock |
| `theme` | `TEXT` (`'dark' \| 'light' \| 'high-contrast'`) | Tema ativo aplicado em `DockRail` e `DockPanel` |
| `accent` | `TEXT` (`'violet' \| 'blue' \| 'emerald' \| 'amber'`) | Cor de destaque ativa |
| `expanded_opacity` | `INTEGER` (`40..100`) | Opacidade percentual do dock expandido |
| `collapsed_opacity` | `INTEGER` (`40..100`) | Opacidade percentual do dock retraído |
| `panel_size` | `TEXT` (`'compact' \| 'default' \| 'wide'`) | Preset de largura do painel expandido |
| `updated_at` | `TEXT (ISO-8601)` | Última atualização de aparência |

---

## 2. Contrato `src/lib/bridge.ts` (Frontend -> Rust)

```ts
export type DockTheme = "dark" | "light" | "high-contrast";
export type DockAccent = "violet" | "blue" | "emerald" | "amber";
export type DockPanelSize = "compact" | "default" | "wide";

export interface DockAppearance {
  theme: DockTheme;
  accent: DockAccent;
  expandedOpacity: number;
  collapsedOpacity: number;
  panelSize: DockPanelSize;
}

export interface UpdateDockAppearanceInput {
  theme?: DockTheme;
  accent?: DockAccent;
  expandedOpacity?: number;
  collapsedOpacity?: number;
  panelSize?: DockPanelSize;
}

export interface ActiveProfile {
  authorId: string;
  authorName: string;
  hasToken: boolean;
  isConfigured: boolean;
}

export interface SetActiveProfileInput {
  authorId: string;
  authorName: string;
  token?: string;
  clearToken?: boolean;
}

export interface Note {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  contentMd: string;
  pipedriveDealId: number | null;
  pipedrivePersonId: number | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
}

export interface SaveNoteDraftInput {
  id?: string;
  title: string;
  contentMd: string;
  pipedriveDealId?: number | null;
  pipedrivePersonId?: number | null;
}

export interface Todo {
  id: string;
  noteId: string;
  text: string;
  done: boolean;
  dueDate: string | null;
  pipedriveActivityId: number | null;
}

export interface UpsertTodoInput {
  id?: string;
  noteId: string;
  text: string;
  done?: boolean;
  dueDate?: string | null;
}

export interface DealSummary {
  id: number;
  title: string;
  orgName?: string;
}

export interface DispatchResult {
  logId: string;
  status: "sent" | "error";
  message: string;
}

export type PipedriveSendType = "note" | "activity";

export interface SendToPipedriveInput {
  noteId: string;
  type: PipedriveSendType;
  dealId: number;
}

export interface TriggerN8nWebhookInput {
  noteId: string;
  webhookKey?: string;
}

export interface SyncResult {
  syncedNotes: number;
  syncedLogs: number;
}

// Wrappers de integrações implementados em src/lib/bridge.ts
// searchPipedriveDeals(query: string) -> Promise<DealSummary[]>
// sendToPipedrive(params: SendToPipedriveInput) -> Promise<DispatchResult>
// triggerN8nWebhook(params: TriggerN8nWebhookInput) -> Promise<DispatchResult>
// syncSupabase() -> Promise<SyncResult>
```

---

## 3. Comandos IPC Implementados

### Dock Minimalista
| Comando / Evento | Direção | Descrição |
| :--- | :--- | :--- |
| `get_dock_state` | Frontend -> Rust | Retorna borda ativa (`right`, `left`, `top`), estado `expanded`, `alwaysOnTop`, `visible` e atalhos globais. |
| `set_dock_edge(edge)` | Frontend -> Rust | Encaixa e redimensiona a janela na borda `right`, `left` ou `top` (também acionado automaticamente ao arrastar e soltar próximo a uma borda). |
| `set_dock_expanded(expanded)` | Frontend -> Rust | Alterna explicitamente entre a barra minimalista recolhida e o painel expandido mantendo o encaixe na borda. |
| `toggle_dock_expanded` | Frontend -> Rust | Alterna o estado recolhido/expandido (usado também pelo atalho `Alt+Space` e clique na bandeja). |
| `set_always_on_top(enabled)` | Frontend -> Rust | Alterna fixação da janela acima das demais. |
| `hide_dock` | Frontend -> Rust | Oculta completamente a janela para a bandeja do sistema (*system tray*). |
| `dock://new-note` | Rust -> Frontend | Evento emitido pelo atalho global `Ctrl+Shift+N` ou item da tray para expandir e focar nova nota. |
| `dock://state-changed` | Rust -> Frontend | Sincroniza o estado do dock na UI quando alterado via tray, atalho global ou drag-snap. |

### Persistência Local SQLite e Perfil CS
| Comando | Argumentos | Retorno / Comportamento |
| :--- | :--- | :--- |
| `save_note_draft` | `{ note: SaveNoteDraftInput }` | Faz upsert em `notes` (`ON CONFLICT DO UPDATE`), preserva `created_at` e `todos`, promove autor `local-cs` após configurar perfil e retorna `Note`. |
| `list_notes` | — | Lista todas as notas ordenadas por `updated_at DESC, rowid DESC`. |
| `get_note` | `{ id: string }` | Busca uma nota por ID (`Note | null`). |
| `delete_note` | `{ id: string }` | Remove a nota e seus registros dependentes em `todos` / `integration_logs` via `ON DELETE CASCADE`. |
| `list_todos` | `{ noteId: string | null }` | Lista tarefas da nota informada ou todas as tarefas quando `noteId` é `null`. |
| `upsert_todo` | `{ todo: UpsertTodoInput }` | Valida `text`, `dueDate` e existência de `noteId`; cria ou atualiza registro em `todos`. |
| `toggle_todo` | `{ id: string }` | Alterna `done` (`0`/`1`) no SQLite e retorna o `Todo` atualizado. |
| `delete_todo` | `{ id: string }` | Remove a tarefa por ID. |
| `set_active_profile` | `{ profile: SetActiveProfileInput }` | Salva `authorId`, `authorName` e opcionalmente atualiza ou limpa `token` no SQLite; retorna `ActiveProfile` sem o token bruto. |
| `get_active_profile` | — | Retorna o perfil salvo (`isConfigured: true`) ou fallback (`local-cs` / `CS Local`, `isConfigured: false`) sem expor `token`. |
| `get_dock_appearance` | — | Retorna preferências visuais salvas em `dock_appearance` ou valores padrão (`dark`, `violet`, `100%`, `100%`, `default`). |
| `set_dock_appearance` | `{ appearance: UpdateDockAppearanceInput }` | Persiste patch parcial em `dock_appearance` com clamp de opacidade (`40..100`) e redimensiona imediatamente a janela expandida quando `panelSize` muda. |
| `reset_dock_appearance` | — | Remove customizações de `dock_appearance`, restaura padrões originais e reaplica largura padrão na janela expandida. |

### Integrações Externas (Infra IPC + `reqwest` + `.env`)
| Comando | Argumentos | Retorno / Comportamento |
| :--- | :--- | :--- |
| `search_pipedrive_deals` | `{ query: string }` | Consulta `GET /deals/search?term=<query>&limit=10` no Pipedrive via header `x-api-token` e retorna `DealSummary[]` (`{ id, title, orgName? }`) sem expor o token. |
| `send_to_pipedrive` | `{ noteId: string, kind: "note" | "activity", dealId: number, todoId?: string }` | No `bridge.ts`, `sendToPipedrive` traduz `type` para `kind` (e repassa `todoId` quando informado). Envia `POST /notes` ou `POST /activities` via `reqwest`, persiste `pipedrive_activity_id` em `todos` e grava tentativa (`sent` ou `error`) em `integration_logs`. |
| `trigger_n8n_webhook` | `{ noteId: string, webhookKey: string | null }` | Valida nota local e `N8N_WEBHOOK_URL`; disparo HTTP na issue #11. |
| `sync_supabase` | — | Valida `SUPABASE_URL` / `SUPABASE_ANON_KEY` e consulta pendências em `notes` / `integration_logs`; sync PostgREST na issue #12. |
