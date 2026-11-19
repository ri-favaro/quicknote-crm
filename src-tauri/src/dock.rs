use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub const MAIN_WINDOW_LABEL: &str = "main";
const EDGE_MARGIN_LOGICAL: f64 = 16.0;
const TASKBAR_RESERVE_LOGICAL: f64 = 52.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DockAnchor {
    TopLeft,
    TopCenter,
    TopRight,
    BottomLeft,
    BottomRight,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockShortcuts {
    pub toggle: String,
    pub new_note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockState {
    pub anchor: DockAnchor,
    pub always_on_top: bool,
    pub visible: bool,
    pub shortcuts: DockShortcuts,
}

impl Default for DockState {
    fn default() -> Self {
        Self {
            anchor: DockAnchor::TopRight,
            always_on_top: true,
            visible: true,
            shortcuts: DockShortcuts {
                toggle: "Alt+Space".to_string(),
                new_note: "Ctrl+Shift+N".to_string(),
            },
        }
    }
}

pub struct DockManager {
    state: Mutex<DockState>,
}

impl DockManager {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(DockState::default()),
        }
    }

    pub fn snapshot(&self) -> DockState {
        self.state.lock().expect("dock state poisoned").clone()
    }

    pub fn set_anchor(&self, anchor: DockAnchor) -> DockState {
        let mut guard = self.state.lock().expect("dock state poisoned");
        guard.anchor = anchor;
        guard.clone()
    }

    pub fn set_always_on_top(&self, enabled: bool) -> DockState {
        let mut guard = self.state.lock().expect("dock state poisoned");
        guard.always_on_top = enabled;
        guard.clone()
    }

    pub fn set_visible(&self, visible: bool) -> DockState {
        let mut guard = self.state.lock().expect("dock state poisoned");
        guard.visible = visible;
        guard.clone()
    }
}

pub fn compute_anchor_position(
    monitor_x: i32,
    monitor_y: i32,
    monitor_w: u32,
    monitor_h: u32,
    window_w: u32,
    window_h: u32,
    scale_factor: f64,
    anchor: DockAnchor,
) -> (i32, i32) {
    let margin = (EDGE_MARGIN_LOGICAL * scale_factor).round() as i32;
    let bottom_margin = (TASKBAR_RESERVE_LOGICAL * scale_factor).round() as i32;
    let mw = monitor_w as i32;
    let mh = monitor_h as i32;
    let ww = window_w as i32;
    let wh = window_h as i32;

    match anchor {
        DockAnchor::TopLeft => (monitor_x + margin, monitor_y + margin),
        DockAnchor::TopCenter => (monitor_x + (mw - ww) / 2, monitor_y + margin),
        DockAnchor::TopRight => (monitor_x + mw - ww - margin, monitor_y + margin),
        DockAnchor::BottomLeft => (monitor_x + margin, monitor_y + mh - wh - bottom_margin),
        DockAnchor::BottomRight => (
            monitor_x + mw - ww - margin,
            monitor_y + mh - wh - bottom_margin,
        ),
    }
}

pub fn snap_window(window: &WebviewWindow, anchor: DockAnchor) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "Nenhum monitor detectado".to_string())?;

    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();
    let scale = monitor.scale_factor();
    let win_size = window.outer_size().map_err(|e| e.to_string())?;

    let (x, y) = compute_anchor_position(
        monitor_pos.x,
        monitor_pos.y,
        monitor_size.width,
        monitor_size.height,
        win_size.width,
        win_size.height,
        scale,
        anchor,
    );

    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

pub fn emit_state(app: &AppHandle, state: &DockState) {
    let _ = app.emit("dock://state-changed", state);
}

pub fn show_and_focus(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let state = app.state::<DockManager>().set_visible(true);
        emit_state(app, &state);
    }
}

pub fn hide_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.hide();
        let state = app.state::<DockManager>().set_visible(false);
        emit_state(app, &state);
    }
}

pub fn toggle_visibility(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let visible = window.is_visible().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);
        if visible && focused {
            hide_window(app);
        } else {
            show_and_focus(app);
        }
    }
}

