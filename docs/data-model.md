# Modelo de Dados e Contrato IPC

## 1. Tabelas (SQLite Local & Supabase)

### `notes`
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `TEXT (UUID)` | Identificador único da nota |
| `author_id` | `TEXT` | Identificador do usuário CS (perfil local) |
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
| `note_id` | `TEXT (FK -> notes.id)` | Nota de origem |
| `text` | `TEXT` | Descrição do item |
| `done` | `INTEGER (0/1)` | Estado de conclusão |
| `due_date` | `TEXT (ISO-8601)` (nullable) | Prazo opcional para follow-up |
| `pipedrive_activity_id` | `INTEGER` (nullable) | ID da atividade criada no Pipedrive |

### `integration_logs`
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `TEXT (UUID)` | Identificador do log |
| `note_id` | `TEXT (FK -> notes.id)` | Nota relacionada |
| `author_id` | `TEXT` | Usuário CS que disparou a ação |
| `target` | `TEXT` | `pipedrive` ou `n8n` |
| `status` | `TEXT` | `pending`, `sent` ou `error` |
| `payload_json` | `TEXT` | Payload enviado (para auditoria e retry) |
| `response_status` | `INTEGER` (nullable) | Código HTTP retornado |
| `error_message` | `TEXT` (nullable) | Mensagem de erro, quando houver |
| `created_at` | `TEXT (ISO-8601)` | Momento da tentativa |

---

## 2. Contrato `src/lib/bridge.ts` (Frontend -> Rust)

```ts
export interface ActiveProfile {
  authorId: string;
  authorName: string;
  token: string;
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

// Comandos Tauri planejados
// saveNoteDraft(note) -> Promise<Note>
// listNotes() -> Promise<Note[]>
// setActiveProfile(profile: ActiveProfile) -> Promise<void>
// searchPipedriveDeals(query: string) -> Promise<DealSummary[]>
// sendToPipedrive(params: { noteId: string; type: "note" | "activity"; dealId: number }) -> Promise<DispatchResult>
// triggerN8nWebhook(params: { noteId: string; webhookKey?: string }) -> Promise<DispatchResult>
// syncSupabase() -> Promise<{ syncedNotes: number; syncedLogs: number }>
```

---

## 3. Comandos IPC Implementados (Dock Minimalista)

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