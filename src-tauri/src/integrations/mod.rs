pub mod n8n;
pub mod pipedrive;
pub mod supabase;

use serde::{Deserialize, Serialize};
use std::env;
use std::fmt;
use std::sync::RwLock;
use std::time::Duration;

use crate::db::{Database, StoredIntegrationConfig};

const DEFAULT_HTTP_TIMEOUT_SECS: u64 = 15;

#[derive(Clone, Default)]
pub struct IntegrationConfig {
    pub pipedrive_api_base: Option<String>,
    pub pipedrive_api_token: Option<String>,
    pub n8n_webhook_url: Option<String>,
    pub n8n_webhook_secret: Option<String>,
    pub supabase_url: Option<String>,
    pub supabase_anon_key: Option<String>,
}

impl fmt::Debug for IntegrationConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("IntegrationConfig")
            .field("pipedrive_api_base", &self.pipedrive_api_base)
            .field(
                "pipedrive_api_token",
                &self.pipedrive_api_token.as_ref().map(|_| "[REDACTED]"),
            )
            .field("n8n_webhook_url", &self.n8n_webhook_url)
            .field(
                "n8n_webhook_secret",
                &self.n8n_webhook_secret.as_ref().map(|_| "[REDACTED]"),
            )
            .field("supabase_url", &self.supabase_url)
            .field(
                "supabase_anon_key",
                &self.supabase_anon_key.as_ref().map(|_| "[REDACTED]"),
            )
            .finish()
    }
}

impl IntegrationConfig {
    pub fn from_env() -> Self {
        Self {
            pipedrive_api_base: read_env_non_empty("PIPEDRIVE_API_BASE"),
            pipedrive_api_token: read_env_non_empty("PIPEDRIVE_API_TOKEN"),
            n8n_webhook_url: read_env_non_empty("N8N_WEBHOOK_URL"),
            n8n_webhook_secret: read_env_non_empty("N8N_WEBHOOK_SECRET"),
            supabase_url: read_env_non_empty("SUPABASE_URL"),
            supabase_anon_key: read_env_non_empty("SUPABASE_ANON_KEY"),
        }
    }

    pub fn from_stored_with_fallback(
        stored: StoredIntegrationConfig,
        fallback: &IntegrationConfig,
    ) -> Self {
        Self {
            pipedrive_api_base: stored
                .pipedrive_api_base
                .or_else(|| fallback.pipedrive_api_base.clone()),
            pipedrive_api_token: stored
                .pipedrive_api_token
                .or_else(|| fallback.pipedrive_api_token.clone()),
            n8n_webhook_url: stored
                .n8n_webhook_url
                .or_else(|| fallback.n8n_webhook_url.clone()),
            n8n_webhook_secret: stored
                .n8n_webhook_secret
                .or_else(|| fallback.n8n_webhook_secret.clone()),
            supabase_url: stored
                .supabase_url
                .or_else(|| fallback.supabase_url.clone()),
            supabase_anon_key: stored
                .supabase_anon_key
                .or_else(|| fallback.supabase_anon_key.clone()),
        }
    }

    pub fn pipedrive_credentials(&self) -> Result<(&str, &str), String> {
        let base = self.pipedrive_api_base.as_deref().ok_or_else(|| {
            "PIPEDRIVE_API_BASE não configurada nos Ajustes nem no ambiente.".to_string()
        })?;
        let token = self.pipedrive_api_token.as_deref().ok_or_else(|| {
            "PIPEDRIVE_API_TOKEN não configurada nos Ajustes nem no ambiente.".to_string()
        })?;
        Ok((base, token))
    }

    pub fn n8n_endpoint(&self) -> Result<(&str, Option<&str>), String> {
        let url = self.n8n_webhook_url.as_deref().ok_or_else(|| {
            "N8N_WEBHOOK_URL não configurada nos Ajustes nem no ambiente.".to_string()
        })?;
        Ok((url, self.n8n_webhook_secret.as_deref()))
    }

    pub fn supabase_credentials(&self) -> Result<(&str, &str), String> {
        let url = self.supabase_url.as_deref().ok_or_else(|| {
            "SUPABASE_URL não configurada nos Ajustes nem no ambiente.".to_string()
        })?;
        let anon_key = self.supabase_anon_key.as_deref().ok_or_else(|| {
            "SUPABASE_ANON_KEY não configurada nos Ajustes nem no ambiente.".to_string()
        })?;
        Ok((url, anon_key))
    }
}

pub struct IntegrationClient {
    http: reqwest::Client,
    env_fallback: IntegrationConfig,
    config: RwLock<IntegrationConfig>,
}

impl IntegrationClient {
    pub fn from_env() -> Result<Self, String> {
        Self::with_config(IntegrationConfig::from_env())
    }

    pub fn from_env_and_db(db: &Database) -> Result<Self, String> {
        Self::with_config_and_db(IntegrationConfig::from_env(), db)
    }

    pub fn with_config(config: IntegrationConfig) -> Result<Self, String> {
        let http = build_http_client()?;
        Ok(Self {
            http,
            env_fallback: config.clone(),
            config: RwLock::new(config),
        })
    }

    pub fn with_config_and_db(
        env_fallback: IntegrationConfig,
        db: &Database,
    ) -> Result<Self, String> {
        let http = build_http_client()?;
        let stored = db.load_integration_config()?;
        let effective = IntegrationConfig::from_stored_with_fallback(stored, &env_fallback);
        Ok(Self {
            http,
            env_fallback,
            config: RwLock::new(effective),
        })
    }

