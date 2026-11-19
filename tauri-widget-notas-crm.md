# Ideia: Widget Desktop de Notas, To-Do e CRM (Tauri v2 + Rust)

**Data:** 2026-11-18  
**Status:** Ideia / Planejamento de MVP  
**Stack principal:** Tauri v2 (Rust) + React + TypeScript + Tailwind  
**Integrações:** Pipedrive, n8n, Supabase (+ SQLite local)

---

## 1. Objetivo
Criar um aplicativo desktop leve, residente na bandeja do sistema (*system tray*) e com janela compacta *always-on-top*, para capturar notas rápidas e tarefas durante reuniões e enviá-las para o CRM/automações com um atalho.

Também serve como estudo prático de **Rust + Tauri v2** (e base de comparação futura com Electron em consumo de RAM, tamanho de binário e responsividade).

---

## 2. Escopo do MVP

### Entra no MVP
- **Janela compacta (`always-on-top`):** modo *widget* (~360×480 px), *frameless*, abre/fecha por atalho global (ex: `Ctrl+Shift+Space`).
- **Bloco de notas + To-do rápido:** captura em Markdown / checklist salva automaticamente no SQLite local a cada alteração (funciona offline).
- **Vínculo rápido com Pipedrive:** busca de *Deals* / *Persons* recentes para associar a nota ou tarefa.
- **Envio para Pipedrive e n8n:**
  - Pipedrive: cria `Note` no negócio/contato ou `Activity` (follow-up).
  - n8n: dispara `POST` para webhook com payload estruturado (`title`, `markdown`, `todos[]`, `deal_id`, `timestamp`).
- **Sync e auditoria no Supabase:** backup das notas e log de envios (`pending | sent | error`) para reenvio em caso de falha.

### Fica para v2
- **Busca semântica local:** indexação das notas antigas com modelo de embedding local (ex: `fastembed-rs` / `all-MiniLM-L6-v2`) para encontrar decisões de reuniões passadas por significado.
- Versão equivalente em Electron reaproveitando o mesmo frontend (`ui/`) para benchmark lado a lado.

---

## 3. Arquitetura

```
Frontend (React + TS + Vite)
   │  chama apenas invoke() via bridge.ts
   ▼
Backend Rust (Tauri v2)
   ├── tray.rs                  (bandeja + atalho global)
   ├── db.rs                    (SQLite local: notas, tarefas, fila offline)
   └── integrations/
         ├── pipedrive.rs       (reqwest -> api.pipedrive.com/v1)
         ├── n8n.rs             (reqwest -> Webhook POST)
         └── supabase.rs        (reqwest -> PostgREST sync + logs)
```

**Regra de segurança:** todas as chamadas HTTP e credenciais (`PIPEDRIVE_API_TOKEN`, `N8N_WEBHOOK_URL`, `SUPABASE_URL`, `SUPABASE_KEY`) ficam exclusivamente no backend Rust.

---

## 4. Modelo de Dados Mínimo

### Local (SQLite) & Supabase
- **`notes`**: `id`, `title`, `content_md`, `pipedrive_deal_id`, `pipedrive_person_id`, `created_at`, `updated_at`, `synced_at`
- **`todos`**: `id`, `note_id`, `text`, `done`, `due_date`, `pipedrive_activity_id`
- **`integration_logs`**: `id`, `note_id`, `target` (`pipedrive` | `n8n`), `status` (`pending` | `sent` | `error`), `payload_json`, `response_status`, `error_message`, `created_at`

---

## 5. Contrato `bridge.ts` (Frontend -> Rust)
- `saveNoteDraft(note)` -> salva no SQLite local imediatamente.
- `searchPipedriveDeals(query)` -> retorna lista enxuta `{ id, title, org_name }`.
- `sendToPipedrive({ noteId, type: "note" | "activity", dealId })` -> envia e grava em `integration_logs`.
- `triggerN8nWebhook({ noteId, webhookKey })` -> dispara `POST` e grava em `integration_logs`.
- `syncSupabase()` -> sincroniza notas e logs pendentes.

---

## 6. Próximos Passos
1. Definir o diretório do repositório do projeto.
2. Inicializar o projeto Tauri v2 (`create-tauri-app` com React + TypeScript).
3. Subir a UI compacta com `bridge.ts` mockado.
4. Implementar SQLite local + tray + atalho global em Rust.
5. Conectar Pipedrive, n8n e Supabase via `reqwest`.
