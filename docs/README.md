# Documentação — QuickNote CRM

Índice vivo da documentação técnica e de produto do `quicknote-crm`.

| Documento | O que cobre | Status |
| :--- | :--- | :--- |
| [blueprint.md](./blueprint.md) | Visão do produto, escopo MVP, v1.1 (segurança) e v2 (Gemini / embeddings) | Ativo |
| [architecture.md](./architecture.md) | Fronteira React/Rust, módulos do backend, fluxo offline-first e decisões (ADRs) | Inicial |
| [data-model.md](./data-model.md) | Tabelas SQLite/Supabase e contrato IPC (`bridge.ts`) | Inicial |
| [integrations.md](./integrations.md) | Especificação Pipedrive, n8n e Supabase, payloads e `.env` | Inicial |

## Regra de Manutenção
Sempre que uma funcionalidade, tabela, comando IPC ou integração for adicionada ou alterada, atualize o arquivo correspondente nesta pasta no mesmo commit.
