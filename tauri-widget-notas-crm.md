# QuickNote CRM — Dock Desktop para CS (Tauri v2 + Rust)

**Data:** 2026-11-18  
**Status:** Planejamento de MVP  
**Stack principal:** Tauri v2 (Rust) + React + TypeScript + Tailwind  
**Integrações:** Pipedrive, n8n, Supabase (+ SQLite local)

---

## 1. Visão Geral
Aplicativo desktop leve em **Rust (Tauri v2)** em formato **dock**, pensado para equipes de **Customer Success (CS)** registrarem anotações e tarefas durante reuniões e enviarem os registros sob demanda para o **Pipedrive** e automações no **n8n**, com backup e auditoria no **Supabase**.

Também serve como estudo prático de **Rust + Tauri v2** (e base de comparação futura com Electron em consumo de RAM, tamanho de binário e responsividade).

---

## 2. Escopo do MVP

### Entra no MVP
- **Interface em formato Dock:** janela compacta *always-on-top*, *frameless*, ancorável nos cantos ou no topo da tela.
- **Atalhos globais:**
  - `Alt+Space` — mostrar/esconder e focar o dock.
  - `Ctrl+Shift+N` — iniciar nova nota rápida.
- **Bloco de notas + To-do rápido:** captura em Markdown e checklist salva automaticamente no SQLite local (funciona offline).
- **Rastreabilidade por usuário (CS):** perfil local + token identificador do usuário gravado em cada nota e log de envio (sem fluxo completo de login no MVP).
- **Vínculo e envio manual/sob demanda para o Pipedrive:** busca rápida de *Deals* / *Persons* para associar a nota e criar `Note` ou `Activity` no CRM.
- **Disparo de Webhook n8n:** `POST` sob demanda com payload estruturado (`title`, `markdown`, `todos[]`, `deal_id`, `author`, `timestamp`).
- **Sync e backup no Supabase:** sincronização das notas e histórico de envios (`pending | sent | error`).
- **Feedback visual:** notificações claras de sucesso, pendência e erro (com opção de reenvio).

### Planejado para v1.1+ (Segurança Local)
- **Criptografia do SQLite com SQLCipher** para proteger dados de clientes em disco.
- **Cofre seguro de credenciais** usando o gerenciador nativo do sistema operacional (`keyring` / Windows Credential Manager).

*(No MVP, tokens e URLs ficam isolados no backend Rust via configuração local/`.env`, nunca expostos no frontend React.)*

### Integrações Futuras (v2)
- **API do Gemini:** transcrição de voz e formatação automática de atas/notas de reunião.
- **Busca semântica local:** indexação das notas antigas com modelo de embedding local (`fastembed-rs` / `all-MiniLM-L6-v2`) para recuperar decisões por significado.
- **Benchmark Electron:** versão equivalente reaproveitando o mesmo frontend para comparação de RAM, binário e latência.

---

## 3. Arquitetura

```
Frontend (React + TS + Vite)
   │  chama apenas invoke() via bridge.ts
   ▼
Backend Rust (Tauri v2)
   ├── dock.rs                  (posicionamento nos cantos/topo, tray e atalhos Alt+Space / Ctrl+Shift+N)
   ├── db.rs                    (SQLite local: notas, tarefas, perfil local, fila offline)
   └── integrations/
         ├── pipedrive.rs       (reqwest -> api.pipedrive.com/v1)
         ├── n8n.rs             (reqwest -> Webhook POST)
         └── supabase.rs        (reqwest -> PostgREST sync + logs)
```

---

## 4. Modelo de Dados Mínimo

### Local (SQLite) & Supabase
- **`notes`**: `id`, `author_id`, `author_name`, `title`, `content_md`, `pipedrive_deal_id`, `pipedrive_person_id`, `created_at`, `updated_at`, `synced_at`
- **`todos`**: `id`, `note_id`, `text`, `done`, `due_date`, `pipedrive_activity_id`
- **`integration_logs`**: `id`, `note_id`, `author_id`, `target` (`pipedrive` | `n8n`), `status` (`pending` | `sent` | `error`), `payload_json`, `response_status`, `error_message`, `created_at`

---

## 5. Contrato `bridge.ts` (Frontend -> Rust)
- `saveNoteDraft(note)` -> salva no SQLite local imediatamente.
- `setActiveProfile({ authorId, authorName, token })` -> define o usuário CS ativo para rastreabilidade.
- `searchPipedriveDeals(query)` -> retorna lista enxuta `{ id, title, org_name }`.
- `sendToPipedrive({ noteId, type: "note" | "activity", dealId })` -> envia e grava em `integration_logs`.
- `triggerN8nWebhook({ noteId, webhookKey })` -> dispara `POST` e grava em `integration_logs`.
- `syncSupabase()` -> sincroniza notas e logs pendentes.

---

## 6. Próximos Passos
1. Inicializar o projeto Tauri v2 (`create-tauri-app` com React + TypeScript) neste repositório.
2. Subir a UI em formato dock com `bridge.ts` mockado e notificações de feedback.
3. Implementar SQLite local + posicionamento do dock + atalhos globais (`Alt+Space`, `Ctrl+Shift+N`) em Rust.
4. Conectar Pipedrive, n8n e Supabase via `reqwest`.
