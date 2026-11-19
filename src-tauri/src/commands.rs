use tauri::{AppHandle, Manager, State};

use crate::dock::{
    apply_edge, apply_expanded, emit_state, hide_window, toggle_expanded, DockEdge, DockManager,
    DockState, MAIN_WINDOW_LABEL,
};

#[tauri::command]
pub fn get_dock_state(manager: State<'_, DockManager>) -> DockState {
    manager.snapshot()
}

#[tauri::command]
pub fn set_dock_edge(app: AppHandle, edge: DockEdge) -> Result<DockState, String> {
    apply_edge(&app, edge)
}

#[tauri::command]
pub fn set_dock_expanded(app: AppHandle, expanded: bool) -> Result<DockState, String> {
    apply_expanded(&app, expanded)
}

#[tauri::command]
pub fn toggle_dock_expanded(app: AppHandle) -> Result<DockState, String> {
    toggle_expanded(&app)
}

#[tauri::command]
pub fn set_always_on_top(app: AppHandle, enabled: bool) -> Result<DockState, String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;
    window
        .set_always_on_top(enabled)
        .map_err(|e| e.to_string())?;
    let state = app.state::<DockManager>().set_always_on_top(enabled);
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn hide_dock(app: AppHandle) {
    hide_window(&app);
}