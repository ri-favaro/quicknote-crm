# Documentação — QuickNote CRM

Índice vivo da documentação técnica e de produto do `quicknote-crm`.

| Documento | O que cobre | Status |
| :--- | :--- | :--- |
| [blueprint.md](./blueprint.md) | Visão do produto, escopo MVP, v1.1 (segurança) e v2 (Gemini / embeddings) | Ativo |
| [architecture.md](./architecture.md) | Fronteira React/Rust, módulos do backend, fluxo offline-first e decisões (ADRs) | Ativo |
| [data-model.md](./data-model.md) | Tabelas SQLite/Supabase e contrato IPC (`bridge.ts`) | Ativo |
| [integrations.md](./integrations.md) | Especificação Pipedrive, n8n e Supabase, payloads e `.env` | Inicial |
| [multi-os-checklist.md](./multi-os-checklist.md) | Matriz de CI, ícones de bundle e checklist/limitações por OS (Windows, macOS, Linux) | Ativo |
| [changelog.html](./changelog.html) | Changelog visual interativo com busca e filtros por categoria | Ativo |

## Regra de Manutenção
Sempre que uma funcionalidade, tabela, comando IPC ou integração for adicionada ou alterada, atualize o arquivo correspondente nesta pasta no mesmo commit.
