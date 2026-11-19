use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db::{
    CreateIntegrationLogInput, Database, IntegrationLogStatus, IntegrationTarget, Note, Todo,
};
use crate::integrations::{DealSummary, DispatchResult, DispatchStatus, IntegrationClient, PipedriveSendKind};

const DEALS_SEARCH_LIMIT: &str = "10";
const DEFAULT_ACTIVITY_TYPE: &str = "task";
const MAX_ERROR_BODY_CHARS: usize = 240;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct CreateNotePayload {
    content: String,
    deal_id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    person_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct CreateActivityPayload {
    subject: String,
    #[serde(rename = "type")]
    activity_type: &'static str,
    deal_id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    person_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    due_date: Option<String>,
    done: u8,
}

#[derive(Debug, Deserialize)]
struct PipedriveEnvelope<T> {
    #[serde(default)]
    success: Option<bool>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    error_info: Option<String>,
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
struct DealSearchData {
    #[serde(default)]
    items: Vec<DealSearchEntry>,
}

#[derive(Debug, Deserialize)]
struct DealSearchEntry {
    item: DealSearchItem,
}

#[derive(Debug, Deserialize)]
struct DealSearchItem {
    id: i64,
    title: String,
    #[serde(default)]
    organization: Option<DealSearchOrg>,
}

#[derive(Debug, Deserialize)]
struct DealSearchOrg {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CreatedEntityData {
    id: i64,
}

pub async fn search_deals(
    client: &IntegrationClient,
    query: &str,
) -> Result<Vec<DealSummary>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Informe um termo de busca para consultar negócios no Pipedrive.".to_string());
    }

    let (base, token) = client.config().pipedrive_credentials()?;
    let url = format!("{}/deals/search", base.trim_end_matches('/'));

    let response = client
        .http()
        .get(&url)
        .header("x-api-token", token)
        .query(&[("term", trimmed), ("limit", DEALS_SEARCH_LIMIT)])
        .send()
        .await
        .map_err(|err| {
            format!(
                "Falha de rede ao buscar negócios no Pipedrive: {}",
                sanitize_secret(&err.to_string(), token)
            )
        })?;

    let status = response.status();
    let body = response.text().await.map_err(|err| {
        format!(
            "Falha ao ler resposta do Pipedrive: {}",
            sanitize_secret(&err.to_string(), token)
        )
    })?;

    if !status.is_success() {
        return Err(format_http_error(status.as_u16(), &body, token));
    }

    parse_deal_search_response(&body, token)
}

pub async fn send_note_or_activity(
    db: &Database,
    client: &IntegrationClient,
    note_id: &str,
    kind: &str,
    deal_id: i64,
    todo_id: Option<&str>,
) -> Result<DispatchResult, String> {
    let trimmed_note_id = note_id.trim();
    if trimmed_note_id.is_empty() {
        return Err("ID da nota é obrigatório para envio ao Pipedrive.".to_string());
    }
    let parsed_kind = PipedriveSendKind::parse(kind)?;
    if deal_id <= 0 {
        return Err("ID do negócio (dealId) deve ser maior que zero.".to_string());
    }

    let note = db
        .get_note(trimmed_note_id)?
        .ok_or_else(|| "Nota não encontrada no banco local.".to_string())?;

    let (base, token) = client.config().pipedrive_credentials()?;

    match parsed_kind {
        PipedriveSendKind::Note => dispatch_note(db, client, base, token, &note, deal_id).await,
        PipedriveSendKind::Activity => {
            dispatch_activities(db, client, base, token, &note, deal_id, todo_id).await
        }
    }
}

async fn dispatch_note(
    db: &Database,
    client: &IntegrationClient,
    base: &str,
    token: &str,
    note: &Note,
    deal_id: i64,
) -> Result<DispatchResult, String> {
    let payload = build_note_payload(note, deal_id)?;
    let payload_json = serde_json::to_string(&payload)
        .map_err(|e| format!("Falha ao serializar payload de nota do Pipedrive: {e}"))?;

    let log = db.create_integration_log(CreateIntegrationLogInput {
        id: None,
        note_id: note.id.clone(),
        author_id: Some(note.author_id.clone()),
        target: IntegrationTarget::Pipedrive,
        status: IntegrationLogStatus::Pending,
        payload_json,
        response_status: None,
        error_message: None,
    })?;

    let url = format!("{}/notes", base.trim_end_matches('/'));
    let request_result = client
        .http()
        .post(&url)
        .header("x-api-token", token)
        .json(&payload)
        .send()
        .await;

    match request_result {
        Ok(response) => {
            let status_code = response.status().as_u16();
            let is_success = response.status().is_success();
            let body = match response.text().await {
                Ok(text) => text,
                Err(err) => {
                    let message = format!(
                        "Falha ao ler resposta do Pipedrive ao enviar nota: {}",
                        sanitize_secret(&err.to_string(), token)
                    );
                    db.update_integration_log_status(
                        &log.id,
                        IntegrationLogStatus::Error,
                        Some(i64::from(status_code)),
                        Some(message.clone()),
                    )?;
                    return Ok(DispatchResult {
                        log_id: log.id,
                        status: DispatchStatus::Error,
                        message,
                    });
                }
            };

            if !is_success {
                let message = format_http_error(status_code, &body, token);
                db.update_integration_log_status(
                    &log.id,
                    IntegrationLogStatus::Error,
                    Some(i64::from(status_code)),
                    Some(message.clone()),
                )?;
                return Ok(DispatchResult {
                    log_id: log.id,
                    status: DispatchStatus::Error,
                    message,
                });
            }

            match parse_created_entity_id(&body, token) {
                Ok(remote_id) => {
                    db.update_integration_log_status(
                        &log.id,
                        IntegrationLogStatus::Sent,
                        Some(i64::from(status_code)),
                        None,
                    )?;
                    let message = match remote_id {
                        Some(id) => format!("Nota #{id} enviada ao negócio #{deal_id} no Pipedrive."),
                        None => format!("Nota enviada ao negócio #{deal_id} no Pipedrive."),
                    };
                    Ok(DispatchResult {
                        log_id: log.id,
                        status: DispatchStatus::Sent,
                        message,
                    })
                }
                Err(message) => {
                    db.update_integration_log_status(
                        &log.id,
                        IntegrationLogStatus::Error,
                        Some(i64::from(status_code)),
                        Some(message.clone()),
                    )?;
                    Ok(DispatchResult {
                        log_id: log.id,
                        status: DispatchStatus::Error,
                        message,
                    })
                }
            }
        }
        Err(err) => {
            let message = format!(
                "Falha de rede ao enviar nota ao Pipedrive: {}",
                sanitize_secret(&err.to_string(), token)
            );
            db.update_integration_log_status(
                &log.id,
                IntegrationLogStatus::Error,
                None,
                Some(message.clone()),
            )?;
            Ok(DispatchResult {
                log_id: log.id,
                status: DispatchStatus::Error,
                message,
            })
        }
    }
}

async fn dispatch_activities(
    db: &Database,
    client: &IntegrationClient,
    base: &str,
    token: &str,
    note: &Note,
    deal_id: i64,
    todo_id: Option<&str>,
) -> Result<DispatchResult, String> {
    let all_todos = db.list_todos(Some(&note.id))?;
    let targets = select_todos_for_activity(&all_todos, todo_id)?;

    let url = format!("{}/activities", base.trim_end_matches('/'));
    let mut sent_count = 0usize;
    let mut last_activity_id: Option<i64> = None;
    let mut last_log_id = String::new();
    let mut errors: Vec<(String, String)> = Vec::new();

    for todo in targets {
        let payload = build_activity_payload(&todo, note, deal_id);
        let payload_json = serde_json::to_string(&payload)
            .map_err(|e| format!("Falha ao serializar payload de atividade do Pipedrive: {e}"))?;

        let log = db.create_integration_log(CreateIntegrationLogInput {
            id: None,
            note_id: note.id.clone(),
            author_id: Some(note.author_id.clone()),
            target: IntegrationTarget::Pipedrive,
            status: IntegrationLogStatus::Pending,
            payload_json,
            response_status: None,
            error_message: None,
        })?;
        last_log_id = log.id.clone();

        let request_result = client
            .http()
            .post(&url)
            .header("x-api-token", token)
            .json(&payload)
            .send()
            .await;

        match request_result {
            Ok(response) => {
                let status_code = response.status().as_u16();
                let is_success = response.status().is_success();
                let body = match response.text().await {
                    Ok(text) => text,
                    Err(err) => {
                        let message = format!(
                            "Falha ao ler resposta do Pipedrive ao criar atividade: {}",
                            sanitize_secret(&err.to_string(), token)
                        );
                        db.update_integration_log_status(
                            &log.id,
                            IntegrationLogStatus::Error,
                            Some(i64::from(status_code)),
                            Some(message.clone()),
                        )?;
                        errors.push((log.id, message));
                        continue;
                    }
                };

                if !is_success {
                    let message = format_http_error(status_code, &body, token);
                    db.update_integration_log_status(
                        &log.id,
                        IntegrationLogStatus::Error,
                        Some(i64::from(status_code)),
                        Some(message.clone()),
                    )?;
                    errors.push((log.id, message));
                    continue;
                }

                match parse_created_entity_id(&body, token) {
                    Ok(Some(activity_id)) if activity_id > 0 => {
                        db.set_todo_pipedrive_activity_id(&todo.id, activity_id)?;
                        db.update_integration_log_status(
                            &log.id,
                            IntegrationLogStatus::Sent,
                            Some(i64::from(status_code)),
                            None,
                        )?;
                        sent_count += 1;
                        last_activity_id = Some(activity_id);
                    }
                    Ok(_) => {
                        let message =
                            "Pipedrive respondeu sucesso, mas sem data.id da atividade criada."
                                .to_string();
                        db.update_integration_log_status(
                            &log.id,
                            IntegrationLogStatus::Error,
                            Some(i64::from(status_code)),
                            Some(message.clone()),
                        )?;
                        errors.push((log.id, message));
                    }
                    Err(message) => {
                        db.update_integration_log_status(
                            &log.id,
                            IntegrationLogStatus::Error,
                            Some(i64::from(status_code)),
                            Some(message.clone()),
                        )?;
                        errors.push((log.id, message));
                    }
                }
            }
            Err(err) => {
                let message = format!(
                    "Falha de rede ao criar atividade no Pipedrive: {}",
                    sanitize_secret(&err.to_string(), token)
                );
                db.update_integration_log_status(
                    &log.id,
                    IntegrationLogStatus::Error,
                    None,
                    Some(message.clone()),
                )?;
                errors.push((log.id, message));
            }
        }
    }

    if errors.is_empty() {
        let message = if sent_count == 1 {
            match last_activity_id {
                Some(id) => format!("Atividade #{id} criada no negócio #{deal_id} no Pipedrive."),
                None => format!("Atividade criada no negócio #{deal_id} no Pipedrive."),
            }
        } else {
            format!("{sent_count} atividades criadas no negócio #{deal_id} no Pipedrive.")
        };
        Ok(DispatchResult {
            log_id: last_log_id,
            status: DispatchStatus::Sent,
            message,
        })
    } else {
        let (first_error_log_id, first_error_msg) = errors.remove(0);
        let failed_count = errors.len() + 1;
        let message = if sent_count > 0 {
            format!(
                "{sent_count} atividade(s) criada(s), mas {failed_count} falhou(aram): {first_error_msg}"
            )
        } else {
            first_error_msg
        };
        Ok(DispatchResult {
            log_id: first_error_log_id,
            status: DispatchStatus::Error,
            message,
        })
    }
}

fn select_todos_for_activity(
    todos: &[Todo],
    todo_id: Option<&str>,
) -> Result<Vec<Todo>, String> {
    if let Some(raw_id) = todo_id.map(str::trim).filter(|s| !s.is_empty()) {
        let found = todos
            .iter()
            .find(|todo| todo.id == raw_id)
            .cloned()
            .ok_or_else(|| "Tarefa não encontrada nesta nota.".to_string())?;
        if found.pipedrive_activity_id.is_some() {
            return Err("Esta tarefa já foi enviada como atividade ao Pipedrive.".to_string());
        }
        return Ok(vec![found]);
    }

    let pending: Vec<Todo> = todos
        .iter()
        .filter(|todo| !todo.done && todo.pipedrive_activity_id.is_none())
        .cloned()
        .collect();

    if pending.is_empty() {
        return Err(
            "Nenhuma tarefa pendente sem envio para criar atividade no Pipedrive.".to_string(),
        );
    }

    Ok(pending)
}

fn build_note_payload(note: &Note, deal_id: i64) -> Result<CreateNotePayload, String> {
    let title = note.title.trim();
    let body = note.content_md.trim();
    let content = match (title.is_empty(), body.is_empty()) {
        (true, true) => {
            return Err(
                "A nota precisa ter título ou conteúdo antes de ser enviada ao Pipedrive."
                    .to_string(),
            )
        }
        (false, true) => title.to_string(),
        (true, false) => body.to_string(),
        (false, false) => format!("# {title}\n\n{body}"),
    };

    Ok(CreateNotePayload {
        content,
        deal_id,
        person_id: note.pipedrive_person_id.filter(|id| *id > 0),
    })
}

fn build_activity_payload(todo: &Todo, note: &Note, deal_id: i64) -> CreateActivityPayload {
    CreateActivityPayload {
        subject: todo.text.trim().to_string(),
        activity_type: DEFAULT_ACTIVITY_TYPE,
        deal_id,
        person_id: note.pipedrive_person_id.filter(|id| *id > 0),
        due_date: todo.due_date.as_deref().and_then(normalize_pipedrive_due_date),
        done: u8::from(todo.done),
    }
}

fn normalize_pipedrive_due_date(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.len() >= 10 {
        let prefix = &trimmed[..10];
        let bytes = prefix.as_bytes();
        if bytes[4] == b'-'
            && bytes[7] == b'-'
            && bytes[..4].iter().all(u8::is_ascii_digit)
            && bytes[5..7].iter().all(u8::is_ascii_digit)
            && bytes[8..10].iter().all(u8::is_ascii_digit)
        {
            return Some(prefix.to_string());
        }
    }
    None
}

fn parse_deal_search_response(body: &str, token: &str) -> Result<Vec<DealSummary>, String> {
    let parsed: PipedriveEnvelope<DealSearchData> = serde_json::from_str(body).map_err(|_| {
        format!(
            "Resposta inválida do Pipedrive ao buscar negócios: {}",
            truncate_and_sanitize(body, token)
        )
    })?;

    if parsed.success == Some(false) {
        let detail = parsed
            .error
            .or(parsed.error_info)
            .unwrap_or_else(|| "erro retornado pela API".to_string());
        return Err(format!(
            "Pipedrive recusou a busca de negócios: {}",
            sanitize_secret(&detail, token)
        ));
    }

    let items = parsed.data.map(|d| d.items).unwrap_or_default();
    let deals = items
        .into_iter()
        .map(|entry| DealSummary {
            id: entry.item.id,
            title: entry.item.title,
            org_name: entry
                .item
                .organization
                .and_then(|org| org.name)
                .map(|name| name.trim().to_string())
                .filter(|name| !name.is_empty()),
        })
        .collect();

    Ok(deals)
}

fn parse_created_entity_id(body: &str, token: &str) -> Result<Option<i64>, String> {
    let parsed: PipedriveEnvelope<CreatedEntityData> =
        serde_json::from_str(body).map_err(|_| {
            format!(
                "Resposta inválida do Pipedrive: {}",
                truncate_and_sanitize(body, token)
            )
        })?;

    if parsed.success == Some(false) {
        let detail = parsed
            .error
            .or(parsed.error_info)
            .unwrap_or_else(|| "erro retornado pela API".to_string());
        return Err(format!(
            "Pipedrive recusou a operação: {}",
            sanitize_secret(&detail, token)
        ));
    }

    Ok(parsed.data.map(|d| d.id))
}

fn format_http_error(status_code: u16, body: &str, token: &str) -> String {
    let detail = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|val| {
            val.get("error")
                .and_then(Value::as_str)
                .or_else(|| val.get("error_info").and_then(Value::as_str))
                .map(str::to_string)
        })
        .unwrap_or_else(|| truncate_and_sanitize(body, token));

    let clean = sanitize_secret(detail.trim(), token);
    if clean.is_empty() {
        format!("Pipedrive retornou HTTP {status_code}.")
    } else {
        format!("Pipedrive retornou HTTP {status_code}: {clean}")
    }
}