    pub fn refresh_from_db(&self, db: &Database) -> Result<(), String> {
        let stored = db.load_integration_config()?;
        let effective = IntegrationConfig::from_stored_with_fallback(stored, &self.env_fallback);
        let mut guard = self
            .config
            .write()
            .map_err(|_| "Falha ao atualizar configuração de integrações".to_string())?;
        *guard = effective;
        Ok(())
    }

    pub fn http(&self) -> &reqwest::Client {
        &self.http
    }

    pub fn config(&self) -> IntegrationConfig {
        self.config
            .read()
            .map(|guard| guard.clone())
            .unwrap_or_else(|_| self.env_fallback.clone())
    }
}

fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(DEFAULT_HTTP_TIMEOUT_SECS))
        .user_agent(concat!("quicknote-crm/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("Falha ao inicializar cliente HTTP: {e}"))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DealSummary {
    pub id: i64,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub org_name: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DispatchStatus {
    Sent,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DispatchResult {
    pub log_id: String,
    pub status: DispatchStatus,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub synced_notes: usize,
    pub synced_logs: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PipedriveSendKind {
    Note,
    Activity,
}

impl PipedriveSendKind {
    pub fn parse(raw: &str) -> Result<Self, String> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "note" => Ok(Self::Note),
            "activity" => Ok(Self::Activity),
            _ => Err("Tipo de envio Pipedrive inválido. Use 'note' ou 'activity'.".to_string()),
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::Activity => "activity",
        }
    }
}

fn read_env_non_empty(key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_secrets_in_debug_output() {
        let cfg = IntegrationConfig {
            pipedrive_api_base: Some("https://api.pipedrive.com/v1".to_string()),
            pipedrive_api_token: Some("secret-pipedrive-token".to_string()),
            n8n_webhook_url: Some("https://n8n.example.com/webhook".to_string()),
            n8n_webhook_secret: Some("secret-n8n-header".to_string()),
            supabase_url: Some("https://proj.supabase.co".to_string()),
            supabase_anon_key: Some("secret-supabase-anon".to_string()),
        };

        let formatted = format!("{cfg:?}");
        assert!(!formatted.contains("secret-pipedrive-token"));
        assert!(!formatted.contains("secret-n8n-header"));
        assert!(!formatted.contains("secret-supabase-anon"));
        assert!(formatted.contains("[REDACTED]"));
    }

    #[test]
    fn parses_pipedrive_send_kind_strictly() {
        assert_eq!(PipedriveSendKind::parse("note").unwrap(), PipedriveSendKind::Note);
        assert_eq!(
            PipedriveSendKind::parse(" ACTIVITY ").unwrap(),
            PipedriveSendKind::Activity
        );
        assert!(PipedriveSendKind::parse("deal").is_err());
    }

    #[test]
    fn builds_http_client_and_validates_missing_credentials() {
        let client = IntegrationClient::with_config(IntegrationConfig::default())
            .expect("build reqwest client");
        let _ = client.http();
        assert!(client.config().pipedrive_credentials().is_err());
        assert!(client.config().n8n_endpoint().is_err());
        assert!(client.config().supabase_credentials().is_err());
    }

    #[test]
    fn sqlite_settings_override_env_fallback_and_refresh_at_runtime() {
        use crate::db::SetIntegrationSettingsInput;

        let db = Database::open_in_memory().unwrap();
        let env_fallback = IntegrationConfig {
            pipedrive_api_base: Some("https://env.pipedrive.com/v1".to_string()),
            pipedrive_api_token: Some("env-pd-token".to_string()),
            n8n_webhook_url: Some("https://env.n8n.local/hook".to_string()),
            n8n_webhook_secret: None,
            supabase_url: Some("https://env.supabase.co".to_string()),
            supabase_anon_key: Some("env-supa-key".to_string()),
        };

        let client = IntegrationClient::with_config_and_db(env_fallback, &db).unwrap();
        let initial = client.config();
        assert_eq!(
            initial.pipedrive_credentials().unwrap(),
            ("https://env.pipedrive.com/v1", "env-pd-token")
        );

        db.set_integration_settings(SetIntegrationSettingsInput {
            pipedrive_api_base: Some("https://db.pipedrive.com/v1".to_string()),
            pipedrive_api_token: Some("db-pd-token".to_string()),
            n8n_webhook_secret: Some("db-n8n-secret".to_string()),
            ..Default::default()
        })
        .unwrap();
        client.refresh_from_db(&db).unwrap();

        let refreshed = client.config();
        assert_eq!(
            refreshed.pipedrive_credentials().unwrap(),
            ("https://db.pipedrive.com/v1", "db-pd-token")
        );
        assert_eq!(
            refreshed.n8n_endpoint().unwrap(),
            ("https://env.n8n.local/hook", Some("db-n8n-secret"))
        );
        assert_eq!(
            refreshed.supabase_credentials().unwrap(),
            ("https://env.supabase.co", "env-supa-key")
        );

        db.set_integration_settings(SetIntegrationSettingsInput {
            clear_pipedrive_token: true,
            ..Default::default()
        })
        .unwrap();
        client.refresh_from_db(&db).unwrap();

        let after_clear = client.config();
        assert_eq!(
            after_clear.pipedrive_credentials().unwrap(),
            ("https://db.pipedrive.com/v1", "env-pd-token")
        );
    }
}
