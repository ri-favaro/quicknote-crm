use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub const MAIN_WINDOW_LABEL: &str = "main";

const COLLAPSED_THICKNESS_LOGICAL: f64 = 56.0;
const COLLAPSED_LENGTH_LOGICAL: f64 = 236.0;
const EXPANDED_SIDE_WIDTH_LOGICAL: f64 = 404.0;
const EXPANDED_SIDE_HEIGHT_LOGICAL: f64 = 540.0;
const EXPANDED_TOP_WIDTH_LOGICAL: f64 = 420.0;
const EXPANDED_TOP_HEIGHT_LOGICAL: f64 = 500.0;
const TASKBAR_RESERVE_LOGICAL: f64 = 48.0;
const DRAG_SNAP_DEBOUNCE_MS: u64 = 240;
const PROGRAMMATIC_MOVE_GUARD_MS: u64 = 220;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DockEdge {
    Right,
    Left,
    Top,
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
    pub edge: DockEdge,
    pub expanded: bool,
    pub always_on_top: bool,
    pub visible: bool,
    pub shortcuts: DockShortcuts,
}

impl Default for DockState {
    fn default() -> Self {
        Self {
            edge: DockEdge::Right,
            expanded: false,
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
    snap_scheduled: AtomicBool,
    last_move_at: Mutex<Instant>,
    ignore_moves_until: Mutex<Instant>,
}

impl DockManager {
    pub fn new() -> Self {
        let now = Instant::now();
        Self {
            state: Mutex::new(DockState::default()),
            snap_scheduled: AtomicBool::new(false),
            last_move_at: Mutex::new(now),
            ignore_moves_until: Mutex::new(now),
        }
    }

    pub fn snapshot(&self) -> DockState {
        self.state.lock().expect("dock state poisoned").clone()
    }

    pub fn set_edge(&self, edge: DockEdge) -> DockState {
        let mut guard = self.state.lock().expect("dock state poisoned");
        guard.edge = edge;
        guard.clone()
    }

    pub fn set_expanded(&self, expanded: bool) -> DockState {
        let mut guard = self.state.lock().expect("dock state poisoned");
        guard.expanded = expanded;
        if expanded {
            guard.visible = true;
        }
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

    fn suppress_move_events(&self) {
        let mut guard = self
            .ignore_moves_until
            .lock()
            .expect("ignore_moves_until poisoned");
        *guard = Instant::now() + Duration::from_millis(PROGRAMMATIC_MOVE_GUARD_MS);
    }

    fn is_ignoring_moves(&self) -> bool {
        let guard = self
            .ignore_moves_until
            .lock()
            .expect("ignore_moves_until poisoned");
        Instant::now() < *guard
    }

    fn record_user_move(&self) -> bool {
        {
            let mut guard = self.last_move_at.lock().expect("last_move_at poisoned");
            *guard = Instant::now();
        }
        self.snap_scheduled
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    fn remaining_debounce(&self) -> Option<Duration> {
        let last = *self.last_move_at.lock().expect("last_move_at poisoned");
        let target = last + Duration::from_millis(DRAG_SNAP_DEBOUNCE_MS);
        target.checked_duration_since(Instant::now())
    }

    fn clear_snap_scheduled(&self) {
        self.snap_scheduled.store(false, Ordering::SeqCst);
    }
}

pub fn compute_dock_size(edge: DockEdge, expanded: bool) -> (f64, f64) {
    match (edge, expanded) {
        (DockEdge::Right | DockEdge::Left, false) => {
            (COLLAPSED_THICKNESS_LOGICAL, COLLAPSED_LENGTH_LOGICAL)
        }
        (DockEdge::Top, false) => (COLLAPSED_LENGTH_LOGICAL, COLLAPSED_THICKNESS_LOGICAL),
        (DockEdge::Right | DockEdge::Left, true) => {
            (EXPANDED_SIDE_WIDTH_LOGICAL, EXPANDED_SIDE_HEIGHT_LOGICAL)
        }
        (DockEdge::Top, true) => (EXPANDED_TOP_WIDTH_LOGICAL, EXPANDED_TOP_HEIGHT_LOGICAL),
    }
}

pub fn compute_dock_rect(
    monitor_x: i32,
    monitor_y: i32,
    monitor_w: u32,
    monitor_h: u32,
    scale_factor: f64,
    edge: DockEdge,
    expanded: bool,
) -> (i32, i32, u32, u32) {
    let (logical_w, logical_h) = compute_dock_size(edge, expanded);
    let phys_w = (logical_w * scale_factor).round().max(1.0) as u32;
    let phys_h = (logical_h * scale_factor).round().max(1.0) as u32;
    let taskbar_reserve = (TASKBAR_RESERVE_LOGICAL * scale_factor).round() as i32;

    let mw = monitor_w as i32;
    let mh = monitor_h as i32;
    let ww = phys_w as i32;
    let wh = phys_h as i32;
    let usable_h = (mh - taskbar_reserve).max(wh);

    let (x, y) = match edge {
        DockEdge::Right => (monitor_x + mw - ww, monitor_y + (usable_h - wh) / 2),
        DockEdge::Left => (monitor_x, monitor_y + (usable_h - wh) / 2),
        DockEdge::Top => (monitor_x + (mw - ww) / 2, monitor_y),
    };

    (x, y, phys_w, phys_h)
}

pub fn compute_nearest_edge(
    monitor_x: i32,
    monitor_y: i32,
    monitor_w: u32,
    monitor_h: u32,
    win_x: i32,
    win_y: i32,
    win_w: u32,
    win_h: u32,
) -> DockEdge {
    let cx = win_x + (win_w as i32) / 2;
    let cy = win_y + (win_h as i32) / 2;

    let dist_left = (cx - monitor_x).max(0);
    let dist_right = (monitor_x + monitor_w as i32 - cx).max(0);
    let dist_top = (cy - monitor_y).max(0);
    let _ = monitor_h;

    if dist_top < dist_left && dist_top < dist_right {
        DockEdge::Top
    } else if dist_left < dist_right {
        DockEdge::Left
    } else {
        DockEdge::Right
    }
}

pub fn apply_window_geometry(
    window: &WebviewWindow,
    manager: &DockManager,
    edge: DockEdge,
    expanded: bool,
) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "Nenhum monitor detectado".to_string())?;

    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();
    let scale = monitor.scale_factor();

    let (x, y, phys_w, phys_h) = compute_dock_rect(
        monitor_pos.x,
        monitor_pos.y,
        monitor_size.width,
        monitor_size.height,
        scale,
        edge,
        expanded,
    );

    manager.suppress_move_events();
    window
        .set_size(PhysicalSize::new(phys_w, phys_h))
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    manager.suppress_move_events();

    Ok(())
}

pub fn emit_state(app: &AppHandle, state: &DockState) {
    let _ = app.emit("dock://state-changed", state);
}

pub fn show_window(app: &AppHandle, focus: bool) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        if focus {
            let _ = window.set_focus();
        }
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

pub fn apply_edge(app: &AppHandle, edge: DockEdge) -> Result<DockState, String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;
    let manager = app.state::<DockManager>();
    let state = manager.set_edge(edge);
    apply_window_geometry(&window, &manager, state.edge, state.expanded)?;
    emit_state(app, &state);
    Ok(state)
}

pub fn apply_expanded(app: &AppHandle, expanded: bool) -> Result<DockState, String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;
    let manager = app.state::<DockManager>();
    let state = manager.set_expanded(expanded);
    apply_window_geometry(&window, &manager, state.edge, state.expanded)?;
    if expanded {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    emit_state(app, &state);
    Ok(state)
}

pub fn toggle_expanded(app: &AppHandle) -> Result<DockState, String> {
    let current = app.state::<DockManager>().snapshot();
    if !current.visible {
        show_window(app, true);
        return apply_expanded(app, true);
    }
    apply_expanded(app, !current.expanded)
}

pub fn toggle_visibility(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let is_visible = window.is_visible().unwrap_or(false);
        if is_visible {
            hide_window(app);
        } else {
            show_window(app, true);
        }
    }
}

