# QuickNote CRM

Dock desktop leve em **Tauri v2 (Rust)** + **React + TypeScript + Tailwind CSS** para equipes de **Customer Success (CS)** registrarem notas e tarefas durante reuniões — offline-first, com envio sob demanda para **Pipedrive** e **n8n** e auditoria/backup no **Supabase**.

## Estado Atual (`v0.1`)

- **Dock flutuante (*frameless*):** janela compacta (`360×520`), `always-on-top` e fora da barra de tarefas (`skipTaskbar`).
- **Ancoragem rápida:** 5 posições nos cantos e topo (`top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-right`) com cálculo por monitor, escala DPI e margem da barra de tarefas.
- **System Tray:** clique esquerdo alterna visibilidade; menu de contexto permite trocar âncora, abrir nova nota ou encerrar o app.
- **Atalhos globais:**
  - `Alt+Space` — mostrar/ocultar e focar o dock.
  - `Ctrl+Shift+N` — abrir o dock pronto para uma nova nota.
  - `Esc` — recolher o dock para a bandeja.
- **Fronteira IPC isolada:** toda comunicação da UI com o sistema passa por `src/lib/bridge.ts` -> comandos Rust (`#[tauri::command]`).

## Stack

- **Desktop & Backend:** Rust, Tauri v2, `tauri-plugin-global-shortcut`
- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS v4, Lucide
- **Gerenciador de pacotes:** `pnpm`

## Pré-requisitos

- **Node.js** 20+ e **pnpm** 10+
- **Rust** (`rustup` + toolchain MSVC no Windows)
- **WebView2** (já nativo no Windows 10/11)

## Como Rodar Localmente

```bash
# Instalar dependências do frontend
pnpm install

# Abrir o dock nativo em modo desenvolvimento
pnpm tauri dev
```

### Validação e Testes

```bash
# Typecheck + build de produção do frontend
pnpm build

# Testes unitários do backend Rust (cálculo de âncoras e DPI)
cd src-tauri && cargo test
```

## Estrutura do Repositório

```text
quicknote-crm/
├── AGENTS.md              # Guia operacional e regras de arquitetura
├── docs/                  # Documentação viva (blueprint, arquitetura, modelo de dados, integrações)
├── src/                   # Frontend React + TypeScript + Tailwind
│   ├── components/        # Componentes do dock (DockHeader)
│   ├── lib/bridge.ts      # Contrato único de IPC com o Rust
│   └── App.tsx
└── src-tauri/             # Backend Rust (Tauri v2)
    └── src/
        ├── dock.rs        # Ancoragem, system tray e atalhos globais
        ├── commands.rs    # Comandos Tauri expostos ao frontend
        └── lib.rs
```

## Roadmap

- **v0.1 (atual):** Scaffold Tauri v2, janela dock ancorável, system tray e atalhos globais.
- **Marco 2:** SQLite local offline-first (`notes`, `todos`), perfil local CS (`author_id`, `author_name`, `token`) e persistência real na UI.
- **Marco 3:** Integrações no backend Rust (`reqwest`) com Pipedrive, webhook n8n e backup/logs no Supabase.
- **v1.1+:** Criptografia local com SQLCipher e cofre nativo de credenciais (`keyring`).
- **v2:** Transcrição/formatação de atas via Gemini API e busca semântica local.

## Documentação

- [Índice da Documentação](./docs/README.md)
- [Blueprint do Produto](./docs/blueprint.md)
- [Arquitetura e ADRs](./docs/architecture.md)
- [Modelo de Dados e Contrato IPC](./docs/data-model.md)
- [Integrações (Pipedrive, n8n, Supabase)](./docs/integrations.md)
- [Guia para Agentes (`AGENTS.md`)](./AGENTS.md)