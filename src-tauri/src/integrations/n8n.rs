use crate::db::Database;
use crate::integrations::{DispatchResult, IntegrationClient};

pub async fn trigger_webhook(
    db: &Database,
    client: &IntegrationClient,
    note_id: &str,
    webhook_key: Option<&str>,
) -> Result<DispatchResult, String> {
    let trimmed_note_id = note_id.trim();
    if trimmed_note_id.is_empty() {
        return Err("ID da nota é obrigatório para disparar o webhook n8n.".to_string());
    }

    if db.get_note(trimmed_note_id)?.is_none() {
        return Err("Nota não encontrada no banco local.".to_string());
    }

    let _ = client.config().n8n_endpoint()?;
    let _ = client.http();
    let key_suffix = webhook_key
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(|key| format!(" (chave '{key}')"))
        .unwrap_or_default();

    Err(format!(
        "Disparo de webhook n8n{key_suffix} ainda não implementado (ver issue #11)."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::SaveNoteDraftInput;
    use crate::integrations::IntegrationConfig;

    #[test]
    fn validates_note_and_env_before_stub_error() {
        let db = Database::open_in_memory().unwrap();
        let unconfigured = IntegrationClient::with_config(IntegrationConfig::default()).unwrap();

        let missing_note =
            tauri::async_runtime::block_on(trigger_webhook(&db, &unconfigured, "inexistente", None));
        assert!(missing_note.unwrap_err().contains("Nota não encontrada"));

        let note = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("n-n8n".to_string()),
                title: "Sync".to_string(),
                content_md: "Corpo".to_string(),
                pipedrive_deal_id: None,
                pipedrive_person_id: None,
            })
            .unwrap();

        let missing_env =
            tauri::async_runtime::block_on(trigger_webhook(&db, &unconfigured, &note.id, None));
        assert!(missing_env.unwrap_err().contains("N8N_WEBHOOK_URL"));

        let configured = IntegrationClient::with_config(IntegrationConfig {
            n8n_webhook_url: Some("https://n8n.example.com/webhook".to_string()),
            ..Default::default()
        })
        .unwrap();

        let stub = tauri::async_runtime::block_on(trigger_webhook(
            &db,
            &configured,
            &note.id,
            Some("pos-reuniao"),
        ));
        let err = stub.unwrap_err();
        assert!(err.contains("pos-reuniao"));
        assert!(err.contains("issue #11"));
    }
}
