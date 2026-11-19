use tauri::{AppHandle, Manager, State};

use crate::dock::{
    apply_anchor, emit_state, hide_window, DockAnchor, DockManager, DockState, MAIN_WINDOW_LABEL,
};

#[tauri::command]
pub fn get_dock_state(manager: State<'_, DockManager>) -> DockState {
    manager.snapshot()
}

#[tauri::command]
pub fn snap_dock(app: AppHandle, anchor: DockAnchor) -> Result<DockState, String> {
    apply_anchor(&app, anchor)
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