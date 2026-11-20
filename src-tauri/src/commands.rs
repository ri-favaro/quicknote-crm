use tauri::{AppHandle, Manager, State};

use crate::db::{
    ActiveProfile, Database, DockAppearance, Note, SaveNoteDraftInput, SetActiveProfileInput, Todo,
    UpdateDockAppearanceInput, UpsertTodoInput,
};
use crate::dock::{
    apply_edge, apply_expanded, apply_panel_size, emit_state, hide_window, toggle_expanded,
    DockEdge, DockManager, DockState, MAIN_WINDOW_LABEL,
};
use crate::integrations::{
    n8n, pipedrive, supabase, DealSummary, DispatchResult, IntegrationClient, SyncResult,
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
pub fn get_dock_appearance(db: State<'_, Database>) -> Result<DockAppearance, String> {
    db.get_dock_appearance()
}

#[tauri::command]
pub fn set_dock_appearance(
    app: AppHandle,
    db: State<'_, Database>,
    appearance: UpdateDockAppearanceInput,
) -> Result<DockAppearance, String> {
    let saved = db.set_dock_appearance(appearance)?;
    apply_panel_size(&app, saved.panel_size)?;
    Ok(saved)
}

#[tauri::command]
pub fn reset_dock_appearance(
    app: AppHandle,
    db: State<'_, Database>,
) -> Result<DockAppearance, String> {
    let saved = db.reset_dock_appearance()?;
    apply_panel_size(&app, saved.panel_size)?;
    Ok(saved)
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

#[tauri::command]
pub async fn search_pipedrive_deals(
    integrations: State<'_, IntegrationClient>,
    query: String,
) -> Result<Vec<DealSummary>, String> {
    pipedrive::search_deals(&integrations, &query).await
}

#[tauri::command]
pub async fn send_to_pipedrive(
    db: State<'_, Database>,
    integrations: State<'_, IntegrationClient>,
    note_id: String,
    kind: String,
    deal_id: i64,
    todo_id: Option<String>,
) -> Result<DispatchResult, String> {
    pipedrive::send_note_or_activity(
        &db,
        &integrations,
        &note_id,
        &kind,
        deal_id,
        todo_id.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn trigger_n8n_webhook(
    db: State<'_, Database>,
    integrations: State<'_, IntegrationClient>,
    note_id: String,
    webhook_key: Option<String>,
) -> Result<DispatchResult, String> {
    n8n::trigger_webhook(&db, &integrations, &note_id, webhook_key.as_deref()).await
}

#[tauri::command]
pub async fn sync_supabase(
    db: State<'_, Database>,
    integrations: State<'_, IntegrationClient>,
) -> Result<SyncResult, String> {
    supabase::sync(&db, &integrations).await
}
