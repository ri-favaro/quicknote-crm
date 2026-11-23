# Arquitetura — QuickNote CRM

## Visão em Camadas

```mermaid
flowchart LR
    UI["Frontend React + TS (Edge Rail + Painel)"] -->|invoke via bridge.ts| Rust["Backend Rust (Tauri v2)"]
    Rust --> Dock["dock.rs (Borda Direita/Esquerda/Topo + Tray + Atalhos)"]
    Rust --> DB["db.rs (SQLite Local Offline-First)"]
    Rust --> Pipe["integrations/pipedrive.rs"]
    Rust --> N8N["integrations/n8n.rs"]
    Rust --> Supa["integrations/supabase.rs"]
```

## Estrutura de Pastas Atual e Planejada

```text
quicknote-crm/
├── AGENTS.md
├── docs/
│   ├── README.md
│   ├── blueprint.md
│   ├── architecture.md
│   ├── data-model.md
│   ├── integrations.md
│   └── multi-os-checklist.md
├── src/                        # Frontend React + TypeScript + Tailwind
│   ├── components/
│   │   ├── DockRail.tsx        # Barra minimalista ancorada na borda
│   │   ├── AppearanceSettingsCard.tsx # Customização de tema, cor, largura e opacidade
│   │   ├── DockPanel.tsx       # Painel expandido (notas, tarefas, ajustes)
│   │   ├── IntegrationSettingsCard.tsx # Configuração local de Pipedrive, n8n e Supabase
│   │   ├── NotePicker.tsx      # Seletor de notas com busca (título + conteúdo), data e deal
│   │   ├── PipedriveBar.tsx    # Busca de deals e disparo para o Pipedrive
│   │   └── ProfileSettingsCard.tsx # Configuração do perfil CS ativo
│   ├── lib/
│   │   └── bridge.ts           # Contrato único de IPC com o backend Rust + fallback web
│   └── App.tsx                 # Estado do dock, hidratação e autosave com flush
└── src-tauri/                  # Backend Rust (Tauri v2)
    └── src/
        ├── main.rs
        ├── lib.rs
        ├── dock.rs             # Encaixe nas bordas (right/left/top), recolher/expandir, drag-snap, tray e atalhos
        ├── db.rs               # Conexão SQLite (WAL + FKs), CRUD de notes/todos/cs_profile e helpers de integration_logs
        ├── commands.rs         # Comandos #[tauri::command] expostos ao frontend
        └── integrations/       # Infra HTTP (reqwest + dotenvy) e contratos Pipedrive, n8n, Supabase
            ├── mod.rs
            ├── pipedrive.rs
            ├── n8n.rs
            └── supabase.rs
```

## Registro de Decisões (ADRs)

| Data | Decisão | Motivo |
| :--- | :--- | :--- |
| 2026-11-18 | Tauri v2 + Rust como stack principal | Menor consumo de RAM/binário para app residente em dock/tray durante o dia todo. |
| 2026-11-18 | Perfil local + token no MVP (sem fluxo completo de login) | Garante rastreabilidade por membro de CS sem atrasar a entrega funcional inicial. |
| 2026-11-18 | SQLCipher e `keyring` postergados para v1.1+ | Reduz atrito inicial de build no Windows/MSVC enquanto valida o fluxo ponta a ponta. |
| 2026-11-18 | Toda chamada HTTP no backend Rust (`reqwest`) | Evita CORS e mantém tokens/webhooks fora do bundle React. |
| 2026-11-18 | Barra minimalista colada na borda (`right`/`left`/`top`) com janela transparente única | Reduz intrusão visual durante reuniões mantendo expansão instantânea para notas, tarefas e ajustes. |
| 2026-11-19 | `rusqlite` com feature `bundled`, `WAL`, `PRAGMA foreign_keys = ON` e `ON CONFLICT DO UPDATE` | Elimina dependência de DLL SQLite no Windows, protege integridade referencial e evita que `INSERT OR REPLACE` apague tarefas vinculadas via `ON DELETE CASCADE`. |
| 2026-11-19 | Token do perfil CS write-only na fronteira IPC | `set_active_profile` grava o token no SQLite e `ActiveProfile` devolve apenas `hasToken` e `isConfigured`, mantendo o segredo isolado no backend Rust. |
| 2026-11-20 | CI matrix Rust/Tauri em `windows-latest`, `macos-latest` e `ubuntu-22.04` + ícones `.icns`/`@2x.png` | Garante compilação, testes e assets de bundle válidos nos 3 sistemas mantendo `noRedirectionBitmap` para Windows (ignorado em macOS/Linux) e transparência nativa no Tauri 2.12.1+. |
| 2026-11-23 | Assinatura ad-hoc do bundle macOS (`signingIdentity: "-"`) até haver Developer ID + notarização | O `.app` só com assinatura do linker era rejeitado pelo Gatekeeper como "danificado" após download; o ad-hoc sela o bundle e permite liberar via **Abrir Mesmo Assim**, sem custo de conta Apple Developer. |