pub fn open_for_new_note(app: &AppHandle) {
    show_and_focus(app);
    let _ = app.emit("dock://new-note", ());
}

pub fn apply_anchor(app: &AppHandle, anchor: DockAnchor) -> Result<DockState, String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;
    snap_window(&window, anchor)?;
    let state = app.state::<DockManager>().set_anchor(anchor);
    emit_state(app, &state);
    Ok(state)
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let toggle_item = MenuItem::with_id(app, "toggle", "Mostrar / Ocultar (Alt+Space)", true, None::<&str>)?;
    let new_note_item = MenuItem::with_id(app, "new-note", "Nova nota (Ctrl+Shift+N)", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let snap_tr = MenuItem::with_id(app, "anchor:top-right", "Ancorar: Topo direito", true, None::<&str>)?;
    let snap_tc = MenuItem::with_id(app, "anchor:top-center", "Ancorar: Topo centro", true, None::<&str>)?;
    let snap_tl = MenuItem::with_id(app, "anchor:top-left", "Ancorar: Topo esquerdo", true, None::<&str>)?;
    let snap_br = MenuItem::with_id(app, "anchor:bottom-right", "Ancorar: Base direita", true, None::<&str>)?;
    let snap_bl = MenuItem::with_id(app, "anchor:bottom-left", "Ancorar: Base esquerda", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &toggle_item,
            &new_note_item,
            &sep1,
            &snap_tr,
            &snap_tc,
            &snap_tl,
            &snap_br,
            &snap_bl,
            &sep2,
            &quit_item,
        ],
    )?;

    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("QuickNote CRM — Dock CS")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => toggle_visibility(app),
            "new-note" => open_for_new_note(app),
            "anchor:top-right" => {
                let _ = apply_anchor(app, DockAnchor::TopRight);
                show_and_focus(app);
            }
            "anchor:top-center" => {
                let _ = apply_anchor(app, DockAnchor::TopCenter);
                show_and_focus(app);
            }
            "anchor:top-left" => {
                let _ = apply_anchor(app, DockAnchor::TopLeft);
                show_and_focus(app);
            }
            "anchor:bottom-right" => {
                let _ = apply_anchor(app, DockAnchor::BottomRight);
                show_and_focus(app);
            }
            "anchor:bottom-left" => {
                let _ = apply_anchor(app, DockAnchor::BottomLeft);
                show_and_focus(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_visibility(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

pub fn setup_global_shortcuts(app: &AppHandle) {
    let toggle_shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    let new_note_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN);

    let gs = app.global_shortcut();

    if let Err(err) = gs.on_shortcut(toggle_shortcut, |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            toggle_visibility(app);
        }
    }) {
        eprintln!("[dock] Falha ao registrar Alt+Space: {err}");
    }

    if let Err(err) = gs.on_shortcut(new_note_shortcut, |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            open_for_new_note(app);
        }
    }) {
        eprintln!("[dock] Falha ao registrar Ctrl+Shift+N: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_all_five_anchors_on_1080p() {
        assert_eq!(
            compute_anchor_position(0, 0, 1920, 1080, 360, 520, 1.0, DockAnchor::TopLeft),
            (16, 16)
        );
        assert_eq!(
            compute_anchor_position(0, 0, 1920, 1080, 360, 520, 1.0, DockAnchor::TopCenter),
            (780, 16)
        );
        assert_eq!(
            compute_anchor_position(0, 0, 1920, 1080, 360, 520, 1.0, DockAnchor::TopRight),
            (1544, 16)
        );
        assert_eq!(
            compute_anchor_position(0, 0, 1920, 1080, 360, 520, 1.0, DockAnchor::BottomLeft),
            (16, 508)
        );
        assert_eq!(
            compute_anchor_position(0, 0, 1920, 1080, 360, 520, 1.0, DockAnchor::BottomRight),
            (1544, 508)
        );
    }

    #[test]
    fn respects_secondary_monitor_offset_and_dpi_scale() {
        assert_eq!(
            compute_anchor_position(1920, 0, 2560, 1440, 540, 780, 1.5, DockAnchor::TopRight),
            (3916, 24)
        );
    }
}