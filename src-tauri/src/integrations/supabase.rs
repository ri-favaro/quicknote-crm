use crate::db::Database;
use crate::integrations::{IntegrationClient, SyncResult};

pub async fn sync(db: &Database, client: &IntegrationClient) -> Result<SyncResult, String> {
    let _ = client.config().supabase_credentials()?;
    let _ = client.http();

    let pending_notes = db.list_pending_sync_notes()?.len();
    let pending_logs = db.list_pending_integration_logs()?.len();

    Err(format!(
        "Sync com Supabase ainda não implementado (ver issue #12; pendentes: {pending_notes} nota(s), {pending_logs} log(s))."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::SaveNoteDraftInput;
    use crate::integrations::IntegrationConfig;

    #[test]
    fn validates_env_and_counts_pending_records_before_stub_error() {
        let db = Database::open_in_memory().unwrap();
        let unconfigured = IntegrationClient::with_config(IntegrationConfig::default()).unwrap();

        let missing_env = tauri::async_runtime::block_on(sync(&db, &unconfigured));
        assert!(missing_env.unwrap_err().contains("SUPABASE_URL"));

        let _ = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("n-supa".to_string()),
                title: "Backup".to_string(),
                content_md: "Dados".to_string(),
                pipedrive_deal_id: None,
                pipedrive_person_id: None,
            })
            .unwrap();

        let configured = IntegrationClient::with_config(IntegrationConfig {
            supabase_url: Some("https://proj.supabase.co".to_string()),
            supabase_anon_key: Some("anon-key".to_string()),
            ..Default::default()
        })
        .unwrap();

        let stub = tauri::async_runtime::block_on(sync(&db, &configured));
        let err = stub.unwrap_err();
        assert!(err.contains("1 nota(s)"));
        assert!(err.contains("issue #12"));
    }
}
