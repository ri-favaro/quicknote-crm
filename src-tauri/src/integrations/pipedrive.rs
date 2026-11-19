use crate::db::Database;
use crate::integrations::{DealSummary, DispatchResult, IntegrationClient, PipedriveSendKind};

pub async fn search_deals(
    client: &IntegrationClient,
    query: &str,
) -> Result<Vec<DealSummary>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Informe um termo de busca para consultar negócios no Pipedrive.".to_string());
    }

    let _ = client.config().pipedrive_credentials()?;
    let _ = client.http();

    Err(format!(
        "Busca de deals no Pipedrive para '{trimmed}' ainda não implementada (ver issue #10)."
    ))
}

pub async fn send_note_or_activity(
    db: &Database,
    client: &IntegrationClient,
    note_id: &str,
    kind: &str,
    deal_id: i64,
) -> Result<DispatchResult, String> {
    let trimmed_note_id = note_id.trim();
    if trimmed_note_id.is_empty() {
        return Err("ID da nota é obrigatório para envio ao Pipedrive.".to_string());
    }
    let parsed_kind = PipedriveSendKind::parse(kind)?;
    if deal_id <= 0 {
        return Err("ID do negócio (dealId) deve ser maior que zero.".to_string());
    }

    if db.get_note(trimmed_note_id)?.is_none() {
        return Err("Nota não encontrada no banco local.".to_string());
    }

    let _ = client.config().pipedrive_credentials()?;
    let _ = client.http();

    Err(format!(
        "Envio de '{}' para o deal #{deal_id} no Pipedrive ainda não implementado (ver issue #10).",
        parsed_kind.as_str()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::SaveNoteDraftInput;
    use crate::integrations::IntegrationConfig;

    #[test]
    fn validates_inputs_and_env_before_stub_error() {
        let db = Database::open_in_memory().unwrap();
        let unconfigured = IntegrationClient::with_config(IntegrationConfig::default()).unwrap();

        let empty_query = tauri::async_runtime::block_on(search_deals(&unconfigured, "   "));
        assert!(empty_query.unwrap_err().contains("termo de busca"));

        let missing_env = tauri::async_runtime::block_on(search_deals(&unconfigured, "Acme"));
        assert!(missing_env.unwrap_err().contains("PIPEDRIVE_API_BASE"));

        let note = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("n-pipe".to_string()),
                title: "Call".to_string(),
                content_md: "Resumo".to_string(),
                pipedrive_deal_id: Some(123),
                pipedrive_person_id: None,
            })
            .unwrap();

        let bad_kind = tauri::async_runtime::block_on(send_note_or_activity(
            &db,
            &unconfigured,
            &note.id,
            "invalid",
            123,
        ));
        assert!(bad_kind.unwrap_err().contains("Tipo de envio Pipedrive inválido"));

        let configured = IntegrationClient::with_config(IntegrationConfig {
            pipedrive_api_base: Some("https://api.pipedrive.com/v1".to_string()),
            pipedrive_api_token: Some("tok".to_string()),
            ..Default::default()
        })
        .unwrap();

        let stub = tauri::async_runtime::block_on(send_note_or_activity(
            &db,
            &configured,
            &note.id,
            "note",
            123,
        ));
        assert!(stub.unwrap_err().contains("issue #10"));
    }
}
