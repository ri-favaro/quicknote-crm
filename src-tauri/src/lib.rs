mod commands;
mod dock;

use tauri::{Manager, WindowEvent};

use crate::dock::{DockEdge, DockManager, MAIN_WINDOW_LABEL};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(DockManager::new())
        .setup(|app| {
            let handle = app.handle();
            dock::setup_tray(handle)?;
            dock::setup_global_shortcuts(handle);

            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let manager = app.state::<DockManager>();
                let _ = dock::apply_window_geometry(&window, &manager, DockEdge::Right, false);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    dock::hide_window(window.app_handle());
                }
                WindowEvent::Moved(_) => {
                    dock::handle_window_moved(window.app_handle());
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_dock_state,
            commands::set_dock_edge,
            commands::set_dock_expanded,
            commands::toggle_dock_expanded,
            commands::set_always_on_top,
            commands::hide_dock,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao executar QuickNote CRM");
}