fn truncate_and_sanitize(raw: &str, token: &str) -> String {
    let sanitized = sanitize_secret(raw.trim(), token);
    if sanitized.chars().count() <= MAX_ERROR_BODY_CHARS {
        return sanitized;
    }
    let truncated: String = sanitized.chars().take(MAX_ERROR_BODY_CHARS).collect();
    format!("{truncated}...")
}

fn sanitize_secret(input: &str, token: &str) -> String {
    if token.is_empty() {
        return input.to_string();
    }
    input.replace(token, "[REDACTED]")
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};
    use std::thread;

    use super::*;
    use crate::db::{SaveNoteDraftInput, UpsertTodoInput};
    use crate::integrations::IntegrationConfig;

    #[derive(Debug, Clone)]
    struct CapturedRequest {
        request_line: String,
        headers: String,
        body: String,
    }

    fn spawn_mock_server(
        responses: Vec<(u16, String)>,
    ) -> (String, Arc<Mutex<Vec<CapturedRequest>>>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock server");
        let addr = listener.local_addr().unwrap();
        let captured = Arc::new(Mutex::new(Vec::new()));
        let captured_clone = Arc::clone(&captured);

        let handle = thread::spawn(move || {
            for (status, resp_body) in responses {
                let (mut stream, _) = listener.accept().expect("accept connection");
                let mut buf = Vec::new();
                let mut chunk = [0u8; 4096];
                let mut header_end = None;
                let mut content_length = 0usize;

                loop {
                    let n = stream.read(&mut chunk).unwrap_or(0);
                    if n == 0 {
                        break;
                    }
                    buf.extend_from_slice(&chunk[..n]);
                    if header_end.is_none() {
                        if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                            header_end = Some(pos + 4);
                            let header_str = String::from_utf8_lossy(&buf[..pos]);
                            for line in header_str.lines() {
                                if let Some((k, v)) = line.split_once(':') {
                                    if k.eq_ignore_ascii_case("content-length") {
                                        content_length = v.trim().parse().unwrap_or(0);
                                    }
                                }
                            }
                        }
                    }
                    if let Some(end) = header_end {
                        if buf.len() >= end + content_length {
                            break;
                        }
                    }
                }

                let end = header_end.unwrap_or(buf.len());
                let header_text = String::from_utf8_lossy(&buf[..end]).to_string();
                let request_line = header_text.lines().next().unwrap_or("").to_string();
                let body = String::from_utf8_lossy(&buf[end..]).to_string();

                captured_clone.lock().unwrap().push(CapturedRequest {
                    request_line,
                    headers: header_text,
                    body,
                });

                let reason = match status {
                    200 => "OK",
                    201 => "Created",
                    401 => "Unauthorized",
                    500 => "Internal Server Error",
                    _ => "Status",
                };
                let http_resp = format!(
                    "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{resp_body}",
                    resp_body.len()
                );
                let _ = stream.write_all(http_resp.as_bytes());
                let _ = stream.flush();
            }
        });

        (format!("http://{addr}/v1"), captured, handle)
    }

    #[test]
    fn builds_note_and_activity_payloads_and_sanitizes_secrets() {
        let note = Note {
            id: "n-1".to_string(),
            author_id: "cs-1".to_string(),
            author_name: "Ana".to_string(),
            title: "Call QBR".to_string(),
            content_md: "- Ponto 1".to_string(),
            pipedrive_deal_id: Some(77),
            pipedrive_person_id: Some(501),
            created_at: "2026-11-19T10:00:00Z".to_string(),
            updated_at: "2026-11-19T10:00:00Z".to_string(),
            synced_at: None,
        };

        let note_payload = build_note_payload(&note, 77).unwrap();
        assert_eq!(note_payload.content, "# Call QBR\n\n- Ponto 1");
        assert_eq!(note_payload.deal_id, 77);
        assert_eq!(note_payload.person_id, Some(501));

        let todo = Todo {
            id: "t-1".to_string(),
            note_id: "n-1".to_string(),
            text: "Enviar minuta".to_string(),
            done: false,
            due_date: Some("2026-11-25T14:00:00Z".to_string()),
            pipedrive_activity_id: None,
        };
        let act_payload = build_activity_payload(&todo, &note, 77);
        assert_eq!(act_payload.subject, "Enviar minuta");
        assert_eq!(act_payload.activity_type, "task");
        assert_eq!(act_payload.due_date.as_deref(), Some("2026-11-25"));
        assert_eq!(act_payload.done, 0);

        assert_eq!(
            sanitize_secret("erro com token-xyz-999 aqui", "token-xyz-999"),
            "erro com [REDACTED] aqui"
        );
    }

    #[test]
    fn validates_inputs_and_missing_env() {
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
            None,
        ));
        assert!(bad_kind
            .unwrap_err()
            .contains("Tipo de envio Pipedrive inválido"));
    }

    #[test]
    fn searches_deals_using_header_token_and_maps_summary() {
        let token = "super-secret-pipedrive-token";
        let response_json = r#"{
            "success": true,
            "data": {
                "items": [
                    {
                        "item": {
                            "id": 101,
                            "title": "Expansão Enterprise",
                            "organization": { "name": "Acme Corp" }
                        }
                    },
                    {
                        "item": {
                            "id": 202,
                            "title": "Renovação Anual",
                            "organization": null
                        }
                    }
                ]
            }
        }"#;
        let (base_url, captured, handle) =
            spawn_mock_server(vec![(200, response_json.to_string())]);

        let client = IntegrationClient::with_config(IntegrationConfig {
            pipedrive_api_base: Some(base_url),
            pipedrive_api_token: Some(token.to_string()),
            ..IntegrationConfig::default()
        })
        .unwrap();

        let deals = tauri::async_runtime::block_on(search_deals(&client, "Acme")).unwrap();
        handle.join().unwrap();

        assert_eq!(
            deals,
            vec![
                DealSummary {
                    id: 101,
                    title: "Expansão Enterprise".to_string(),
                    org_name: Some("Acme Corp".to_string()),
                },
                DealSummary {
                    id: 202,
                    title: "Renovação Anual".to_string(),
                    org_name: None,
                },
            ]
        );

        let reqs = captured.lock().unwrap();
        assert_eq!(reqs.len(), 1);
        assert!(reqs[0]
            .request_line
            .starts_with("GET /v1/deals/search?term=Acme&limit=10"));
        assert!(!reqs[0].request_line.contains(token));
        assert!(reqs[0]
            .headers
            .to_ascii_lowercase()
            .contains(&format!("x-api-token: {token}")));
    }

    #[test]
    fn sends_note_and_records_sent_and_error_logs() {
        let token = "secret-tok-notes";
        let (base_url, captured, handle) = spawn_mock_server(vec![
            (201, r#"{"success":true,"data":{"id":777}}"#.to_string()),
            (
                401,
                format!(r#"{{"success":false,"error":"Invalid token {token}"}}"#),
            ),
        ]);

        let db = Database::open_in_memory().unwrap();
        let note = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("n-send".to_string()),
                title: "Alinhamento".to_string(),
                content_md: "Cliente aprovou escopo.".to_string(),
                pipedrive_deal_id: Some(55),
                pipedrive_person_id: None,
            })
            .unwrap();

        let client = IntegrationClient::with_config(IntegrationConfig {
            pipedrive_api_base: Some(base_url),
            pipedrive_api_token: Some(token.to_string()),
            ..IntegrationConfig::default()
        })
        .unwrap();

        let sent = tauri::async_runtime::block_on(send_note_or_activity(
            &db, &client, &note.id, "note", 55, None,
        ))
        .unwrap();
        assert_eq!(sent.status, DispatchStatus::Sent);
        assert!(sent.message.contains("#777"));

        let failed = tauri::async_runtime::block_on(send_note_or_activity(
            &db, &client, &note.id, "note", 55, None,
        ))
        .unwrap();
        handle.join().unwrap();

        assert_eq!(failed.status, DispatchStatus::Error);
        assert!(failed.message.contains("HTTP 401"));
        assert!(!failed.message.contains(token));

        let logs = db.list_integration_logs(Some(&note.id)).unwrap();
        assert_eq!(logs.len(), 2);
        assert_eq!(logs[0].status, IntegrationLogStatus::Error);
        assert_eq!(logs[0].response_status, Some(401));
        assert!(!logs[0].error_message.as_deref().unwrap().contains(token));
        assert_eq!(logs[1].status, IntegrationLogStatus::Sent);
        assert_eq!(logs[1].response_status, Some(201));
        assert_eq!(logs[1].target, IntegrationTarget::Pipedrive);
        assert!(!logs[1].payload_json.contains(token));

        let reqs = captured.lock().unwrap();
        assert_eq!(reqs.len(), 2);
        assert!(reqs[0].request_line.starts_with("POST /v1/notes"));
        assert!(reqs[0].body.contains("# Alinhamento"));
    }

    #[test]
    fn sends_activity_and_persists_pipedrive_activity_id() {
        let token = "secret-tok-act";
        let (base_url, captured, handle) = spawn_mock_server(vec![(
            201,
            r#"{"success":true,"data":{"id":9001}}"#.to_string(),
        )]);

        let db = Database::open_in_memory().unwrap();
        let note = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("n-todo".to_string()),
                title: "Onboarding".to_string(),
                content_md: "Checklist".to_string(),
                pipedrive_deal_id: Some(88),
                pipedrive_person_id: None,
            })
            .unwrap();

        let todo = db
            .upsert_todo(UpsertTodoInput {
                id: Some("t-1".to_string()),
                note_id: note.id.clone(),
                text: "Configurar SSO".to_string(),
                done: false,
                due_date: Some("2026-11-30".to_string()),
            })
            .unwrap();

        let client = IntegrationClient::with_config(IntegrationConfig {
            pipedrive_api_base: Some(base_url),
            pipedrive_api_token: Some(token.to_string()),
            ..IntegrationConfig::default()
        })
        .unwrap();

        let res = tauri::async_runtime::block_on(send_note_or_activity(
            &db,
            &client,
            &note.id,
            "activity",
            88,
            Some(&todo.id),
        ))
        .unwrap();
        handle.join().unwrap();

        assert_eq!(res.status, DispatchStatus::Sent);
        assert!(res.message.contains("#9001"));

        let todos = db.list_todos(Some(&note.id)).unwrap();
        assert_eq!(todos[0].pipedrive_activity_id, Some(9001));

        let logs = db.list_integration_logs(Some(&note.id)).unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].status, IntegrationLogStatus::Sent);
        assert_eq!(logs[0].target, IntegrationTarget::Pipedrive);

        let reqs = captured.lock().unwrap();
        assert_eq!(reqs.len(), 1);
        assert!(reqs[0].request_line.starts_with("POST /v1/activities"));
        assert!(reqs[0].body.contains("Configurar SSO"));
        assert!(reqs[0].body.contains("2026-11-30"));

        // Reenvio do mesmo todo já vinculado deve ser bloqueado
        let duplicate = tauri::async_runtime::block_on(send_note_or_activity(
            &db,
            &client,
            &note.id,
            "activity",
            88,
            Some(&todo.id),
        ));
        assert!(duplicate.unwrap_err().contains("já foi enviada"));
    }
}
