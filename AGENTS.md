# AGENTS.md — QuickNote CRM (`quicknote-crm`)

Guia operacional vivo para qualquer agente trabalhando neste repositório. Mantenha este arquivo e a pasta `docs/` atualizados sempre que decisões de arquitetura, contratos IPC, schema ou integrações mudarem.

## 1. Sobre o Projeto
- **Produto:** Dock desktop leve em **Tauri v2 (Rust)** + **React + TypeScript + Tailwind** para equipes de **Customer Success (CS)**.
- **Fluxo principal:** Captura rápida de notas e to-dos durante reuniões (offline-first em SQLite) com envio manual/sob demanda para **Pipedrive** e **n8n**, e backup/auditoria no **Supabase**.
- **Atalhos globais planejados:** `Alt+Space` (abrir/focar dock) e `Ctrl+Shift+N` (nova nota rápida).

## 2. Mapa da Documentação (`docs/`)
Consulte e atualize o documento correspondente antes/depois de mudanças relevantes:
- `docs/README.md` — Índice geral e status da documentação.
- `docs/blueprint.md` — Visão de produto, escopo do MVP, v1.1 (segurança) e v2 (Gemini, embeddings locais, benchmark Electron).
- `docs/architecture.md` — Estrutura de pastas, fronteira Frontend/Rust, módulos do backend e registro de decisões (ADRs).
- `docs/data-model.md` — Schema SQLite/Supabase (`notes`, `todos`, `integration_logs`) e contrato IPC (`bridge.ts`).
- `docs/integrations.md` — Contratos de API/Webhook (Pipedrive, n8n, Supabase), payloads e variáveis de ambiente.

## 3. Regras de Arquitetura e Segurança
- **Fronteira rígida de IPC:** O frontend React nunca chama APIs externas diretamente; toda comunicação passa por `src/lib/bridge.ts` -> comandos Tauri (`invoke`).
- **Segredos no backend:** Tokens e URLs sensíveis (`PIPEDRIVE_API_TOKEN`, `N8N_WEBHOOK_URL`, `SUPABASE_URL`, `SUPABASE_KEY`) ficam apenas no backend Rust (`.env`/config local no MVP; `keyring` + SQLCipher na v1.1+). Nunca expor segredos no bundle frontend.
- **Offline-first:** Toda edição de nota ou tarefa deve persistir no SQLite local imediatamente, sem depender de rede.
- **Rastreabilidade CS:** Toda nota e log de integração carrega `author_id` e `author_name` do perfil local ativo.
- **Feedback visual:** Toda ação externa (Pipedrive, n8n, Supabase) retorna status estruturado para exibir feedback claro de sucesso, pendência ou erro com opção de reenvio.

## 4. Padrões de Engenharia e Git
- **Idioma:** Documentação, commits e PRs em **pt-br**, com prefixos Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`).
- **Simplicidade:** Código enxuto, sem comentários óbvios e sem abstrações especulativas fora do escopo do MVP.
- **Documentação viva:** Ao alterar comandos Tauri, tabelas, payloads ou variáveis de ambiente, atualize `docs/` no mesmo commit.
- **Verificação real:** Sempre validar build/lint/testes (`cargo check`/`cargo test` e `npm run build`) antes de dar uma tarefa como pronta.
