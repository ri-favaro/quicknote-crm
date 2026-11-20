# QuickNote CRM

Dock desktop leve em **Tauri v2 (Rust)** + **React + TypeScript + Tailwind CSS** para equipes de **Customer Success (CS)** registrarem notas e tarefas durante reuniões — offline-first, com envio sob demanda para **Pipedrive** e **n8n** e auditoria/backup no **Supabase**.

## Download e Instalação

Os instaladores pré-compilados ficam disponíveis na página de [Releases do GitHub](https://github.com/ri-favaro/quicknote-crm/releases).

### Windows (10/11)
1. Baixe o instalador `.msi` ou `.exe` (NSIS) da versão mais recente em **Assets**.
2. Execute o instalador e conclua o assistente.
3. Abra o **QuickNote CRM** pelo Menu Iniciar (o dock inicia recolhido na borda da tela e na bandeja do sistema).

### macOS (Apple Silicon e Intel)
1. Baixe o arquivo `.dmg` compatível com o seu Mac (`aarch64` para Apple Silicon M1/M2/M3+ ou `x64` para Intel).
2. Abra o `.dmg` e arraste **QuickNote CRM** para a pasta **Aplicativos**.
3. Para usar os atalhos globais (`Alt+Space` e `Ctrl+Shift+N`), libere o app em **Ajustes do Sistema → Privacidade e Segurança → Acessibilidade**.

### Linux (Ubuntu / Debian / AppImage)
- **AppImage:** baixe o `.AppImage`, dê permissão de execução e abra:
  ```bash
  chmod +x QuickNote*.AppImage
  ./QuickNote*.AppImage
  ```
- **Debian / Ubuntu (`.deb`):**
  ```bash
  sudo apt install ./quicknote-crm_*.deb
  ```
- **Observações:** no GNOME, o ícone de bandeja requer a extensão **AppIndicator**. Em sessões **Wayland** puras, posicionamento manual de janela e atalhos globais podem ter restrições do compositor (consulte [`docs/multi-os-checklist.md`](./docs/multi-os-checklist.md)).

> **Aviso sobre binários sem assinatura digital (*code signing*):**
> Os executáveis atuais ainda não são assinados digitalmente, portanto o sistema operacional pode exibir um alerta de segurança na primeira abertura:
> - **Windows (SmartScreen):** clique em **Mais informações** → **Executar assim mesmo**.
> - **macOS (Gatekeeper):** clique com o botão direito em **QuickNote CRM.app** → **Abrir**, ou acesse **Ajustes do Sistema → Privacidade e Segurança** e clique em **Abrir Mesmo Assim**. Se o macOS bloquear por quarentena, remova o atributo com `xattr -cr "/Applications/QuickNote CRM.app"`.

## Primeira Configuração (Aba Ajustes)

1. Abra o dock usando `Alt+Space` (ou clique no ícone da bandeja do sistema) e acesse a aba **Ajustes**.
2. **Perfil CS ativo:** informe seu **ID** (ex.: `cs-01`), **Nome** e, se aplicável, o token local, depois clique em **Salvar perfil**. Todas as notas e logs locais passam a registrar essa autoria no SQLite.
3. **Integrações (opcional):** o app funciona 100% offline sem configurar integrações. Quando quiser habilitar o envio sob demanda, preencha os campos desejados e clique em **Salvar integrações**:
   - **Pipedrive:** URL base da API e Token de API.
   - **n8n:** URL do webhook e segredo opcional.
   - **Supabase:** URL do projeto e chave `anon`.
   *(As credenciais ficam armazenadas apenas no backend local e nunca são expostas no frontend.)*
4. **Aparência:** escolha tema (**Escuro**, **Claro** ou **Alto contraste**), cor de destaque, tamanho do painel e opacidade.

## Estado Atual (`v0.1`)

- **Dock flutuante (*frameless*):** janela compacta retrátil nas bordas (`right`, `left`, `top`), `always-on-top` e fora da barra de tarefas (`skipTaskbar`).
- **Persistência offline-first:** notas, tarefas e perfil CS salvos imediatamente em SQLite local.
- **Integrações sob demanda:** Pipedrive, webhook n8n e backup/auditoria no Supabase configuráveis pela aba **Ajustes**.
- **System Tray:** clique esquerdo alterna visibilidade; menu de contexto permite trocar borda, abrir nova nota ou encerrar o app.
- **Atalhos globais:**
  - `Alt+Space` — mostrar/ocultar e focar o dock.
  - `Ctrl+Shift+N` — abrir o dock pronto para uma nova nota.
  - `Esc` — recolher o dock.
- **Fronteira IPC isolada:** toda comunicação da UI com o sistema passa por `src/lib/bridge.ts` -> comandos Rust (`#[tauri::command]`).

## Stack

- **Desktop & Backend:** Rust, Tauri v2, `rusqlite`, `reqwest`, `tauri-plugin-global-shortcut`
- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS v4, Lucide
- **Gerenciador de pacotes:** `pnpm`

## Desenvolvimento Local

### Pré-requisitos

- **Node.js** 22+ e **pnpm** 10+
- **Rust** (`rustup` + toolchain MSVC no Windows; dependências WebKitGTK 4.1 no Linux — veja [`docs/multi-os-checklist.md`](./docs/multi-os-checklist.md))
- **WebView2** (já nativo no Windows 10/11)

### Como Rodar

```bash
# Instalar dependências do frontend
pnpm install

# Abrir o dock nativo em modo desenvolvimento
pnpm tauri dev
```

### Validação e Testes

```bash
# Typecheck, testes unitários e build do frontend
pnpm typecheck
pnpm test
pnpm build

# Checagem e testes unitários do backend Rust
cd src-tauri && cargo check && cargo test
```

### Publicação de Releases (GitHub Actions)

O workflow [`.github/workflows/release.yml`](./.github/workflows/release.yml) gera os instaladores de **Windows**, **macOS (`aarch64` e `x64`)** e **Linux** e anexa todos os artefatos em uma **Draft Release** no GitHub:
- **Automático:** ao enviar uma tag semântica `v*` (ex.: `git tag v0.1.0 && git push origin v0.1.0`).
- **Manual (teste):** pela aba **Actions → Release → Run workflow** (`workflow_dispatch`), opcionalmente informando `tag_name`.

## Estrutura do Repositório

```text
quicknote-crm/
├── .github/workflows/     # CI multi-OS (ci.yml) e build de releases (release.yml)
├── AGENTS.md              # Guia operacional e regras de arquitetura
├── docs/                  # Documentação viva (blueprint, arquitetura, modelo de dados, integrações, multi-OS)
├── src/                   # Frontend React + TypeScript + Tailwind
│   ├── components/        # Componentes do dock e aba Ajustes
│   ├── lib/bridge.ts      # Contrato único de IPC com o Rust
│   └── App.tsx
└── src-tauri/             # Backend Rust (Tauri v2)
    └── src/
        ├── dock.rs        # Ancoragem, system tray e atalhos globais
        ├── commands.rs    # Comandos Tauri expostos ao frontend
        └── lib.rs
```

## Documentação

- [Índice da Documentação](./docs/README.md)
- [Blueprint do Produto](./docs/blueprint.md)
- [Arquitetura e ADRs](./docs/architecture.md)
- [Modelo de Dados e Contrato IPC](./docs/data-model.md)
- [Integrações (Pipedrive, n8n, Supabase)](./docs/integrations.md)
- [Checklist Multi-OS](./docs/multi-os-checklist.md)
- [Guia para Agentes (`AGENTS.md`)](./AGENTS.md)