pub fn open_for_new_note(app: &AppHandle) {
    show_window(app, true);
    let _ = apply_expanded(app, true);
    let _ = app.emit("dock://new-note", ());
}

pub fn handle_window_moved(app: &AppHandle) {
    let manager = app.state::<DockManager>();
    if manager.is_ignoring_moves() {
        return;
    }

    if !manager.record_user_move() {
        return;
    }

    let app_handle = app.clone();
    std::thread::spawn(move || {
        loop {
            let remaining = {
                let manager = app_handle.state::<DockManager>();
                manager.remaining_debounce()
            };
            match remaining {
                Some(wait) => std::thread::sleep(wait),
                None => break,
            }
        }

        let should_snap = {
            let manager = app_handle.state::<DockManager>();
            manager.clear_snap_scheduled();
            !manager.is_ignoring_moves()
        };
        if !should_snap {
            return;
        }

        let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) else {
            return;
        };
        let Some(monitor) = window
            .current_monitor()
            .ok()
            .flatten()
            .or_else(|| window.primary_monitor().ok().flatten())
        else {
            return;
        };
        let (Ok(win_pos), Ok(win_size)) = (window.outer_position(), window.outer_size()) else {
            return;
        };

        let monitor_pos = monitor.position();
        let monitor_size = monitor.size();
        let nearest = compute_nearest_edge(
            monitor_pos.x,
            monitor_pos.y,
            monitor_size.width,
            monitor_size.height,
            win_pos.x,
            win_pos.y,
            win_size.width,
            win_size.height,
        );

        let _ = apply_edge(&app_handle, nearest);
    });
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let toggle_expand =
        MenuItem::with_id(app, "toggle-expand", "Expandir / Recolher (Alt+Space)", true, None::<&str>)?;
    let new_note_item =
        MenuItem::with_id(app, "new-note", "Nova nota (Ctrl+Shift+N)", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let edge_right =
        MenuItem::with_id(app, "edge:right", "Posição: Direita", true, None::<&str>)?;
    let edge_left =
        MenuItem::with_id(app, "edge:left", "Posição: Esquerda", true, None::<&str>)?;
    let edge_top = MenuItem::with_id(app, "edge:top", "Posição: Topo", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let toggle_vis =
        MenuItem::with_id(app, "toggle-visible", "Mostrar / Ocultar da tela", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &toggle_expand,
            &new_note_item,
            &sep1,
            &edge_right,
            &edge_left,
            &edge_top,
            &sep2,
            &toggle_vis,
            &quit_item,
        ],
    )?;

    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("QuickNote CRM — Dock CS")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle-expand" => {
                let _ = toggle_expanded(app);
            }
            "new-note" => open_for_new_note(app),
            "edge:right" => {
                show_window(app, false);
                let _ = apply_edge(app, DockEdge::Right);
            }
            "edge:left" => {
                show_window(app, false);
                let _ = apply_edge(app, DockEdge::Left);
            }
            "edge:top" => {
                show_window(app, false);
                let _ = apply_edge(app, DockEdge::Top);
            }
            "toggle-visible" => toggle_visibility(app),
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
                let _ = toggle_expanded(tray.app_handle());
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
            let _ = toggle_expanded(app);
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
    fn computes_collapsed_and_expanded_rects_for_all_edges() {
        assert_eq!(
            compute_dock_rect(0, 0, 1920, 1080, 1.0, DockEdge::Right, false),
            (1864, 398, 56, 236)
        );
        assert_eq!(
            compute_dock_rect(0, 0, 1920, 1080, 1.0, DockEdge::Left, false),
            (0, 398, 56, 236)
        );
        assert_eq!(
            compute_dock_rect(0, 0, 1920, 1080, 1.0, DockEdge::Top, false),
            (842, 0, 236, 56)
        );
        assert_eq!(
            compute_dock_rect(0, 0, 1920, 1080, 1.0, DockEdge::Right, true),
            (1516, 246, 404, 540)
        );
        assert_eq!(
            compute_dock_rect(0, 0, 1920, 1080, 1.0, DockEdge::Top, true),
            (750, 0, 420, 500)
        );
    }

    #[test]
    fn respects_secondary_monitor_and_dpi_scale() {
        assert_eq!(
            compute_dock_rect(1920, 0, 2560, 1440, 1.5, DockEdge::Right, false),
            (4396, 507, 84, 354)
        );
    }

    #[test]
    fn detects_nearest_edge_on_drag_release() {
        assert_eq!(
            compute_nearest_edge(0, 0, 1920, 1080, 40, 420, 56, 236),
            DockEdge::Left
        );
        assert_eq!(
            compute_nearest_edge(0, 0, 1920, 1080, 1790, 420, 56, 236),
            DockEdge::Right
        );
        assert_eq!(
            compute_nearest_edge(0, 0, 1920, 1080, 880, 18, 236, 56),
            DockEdge::Top
        );
    }

    #[test]
    fn dock_state_default_and_serde_contract() {
        let state = DockState::default();
        assert_eq!(state.edge, DockEdge::Right);
        assert!(!state.expanded);
        assert!(state.always_on_top);
        assert!(state.visible);
        assert_eq!(state.shortcuts.toggle, "Alt+Space");
        assert_eq!(state.shortcuts.new_note, "Ctrl+Shift+N");

        let json = serde_json::to_value(&state).expect("serialize DockState");
        assert_eq!(json["edge"], "right");
        assert_eq!(json["expanded"], false);
        assert_eq!(json["alwaysOnTop"], true);
        assert_eq!(json["visible"], true);
        assert_eq!(json["shortcuts"]["toggle"], "Alt+Space");
        assert_eq!(json["shortcuts"]["newNote"], "Ctrl+Shift+N");

        for (raw, expected) in [
            ("\"right\"", DockEdge::Right),
            ("\"left\"", DockEdge::Left),
            ("\"top\"", DockEdge::Top),
        ] {
            let parsed: DockEdge = serde_json::from_str(raw).expect("deserialize DockEdge");
            assert_eq!(parsed, expected);
        }
    }

    #[test]
    fn dock_manager_state_transitions() {
        let manager = DockManager::new();
        assert_eq!(manager.snapshot().edge, DockEdge::Right);

        let after_edge = manager.set_edge(DockEdge::Top);
        assert_eq!(after_edge.edge, DockEdge::Top);
        assert!(!after_edge.expanded);

        let after_hide = manager.set_visible(false);
        assert!(!after_hide.visible);

        let after_expand = manager.set_expanded(true);
        assert!(after_expand.expanded);
        assert!(after_expand.visible);

        let after_collapse = manager.set_expanded(false);
        assert!(!after_collapse.expanded);
        assert!(after_collapse.visible);

        let after_unpin = manager.set_always_on_top(false);
        assert!(!after_unpin.always_on_top);
        assert_eq!(manager.snapshot().edge, DockEdge::Top);
    }

    #[test]
    fn dock_manager_drag_debounce_and_move_suppression() {
        let manager = DockManager::new();

        assert!(manager.record_user_move());
        assert!(!manager.record_user_move());
        assert!(manager.remaining_debounce().is_some());

        manager.clear_snap_scheduled();
        assert!(manager.record_user_move());

        manager.suppress_move_events();
        assert!(manager.is_ignoring_moves());
    }

    #[test]
    fn compute_dock_rect_clamps_height_on_small_monitor() {
        let (x, y, w, h) = compute_dock_rect(0, 100, 1024, 480, 1.0, DockEdge::Right, true);
        assert_eq!((w, h), (404, 540));
        assert_eq!(x, 620);
        assert_eq!(y, 100);
    }

    #[test]
    fn compute_nearest_edge_handles_secondary_monitor() {
        assert_eq!(
            compute_nearest_edge(1920, 100, 2560, 1440, 1940, 700, 56, 236),
            DockEdge::Left
        );
        assert_eq!(
            compute_nearest_edge(1920, 100, 2560, 1440, 4400, 700, 56, 236),
            DockEdge::Right
        );
        assert_eq!(
            compute_nearest_edge(1920, 100, 2560, 1440, 3100, 110, 236, 56),
            DockEdge::Top
        );
    }
}