# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [0.1.0] - 2026-11-20

### Recursos

- **config:** Configuração local das integrações na UI e SQLite ([3667743](https://github.com/ri-favaro/quicknote-crm/commit/36677436ab7932d8ad81bd34bc6e3c165fb95f1c))
- **ui:** Adicionar customização visual do dock nas configurações ([4372ce4](https://github.com/ri-favaro/quicknote-crm/commit/4372ce4159525d89045cb458d3db86cf98b49db8))
- **pipedrive:** Implementa busca de deals e envio de notas/atividades via reqwest ([04ef689](https://github.com/ri-favaro/quicknote-crm/commit/04ef68996cda3fdbfeb0883652999e85a15388b3))
- **ipc:** Adiciona infra reqwest/.env, helpers de integration_logs e comandos IPC de integrações ([894166e](https://github.com/ri-favaro/quicknote-crm/commit/894166e9a6213301b7b07e2d2603c07192caec02))
- **mvp:** Implementa persistência local SQLite, perfil CS e editor de notas/tarefas ([3c44d68](https://github.com/ri-favaro/quicknote-crm/commit/3c44d686549c9a8779a47479a7122b7630fabc98))
- **ui:** Corrige cantos transparentes do dock e adiciona slider de opacidade ([1bff596](https://github.com/ri-favaro/quicknote-crm/commit/1bff5968b7b4c7d3676a105fb2460e8d7c79b000))
- Redesenha dock para barra minimalista colada nas bordas ([b2fd35b](https://github.com/ri-favaro/quicknote-crm/commit/b2fd35b6c251de46c3e70ce9ebca3e20596be523))
- Cria scaffold Tauri v2 e dock funcional (v0.1) ([3f6afbd](https://github.com/ri-favaro/quicknote-crm/commit/3f6afbdfe8b6bb21c3d2080eb7278187982755fa))

### Correções

- **config:** Redaction em Debug, validação de host em URLs e atributos de formulário ([b5e0b53](https://github.com/ri-favaro/quicknote-crm/commit/b5e0b53b837f06ba0f2ac8f53b2e64a7ff4096a9))
- **ui:** Ajustar contraste no tema claro, layout compacto e redraw de geometria ([e706757](https://github.com/ri-favaro/quicknote-crm/commit/e706757d215731085dd6e913a8527802bb3bfde1))
- **pipedrive:** Evita panic UTF-8 em due_date e isola estado do PipedriveBar por nota ([b239175](https://github.com/ri-favaro/quicknote-crm/commit/b23917576839f22fd738fed3e1802dab96847f08))
- Evita roubo de foco em focusNoteBody quando um campo já está ativo ([9dba5b7](https://github.com/ri-favaro/quicknote-crm/commit/9dba5b771325a620e1d12b132c7cf1138a3a663d))
- **test,ci:** Aplica ajustes de segurança do CI, contrato mock e regressões da auditoria ([1fd2471](https://github.com/ri-favaro/quicknote-crm/commit/1fd2471276a0f6447b42f6413e15e8658032155e))
- Usa tooltip e atributos aria nos botões de borda do DockPanel ([d2b96e2](https://github.com/ri-favaro/quicknote-crm/commit/d2b96e2adf6829bded3206dc4d48544f7038d062))
- Corrige debounce de drag, listeners IPC, mock web e a11y do dock ([6cb4534](https://github.com/ri-favaro/quicknote-crm/commit/6cb45344c3f3e78bd73228b5c58e274313e3f479))

### Visual / UI

- **ui:** Aplica paleta escura azul-marinho e roxo com tokens Tailwind v4 ([9c8c519](https://github.com/ri-favaro/quicknote-crm/commit/9c8c519008fd3f6cddd4292d4de09efa86799cb3))

### Documentação

- Adiciona README principal do projeto ([a60451d](https://github.com/ri-favaro/quicknote-crm/commit/a60451dbc225a65a14b293468f41b863fc9ba0dc))
- Adiciona AGENTS.md e estrutura pasta docs/ ([4cfddc3](https://github.com/ri-favaro/quicknote-crm/commit/4cfddc397c487ef3fe056a33e325f863fe1bc52a))
- Atualiza blueprint com dock de CS, atalhos, segurança futura e Gemini ([4e6c57f](https://github.com/ri-favaro/quicknote-crm/commit/4e6c57f1051bd5e5124d781671f746b9aba1295f))

### Testes

- Desacopla asserções de CSS/DOM e padroniza mock IPC em App.test.tsx ([278412e](https://github.com/ri-favaro/quicknote-crm/commit/278412ebf8140c5a39407d7fdc6d46408d615dcc))
- **test,ci:** Estrutura suíte Vitest, testes Rust e pipeline GitHub Actions ([20b04ad](https://github.com/ri-favaro/quicknote-crm/commit/20b04ad6b2b0f675d3bad4098464bdbeddc40026))

### Build & CI

- **release:** Adicionar workflow de release multi-OS e guia de instalação ([#18](https://github.com/ri-favaro/quicknote-crm/issues/18)) ([e0ad678](https://github.com/ri-favaro/quicknote-crm/commit/e0ad67865f1c38f9a36562b2bf4c4fd6aa92f610))
- **build:** Preparar bundle, ícones e CI matrix multi-OS ([#17](https://github.com/ri-favaro/quicknote-crm/issues/17)) ([9342f50](https://github.com/ri-favaro/quicknote-crm/commit/9342f50bab337ac51ccd1d4af7ab8fc9067bddca))



