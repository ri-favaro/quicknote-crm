# Checklist Multi-OS — QuickNote CRM

Referência operacional de build, empacotamento e comportamento de janela/dock/tray/atalhos em **Windows**, **macOS** e **Linux**.

## 1. Matriz de CI (`.github/workflows/ci.yml`)

| Runner | Validações automáticas | Dependências extras |
| :--- | :--- | :--- |
| `windows-latest` | `pnpm build`, `cargo check`, `cargo test` | Nenhuma (WebView2 / MSVC no runner) |
| `macos-latest` | `pnpm build`, `cargo check`, `cargo test` | Nenhuma (WKWebView / Xcode no runner) |
| `ubuntu-22.04` | `pnpm build`, `cargo check`, `cargo test` | `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libxdo-dev`, `libssl-dev`, `patchelf` |

## 2. Configuração de Bundle e Janela (`src-tauri/tauri.conf.json`)

- **Ícones de bundle:** `icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png`, `icons/icon.icns` (macOS) e `icons/icon.ico` (Windows), gerados a partir de `src-tauri/icons/icon.png` e validados por teste unitário em `src-tauri/src/dock.rs`.
- **`transparent: true`, `decorations: false`, `shadow: false`:** ativos nos 3 sistemas. No Tauri `2.12.1+`, as APIs necessárias para transparência no macOS já vêm habilitadas sem exigir `macOSPrivateApi` ou a feature `macos-private-api`.
- **`noRedirectionBitmap: true`:** opção exclusiva do Windows (`WS_EX_NOREDIRECTIONBITMAP`) para eliminar o flash branco inicial em janela transparente; ignorada sem erro pelo parser/runtime no macOS e Linux.
- **`alwaysOnTop: true`, `skipTaskbar: true`, `visible: false`:** compatíveis nos 3 sistemas, sujeitos às particularidades de compositor listadas abaixo.

## 3. Comportamento e Limitações Conhecidas por OS

| Recurso | Windows 10/11 | macOS | Linux (X11) | Linux (Wayland) |
| :--- | :--- | :--- | :--- | :--- |
| Dock nas bordas (`right`/`left`/`top`) e drag-snap | Suportado | Suportado | Suportado | **Limitado:** Wayland bloqueia `set_position`/`outer_position` por clientes; a posição pode ser ignorada pelo compositor. |
| Janela transparente sem moldura | Suportado (`noRedirectionBitmap`) | Suportado (Tauri 2.12.1+) | Suportado com compositor ativo (sem compositor, fundo fica opaco) | Suportado |
| `alwaysOnTop` e `skipTaskbar` | Suportado | Suportado (comportamento sobre Spaces varia conforme política da janela) | Suportado | **Limitado:** depende do suporte do compositor Wayland. |
| Bandeja (`tray-icon`) | Suportado (Notification Area) | Suportado (Menu Bar) | Suportado (`libayatana-appindicator3`; GNOME exige extensão AppIndicator) | Suportado (`libayatana-appindicator3`; GNOME exige extensão AppIndicator) |
| Atalhos globais (`Alt+Space`, `Ctrl+Shift+N`) | Suportado | Requer permissão de **Acessibilidade** (Ajustes do Sistema → Privacidade e Segurança → Acessibilidade); `Alt+Space` pode conflitar conforme layout/Spotlight | Suportado | **Limitado:** captura global via `tauri-plugin-global-shortcut` não funciona na maioria dos compositores Wayland puros (usar sessão X11/XWayland como workaround). |

## 4. Checklist de Smoke Test Manual por Plataforma

> Nota: o CI valida compilação, ícones e testes unitários nos 3 sistemas; os itens abaixo exigem execução interativa em desktop nativo.

### Windows 10/11
- [x] Dock inicia recolhido na borda direita sem flash branco (`transparent` + `noRedirectionBitmap`).
- [x] Alternância entre bordas (`right`/`left`/`top`) e drag-snap funcionam.
- [x] `alwaysOnTop` e `skipTaskbar` respeitados.
- [x] Ícone na bandeja (tray) alterna o painel e expõe o menu.
- [x] Atalhos globais `Alt+Space` e `Ctrl+Shift+N` respondem com a janela sem foco.

### macOS (pendente de smoke test em máquina nativa)
- [ ] App abre sem erro de inicialização com `icon.icns` no bundle.
- [ ] Janela transparente sem borda renderiza sem fundo sólido.
- [ ] Dock encaixa em `right`/`left`/`top` respeitando a Menu Bar.
- [ ] Ícone na Menu Bar (tray) abre/fecha o painel.
- [ ] Após conceder permissão de Acessibilidade, `Alt+Space` e `Ctrl+Shift+N` disparam globalmente.

### Linux — X11 e Wayland (pendente de smoke test em máquina nativa)
- [ ] App abre com ícones PNG (`32x32`, `128x128`, `128x128@2x`) e janela transparente.
- [ ] Em X11: dock encaixa nas bordas, `alwaysOnTop` funciona e atalhos globais respondem.
- [ ] Tray aparece (com AppIndicator ativo no GNOME/KDE).
- [ ] Em Wayland: registrar degradação esperada (posição manual e atalho global) sem crash na inicialização.
