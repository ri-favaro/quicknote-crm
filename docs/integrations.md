# Integrações — QuickNote CRM

Todas as integrações são executadas exclusivamente pelo backend Rust (`reqwest`) e registram o resultado em `integration_logs`.

## 1. Variáveis de Ambiente (MVP)
Criar `.env.example` quando o scaffold iniciar (nunca commitar `.env`):
- `PIPEDRIVE_API_BASE` — ex: `https://api.pipedrive.com/v1`
- `PIPEDRIVE_API_TOKEN` — token da conta Pipedrive
- `N8N_WEBHOOK_URL` — URL do webhook de entrada no n8n
- `N8N_WEBHOOK_SECRET` — header opcional de autenticação (`X-Webhook-Secret`)
- `SUPABASE_URL` — URL do projeto Supabase
- `SUPABASE_ANON_KEY` — chave para PostgREST (ou chave apropriada conforme RLS definida)

## 2. Pipedrive (Sob Demanda)
- **Autenticação:** enviada exclusivamente pelo backend Rust via header HTTP `x-api-token` (nunca na query string e nunca exposta ao frontend ou a `integration_logs`).
- **Busca de Deals:** `GET /deals/search?term=<query>&limit=10`, retornando lista enxuta `{ id, title, orgName? }` para autocomplete na nota.
- **Criar Nota (`Note`):** `POST /notes` com `content` (título + Markdown), `deal_id` e `person_id` (quando presente).
- **Criar Atividade (`Activity`):** `POST /activities` (`type: "task"`, `subject`, `deal_id`, `due_date`, `done`) para um `todoId` específico ou para todos os to-dos abertos ainda sem `pipedrive_activity_id` da nota, persistindo o `data.id` retornado em `todos.pipedrive_activity_id`.
- **Auditoria:** toda tentativa grava `payload_json`, `response_status`, `status` (`sent` ou `error`) e `error_message` sanitizada em `integration_logs` (`target = "pipedrive"`).

## 3. n8n (Webhook POST Sob Demanda)
Payload JSON padrão enviado ao webhook:

```json
{
  "source": "quicknote-crm",
  "note_id": "uuid",
  "author": {
    "id": "cs-01",
    "name": "Nome do CS"
  },
  "pipedrive": {
    "deal_id": 12345,
    "person_id": null
  },
  "title": "Alinhamento semanal",
  "markdown": "## Pontos discutidos...",
  "todos": [
    { "text": "Enviar proposta revisada", "done": false, "due_date": "2026-11-20" }
  ],
  "sent_at": "2026-11-18T22:50:00-03:00"
}
```

## 4. Supabase (Backup & Auditoria)
- Sincroniza `notes`, `todos` e `integration_logs` via PostgREST (`upsert` por `id`).
- Itens que falharem no envio para Pipedrive ou n8n permanecem marcados como `error` para reenvio manual pela UI.

## 5. Integrações Futuras (v2)
- **Gemini API:** transcrição de áudio de reunião e formatação automática do texto em ata + lista de ações.
