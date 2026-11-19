use tauri::{AppHandle, Manager, State};

use crate::db::{
    ActiveProfile, Database, Note, SaveNoteDraftInput, SetActiveProfileInput, Todo,
    UpsertTodoInput,
};
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

#[tauri::command]
pub fn save_note_draft(db: State<'_, Database>, note: SaveNoteDraftInput) -> Result<Note, String> {
    db.save_note_draft(note)
}

#[tauri::command]
pub fn list_notes(db: State<'_, Database>) -> Result<Vec<Note>, String> {
    db.list_notes()
}

#[tauri::command]
pub fn get_note(db: State<'_, Database>, id: String) -> Result<Option<Note>, String> {
    db.get_note(&id)
}

#[tauri::command]
pub fn delete_note(db: State<'_, Database>, id: String) -> Result<bool, String> {
    db.delete_note(&id)
}

#[tauri::command]
pub fn list_todos(db: State<'_, Database>, note_id: Option<String>) -> Result<Vec<Todo>, String> {
    db.list_todos(note_id.as_deref())
}

#[tauri::command]
pub fn upsert_todo(db: State<'_, Database>, todo: UpsertTodoInput) -> Result<Todo, String> {
    db.upsert_todo(todo)
}

#[tauri::command]
pub fn toggle_todo(db: State<'_, Database>, id: String) -> Result<Todo, String> {
    db.toggle_todo(&id)
}

#[tauri::command]
pub fn delete_todo(db: State<'_, Database>, id: String) -> Result<bool, String> {
    db.delete_todo(&id)
}

#[tauri::command]
pub fn set_active_profile(
    db: State<'_, Database>,
    profile: SetActiveProfileInput,
) -> Result<ActiveProfile, String> {
    db.set_active_profile(profile)
}

#[tauri::command]
pub fn get_active_profile(db: State<'_, Database>) -> Result<ActiveProfile, String> {
    db.get_active_profile()
}
