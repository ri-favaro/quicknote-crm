use chrono::{DateTime, NaiveDate, SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use uuid::Uuid;

pub const DEFAULT_AUTHOR_ID: &str = "local-cs";
pub const DEFAULT_AUTHOR_NAME: &str = "CS Local";
pub const MIN_DOCK_OPACITY: u8 = 40;
pub const MAX_DOCK_OPACITY: u8 = 100;
pub const DEFAULT_DOCK_OPACITY: u8 = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DockTheme {
    #[default]
    Dark,
    Light,
    HighContrast,
}

impl DockTheme {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Dark => "dark",
            Self::Light => "light",
            Self::HighContrast => "high-contrast",
        }
    }

    pub fn from_db(value: &str) -> Result<Self, String> {
        match value {
            "dark" => Ok(Self::Dark),
            "light" => Ok(Self::Light),
            "high-contrast" => Ok(Self::HighContrast),
            other => Err(format!("Tema do dock inválido no SQLite: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DockAccent {
    #[default]
    Violet,
    Blue,
    Emerald,
    Amber,
}

impl DockAccent {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Violet => "violet",
            Self::Blue => "blue",
            Self::Emerald => "emerald",
            Self::Amber => "amber",
        }
    }

    pub fn from_db(value: &str) -> Result<Self, String> {
        match value {
            "violet" => Ok(Self::Violet),
            "blue" => Ok(Self::Blue),
            "emerald" => Ok(Self::Emerald),
            "amber" => Ok(Self::Amber),
            other => Err(format!("Cor de destaque inválida no SQLite: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DockPanelSize {
    Compact,
    #[default]
    Default,
    Wide,
}

impl DockPanelSize {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Compact => "compact",
            Self::Default => "default",
            Self::Wide => "wide",
        }
    }

    pub fn from_db(value: &str) -> Result<Self, String> {
        match value {
            "compact" => Ok(Self::Compact),
            "default" => Ok(Self::Default),
            "wide" => Ok(Self::Wide),
            other => Err(format!("Tamanho do painel inválido no SQLite: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockAppearance {
    pub theme: DockTheme,
    pub accent: DockAccent,
    pub expanded_opacity: u8,
    pub collapsed_opacity: u8,
    pub panel_size: DockPanelSize,
}

impl Default for DockAppearance {
    fn default() -> Self {
        Self {
            theme: DockTheme::default(),
            accent: DockAccent::default(),
            expanded_opacity: DEFAULT_DOCK_OPACITY,
            collapsed_opacity: DEFAULT_DOCK_OPACITY,
            panel_size: DockPanelSize::default(),
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDockAppearanceInput {
    #[serde(default)]
    pub theme: Option<DockTheme>,
    #[serde(default)]
    pub accent: Option<DockAccent>,
    #[serde(default)]
    pub expanded_opacity: Option<i64>,
    #[serde(default)]
    pub collapsed_opacity: Option<i64>,
    #[serde(default)]
    pub panel_size: Option<DockPanelSize>,
}

fn clamp_opacity(value: i64) -> u8 {
    value.clamp(i64::from(MIN_DOCK_OPACITY), i64::from(MAX_DOCK_OPACITY)) as u8
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub author_id: String,
    pub author_name: String,
    pub title: String,
    pub content_md: String,
    pub pipedrive_deal_id: Option<i64>,
    pub pipedrive_person_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
    pub synced_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteDraftInput {
    pub id: Option<String>,
    pub title: String,
    pub content_md: String,
    #[serde(default)]
    pub pipedrive_deal_id: Option<i64>,
    #[serde(default)]
    pub pipedrive_person_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub note_id: String,
    pub text: String,
    pub done: bool,
    pub due_date: Option<String>,
    pub pipedrive_activity_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertTodoInput {
    pub id: Option<String>,
    pub note_id: String,
    pub text: String,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub due_date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveProfile {
    pub author_id: String,
    pub author_name: String,
    pub has_token: bool,
    pub is_configured: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetActiveProfileInput {
    pub author_id: String,
    pub author_name: String,
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub clear_token: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationSettings {
    pub pipedrive_api_base: String,
    pub has_pipedrive_token: bool,
    pub n8n_webhook_url: String,
    pub has_n8n_secret: bool,
    pub supabase_url: String,
    pub has_supabase_key: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetIntegrationSettingsInput {
    #[serde(default)]
    pub pipedrive_api_base: Option<String>,
    #[serde(default)]
    pub pipedrive_api_token: Option<String>,
    #[serde(default)]
    pub clear_pipedrive_token: bool,
    #[serde(default)]
    pub n8n_webhook_url: Option<String>,
    #[serde(default)]
    pub n8n_webhook_secret: Option<String>,
    #[serde(default)]
    pub clear_n8n_secret: bool,
    #[serde(default)]
    pub supabase_url: Option<String>,
    #[serde(default)]
    pub supabase_anon_key: Option<String>,
    #[serde(default)]
    pub clear_supabase_key: bool,
}

#[derive(Clone, Default, PartialEq, Eq)]
pub struct StoredIntegrationConfig {
    pub pipedrive_api_base: Option<String>,
    pub pipedrive_api_token: Option<String>,
    pub n8n_webhook_url: Option<String>,
    pub n8n_webhook_secret: Option<String>,
    pub supabase_url: Option<String>,
    pub supabase_anon_key: Option<String>,
}

impl fmt::Debug for StoredIntegrationConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("StoredIntegrationConfig")
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

impl StoredIntegrationConfig {
    pub fn to_public_settings(&self) -> IntegrationSettings {
        IntegrationSettings {
            pipedrive_api_base: self.pipedrive_api_base.clone().unwrap_or_default(),
            has_pipedrive_token: self.pipedrive_api_token.is_some(),
            n8n_webhook_url: self.n8n_webhook_url.clone().unwrap_or_default(),
            has_n8n_secret: self.n8n_webhook_secret.is_some(),
            supabase_url: self.supabase_url.clone().unwrap_or_default(),
            has_supabase_key: self.supabase_anon_key.is_some(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IntegrationTarget {
    Pipedrive,
    N8n,
}

impl IntegrationTarget {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pipedrive => "pipedrive",
            Self::N8n => "n8n",
        }
    }

    pub fn from_db(value: &str) -> Result<Self, String> {
        match value {
            "pipedrive" => Ok(Self::Pipedrive),
            "n8n" => Ok(Self::N8n),
            other => Err(format!("Destino de integração inválido no SQLite: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IntegrationLogStatus {
    Pending,
    Sent,
    Error,
}

impl IntegrationLogStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Sent => "sent",
            Self::Error => "error",
        }
    }

    pub fn from_db(value: &str) -> Result<Self, String> {
        match value {
            "pending" => Ok(Self::Pending),
            "sent" => Ok(Self::Sent),
            "error" => Ok(Self::Error),
            other => Err(format!(
                "Status de log de integração inválido no SQLite: {other}"
            )),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationLog {
    pub id: String,
    pub note_id: String,
    pub author_id: String,
    pub target: IntegrationTarget,
    pub status: IntegrationLogStatus,
    pub payload_json: String,
    pub response_status: Option<i64>,
    pub error_message: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct CreateIntegrationLogInput {
    pub id: Option<String>,
    pub note_id: String,
    pub author_id: Option<String>,
    pub target: IntegrationTarget,
    pub status: IntegrationLogStatus,
    pub payload_json: String,
    pub response_status: Option<i64>,
    pub error_message: Option<String>,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Falha ao criar diretório do banco SQLite: {e}"))?;
            }
        }

        let conn = Connection::open(path)
            .map_err(|e| format!("Falha ao abrir banco SQLite: {e}"))?;
        let _ = conn.execute_batch("PRAGMA journal_mode = WAL;");
        conn.execute_batch("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;")
            .map_err(|e| format!("Falha ao configurar pragmas SQLite: {e}"))?;

        init_schema(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory()
            .map_err(|e| format!("Falha ao abrir banco SQLite em memória: {e}"))?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|e| format!("Falha ao ativar chaves estrangeiras no SQLite: {e}"))?;

        init_schema(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn lock_conn(&self) -> Result<MutexGuard<'_, Connection>, String> {
        self.conn
            .lock()
            .map_err(|_| "Falha ao acessar conexão SQLite".to_string())
    }

    pub fn get_active_profile(&self) -> Result<ActiveProfile, String> {
        let conn = self.lock_conn()?;
        read_active_profile(&conn)
    }

    pub fn get_dock_appearance(&self) -> Result<DockAppearance, String> {
        let conn = self.lock_conn()?;
        read_dock_appearance(&conn)
    }

    pub fn set_dock_appearance(
        &self,
        input: UpdateDockAppearanceInput,
    ) -> Result<DockAppearance, String> {
        let conn = self.lock_conn()?;
        let current = read_dock_appearance(&conn)?;
        let next = DockAppearance {
            theme: input.theme.unwrap_or(current.theme),
            accent: input.accent.unwrap_or(current.accent),
            expanded_opacity: input
                .expanded_opacity
                .map(clamp_opacity)
                .unwrap_or(current.expanded_opacity),
            collapsed_opacity: input
                .collapsed_opacity
                .map(clamp_opacity)
                .unwrap_or(current.collapsed_opacity),
            panel_size: input.panel_size.unwrap_or(current.panel_size),
        };

        let updated_at = now_iso();
        conn.execute(
            "INSERT INTO dock_appearance (singleton, theme, accent, expanded_opacity, collapsed_opacity, panel_size, updated_at)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(singleton) DO UPDATE SET
                 theme = excluded.theme,
                 accent = excluded.accent,
                 expanded_opacity = excluded.expanded_opacity,
                 collapsed_opacity = excluded.collapsed_opacity,
                 panel_size = excluded.panel_size,
                 updated_at = excluded.updated_at",
            params![
                next.theme.as_str(),
                next.accent.as_str(),
                i64::from(next.expanded_opacity),
                i64::from(next.collapsed_opacity),
                next.panel_size.as_str(),
                updated_at
            ],
        )
        .map_err(|e| format!("Falha ao salvar aparência do dock: {e}"))?;

        Ok(next)
    }

    pub fn reset_dock_appearance(&self) -> Result<DockAppearance, String> {
        let conn = self.lock_conn()?;
        conn.execute("DELETE FROM dock_appearance WHERE singleton = 1", [])
            .map_err(|e| format!("Falha ao restaurar aparência padrão do dock: {e}"))?;
        Ok(DockAppearance::default())
    }

    pub fn set_active_profile(
        &self,
        input: SetActiveProfileInput,
    ) -> Result<ActiveProfile, String> {
        let author_id = input.author_id.trim();
        let author_name = input.author_name.trim();
        if author_id.is_empty() {
            return Err("ID do CS é obrigatório.".to_string());
        }
        if author_name.is_empty() {
            return Err("Nome exibido do CS é obrigatório.".to_string());
        }

        let conn = self.lock_conn()?;
        let existing_token: Option<String> = conn
            .query_row(
                "SELECT token FROM cs_profile WHERE singleton = 1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Falha ao consultar perfil CS: {e}"))?;

        let next_token = if input.clear_token {
            String::new()
        } else if let Some(raw_token) = input.token.as_deref() {
            let trimmed = raw_token.trim();
            if trimmed.is_empty() {
                existing_token.unwrap_or_default()
            } else {
                trimmed.to_string()
            }
        } else {
            existing_token.unwrap_or_default()
        };

        let updated_at = now_iso();
        conn.execute(
            "INSERT INTO cs_profile (singleton, author_id, author_name, token, updated_at)
             VALUES (1, ?1, ?2, ?3, ?4)
             ON CONFLICT(singleton) DO UPDATE SET
                 author_id = excluded.author_id,
                 author_name = excluded.author_name,
                 token = excluded.token,
                 updated_at = excluded.updated_at",
            params![author_id, author_name, next_token, updated_at],
        )
        .map_err(|e| format!("Falha ao salvar perfil CS: {e}"))?;

        Ok(ActiveProfile {
            author_id: author_id.to_string(),
            author_name: author_name.to_string(),
            has_token: !next_token.is_empty(),
            is_configured: true,
        })
    }

    pub fn get_integration_settings(&self) -> Result<IntegrationSettings, String> {
        let conn = self.lock_conn()?;
        Ok(read_stored_integration_config(&conn)?.to_public_settings())
    }

    pub fn load_integration_config(&self) -> Result<StoredIntegrationConfig, String> {
        let conn = self.lock_conn()?;
        read_stored_integration_config(&conn)
    }

    pub fn set_integration_settings(
        &self,
        input: SetIntegrationSettingsInput,
    ) -> Result<IntegrationSettings, String> {
        let conn = self.lock_conn()?;
        let current = read_stored_integration_config(&conn)?;

        let pipedrive_api_base = match input.pipedrive_api_base {
            Some(raw) => normalize_optional_url(&raw, "URL base do Pipedrive")?,
            None => current.pipedrive_api_base,
        };
        let pipedrive_api_token = resolve_next_secret(
            input.clear_pipedrive_token,
            input.pipedrive_api_token.as_deref(),
            current.pipedrive_api_token,
        );

        let n8n_webhook_url = match input.n8n_webhook_url {
            Some(raw) => normalize_optional_url(&raw, "URL do webhook n8n")?,
            None => current.n8n_webhook_url,
        };
        let n8n_webhook_secret = resolve_next_secret(
            input.clear_n8n_secret,
            input.n8n_webhook_secret.as_deref(),
            current.n8n_webhook_secret,
        );

        let supabase_url = match input.supabase_url {
            Some(raw) => normalize_optional_url(&raw, "URL do projeto Supabase")?,
            None => current.supabase_url,
        };
        let supabase_anon_key = resolve_next_secret(
            input.clear_supabase_key,
            input.supabase_anon_key.as_deref(),
            current.supabase_anon_key,
        );

        let updated_at = now_iso();
        conn.execute(
            "INSERT INTO integration_settings (
                singleton,
                pipedrive_api_base, pipedrive_api_token,
                n8n_webhook_url, n8n_webhook_secret,
                supabase_url, supabase_anon_key,
                updated_at
             ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(singleton) DO UPDATE SET
                pipedrive_api_base = excluded.pipedrive_api_base,
                pipedrive_api_token = excluded.pipedrive_api_token,
                n8n_webhook_url = excluded.n8n_webhook_url,
                n8n_webhook_secret = excluded.n8n_webhook_secret,
                supabase_url = excluded.supabase_url,
                supabase_anon_key = excluded.supabase_anon_key,
                updated_at = excluded.updated_at",
            params![
                pipedrive_api_base.as_deref().unwrap_or(""),
                pipedrive_api_token.as_deref().unwrap_or(""),
                n8n_webhook_url.as_deref().unwrap_or(""),
                n8n_webhook_secret.as_deref().unwrap_or(""),
                supabase_url.as_deref().unwrap_or(""),
                supabase_anon_key.as_deref().unwrap_or(""),
                updated_at,
            ],
        )
        .map_err(|e| format!("Falha ao salvar configurações de integrações: {e}"))?;

        let next = StoredIntegrationConfig {
            pipedrive_api_base,
            pipedrive_api_token,
            n8n_webhook_url,
            n8n_webhook_secret,
            supabase_url,
            supabase_anon_key,
        };
        Ok(next.to_public_settings())
    }

    pub fn save_note_draft(&self, input: SaveNoteDraftInput) -> Result<Note, String> {
        let note_id = normalize_optional_id(input.id).unwrap_or_else(|| Uuid::new_v4().to_string());
        let conn = self.lock_conn()?;
        let profile = read_active_profile(&conn)?;
        let now = now_iso();

        conn.execute(
            "INSERT INTO notes (
                id, author_id, author_name, title, content_md,
                pipedrive_deal_id, pipedrive_person_id, created_at, updated_at, synced_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, NULL)
             ON CONFLICT(id) DO UPDATE SET
                author_id = CASE
                    WHEN notes.author_id = ?9 THEN excluded.author_id
                    ELSE notes.author_id
                END,
                author_name = CASE
                    WHEN notes.author_id = ?9 THEN excluded.author_name
                    ELSE notes.author_name
                END,
                title = excluded.title,
                content_md = excluded.content_md,
                pipedrive_deal_id = COALESCE(excluded.pipedrive_deal_id, notes.pipedrive_deal_id),
                pipedrive_person_id = COALESCE(excluded.pipedrive_person_id, notes.pipedrive_person_id),
                updated_at = excluded.updated_at",
            params![
                note_id,
                profile.author_id,
                profile.author_name,
                input.title,
                input.content_md,
                input.pipedrive_deal_id,
                input.pipedrive_person_id,
                now,
                DEFAULT_AUTHOR_ID,
            ],
        )
        .map_err(|e| format!("Falha ao salvar nota no SQLite: {e}"))?;

        read_note_by_id(&conn, &note_id)?
            .ok_or_else(|| "Nota salva não foi encontrada após gravação.".to_string())
    }

    pub fn list_notes(&self) -> Result<Vec<Note>, String> {
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, author_id, author_name, title, content_md,
                        pipedrive_deal_id, pipedrive_person_id, created_at, updated_at, synced_at
                 FROM notes
                 ORDER BY updated_at DESC, rowid DESC",
            )
            .map_err(|e| format!("Falha ao preparar consulta de notas: {e}"))?;

        let rows = stmt
            .query_map([], row_to_note)
            .map_err(|e| format!("Falha ao listar notas: {e}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Falha ao ler registro de nota: {e}"))
    }

    pub fn get_note(&self, id: &str) -> Result<Option<Note>, String> {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Ok(None);
        }
        let conn = self.lock_conn()?;
        read_note_by_id(&conn, trimmed)
    }

    pub fn delete_note(&self, id: &str) -> Result<bool, String> {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Ok(false);
        }
        let conn = self.lock_conn()?;
        let affected = conn
            .execute("DELETE FROM notes WHERE id = ?1", params![trimmed])
            .map_err(|e| format!("Falha ao excluir nota: {e}"))?;
        Ok(affected > 0)
    }

    pub fn list_todos(&self, note_id: Option<&str>) -> Result<Vec<Todo>, String> {
        let conn = self.lock_conn()?;
        let normalized_note_id = note_id.map(str::trim).filter(|s| !s.is_empty());

        if let Some(nid) = normalized_note_id {
            let mut stmt = conn
                .prepare(
                    "SELECT id, note_id, text, done, due_date, pipedrive_activity_id
                     FROM todos
                     WHERE note_id = ?1
                     ORDER BY rowid DESC",
                )
                .map_err(|e| format!("Falha ao preparar consulta de tarefas: {e}"))?;

            let rows = stmt
                .query_map(params![nid], row_to_todo)
                .map_err(|e| format!("Falha ao listar tarefas: {e}"))?;

            return rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Falha ao ler registro de tarefa: {e}"));
        }

        let mut stmt = conn
            .prepare(
                "SELECT id, note_id, text, done, due_date, pipedrive_activity_id
                 FROM todos
                 ORDER BY rowid DESC",
            )
            .map_err(|e| format!("Falha ao preparar consulta de tarefas: {e}"))?;

        let rows = stmt
            .query_map([], row_to_todo)
            .map_err(|e| format!("Falha ao listar tarefas: {e}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Falha ao ler registro de tarefa: {e}"))
    }

    pub fn upsert_todo(&self, input: UpsertTodoInput) -> Result<Todo, String> {
        let text = input.text.trim();
        if text.is_empty() {
            return Err("Descrição da tarefa é obrigatória.".to_string());
        }

        let note_id = input.note_id.trim();
        if note_id.is_empty() {
            return Err("Toda tarefa precisa estar vinculada a uma nota.".to_string());
        }

        let due_date = normalize_due_date(input.due_date)?;
        let todo_id = normalize_optional_id(input.id).unwrap_or_else(|| Uuid::new_v4().to_string());
        let conn = self.lock_conn()?;

        let parent_exists: Option<i64> = conn
            .query_row(
                "SELECT 1 FROM notes WHERE id = ?1",
                params![note_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Falha ao verificar nota vinculada: {e}"))?;
        if parent_exists.is_none() {
            return Err("Nota vinculada não encontrada.".to_string());
        }

        conn.execute(
            "INSERT INTO todos (id, note_id, text, done, due_date, pipedrive_activity_id)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL)
             ON CONFLICT(id) DO UPDATE SET
                note_id = excluded.note_id,
                text = excluded.text,
                done = excluded.done,
                due_date = excluded.due_date",
            params![todo_id, note_id, text, i64::from(input.done), due_date],
        )
        .map_err(|e| format!("Falha ao salvar tarefa no SQLite: {e}"))?;

        read_todo_by_id(&conn, &todo_id)?
            .ok_or_else(|| "Tarefa salva não foi encontrada após gravação.".to_string())
    }

    pub fn toggle_todo(&self, id: &str) -> Result<Todo, String> {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Err("Tarefa não encontrada.".to_string());
        }

        let conn = self.lock_conn()?;
        let affected = conn
            .execute(
                "UPDATE todos SET done = CASE WHEN done = 0 THEN 1 ELSE 0 END WHERE id = ?1",
                params![trimmed],
            )
            .map_err(|e| format!("Falha ao atualizar tarefa: {e}"))?;

        if affected == 0 {
            return Err("Tarefa não encontrada.".to_string());
        }

        read_todo_by_id(&conn, trimmed)?
            .ok_or_else(|| "Tarefa não encontrada.".to_string())
    }

    pub fn delete_todo(&self, id: &str) -> Result<bool, String> {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Ok(false);
        }
        let conn = self.lock_conn()?;
        let affected = conn
            .execute("DELETE FROM todos WHERE id = ?1", params![trimmed])
            .map_err(|e| format!("Falha ao excluir tarefa: {e}"))?;
        Ok(affected > 0)
    }

    pub fn set_todo_pipedrive_activity_id(
        &self,
        id: &str,
        pipedrive_activity_id: i64,
    ) -> Result<Todo, String> {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Err("Tarefa não encontrada.".to_string());
        }
        if pipedrive_activity_id <= 0 {
            return Err("ID da atividade no Pipedrive deve ser maior que zero.".to_string());
        }

        let conn = self.lock_conn()?;
        let affected = conn
            .execute(
                "UPDATE todos SET pipedrive_activity_id = ?1 WHERE id = ?2",
                params![pipedrive_activity_id, trimmed],
            )
            .map_err(|e| format!("Falha ao salvar pipedrive_activity_id na tarefa: {e}"))?;

        if affected == 0 {
            return Err("Tarefa não encontrada.".to_string());
        }

        read_todo_by_id(&conn, trimmed)?
            .ok_or_else(|| "Tarefa não encontrada.".to_string())
    }

    pub fn create_integration_log(
        &self,
        input: CreateIntegrationLogInput,
    ) -> Result<IntegrationLog, String> {
        let note_id = input.note_id.trim();
        if note_id.is_empty() {
            return Err("Todo log de integração precisa estar vinculado a uma nota.".to_string());
        }
        let payload_json = input.payload_json.trim();
        if payload_json.is_empty() {
            return Err("Payload JSON do log de integração é obrigatório.".to_string());
        }

        let conn = self.lock_conn()?;
        let note_exists: Option<String> = conn
            .query_row(
                "SELECT id FROM notes WHERE id = ?1",
                params![note_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| format!("Falha ao verificar nota vinculada: {e}"))?;
        if note_exists.is_none() {
            return Err("Nota vinculada não encontrada.".to_string());
        }

        let author_id = match normalize_optional_id(input.author_id) {
            Some(id) => id,
            None => read_active_profile(&conn)?.author_id,
        };
        let log_id = normalize_optional_id(input.id)
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let created_at = now_iso();

        conn.execute(
            "INSERT INTO integration_logs (
                id, note_id, author_id, target, status,
                payload_json, response_status, error_message, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                log_id,
                note_id,
                author_id,
                input.target.as_str(),
                input.status.as_str(),
                payload_json,
                input.response_status,
                input.error_message,
                created_at
            ],
        )
        .map_err(|e| format!("Falha ao gravar log de integração: {e}"))?;

        read_integration_log_by_id(&conn, &log_id)?
            .ok_or_else(|| "Log de integração salvo não foi encontrado após gravação.".to_string())
    }

    pub fn update_integration_log_status(
        &self,
        id: &str,
        status: IntegrationLogStatus,
        response_status: Option<i64>,
        error_message: Option<String>,
    ) -> Result<IntegrationLog, String> {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Err("Log de integração não encontrado.".to_string());
        }

        let conn = self.lock_conn()?;
        let affected = conn
            .execute(
                "UPDATE integration_logs
                 SET status = ?1, response_status = ?2, error_message = ?3
                 WHERE id = ?4",
                params![status.as_str(), response_status, error_message, trimmed],
            )
            .map_err(|e| format!("Falha ao atualizar log de integração: {e}"))?;

        if affected == 0 {
            return Err("Log de integração não encontrado.".to_string());
        }

        read_integration_log_by_id(&conn, trimmed)?
            .ok_or_else(|| "Log de integração não encontrado.".to_string())
    }

    pub fn get_integration_log(&self, id: &str) -> Result<Option<IntegrationLog>, String> {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Ok(None);
        }
        let conn = self.lock_conn()?;
        read_integration_log_by_id(&conn, trimmed)
    }

    pub fn list_integration_logs(
        &self,
        note_id: Option<&str>,
    ) -> Result<Vec<IntegrationLog>, String> {
        let conn = self.lock_conn()?;
        let filtered_note_id = note_id.map(str::trim).filter(|s| !s.is_empty());

        match filtered_note_id {
            Some(nid) => {
                let mut stmt = conn
                    .prepare(
                        "SELECT id, note_id, author_id, target, status,
                                payload_json, response_status, error_message, created_at
                         FROM integration_logs
                         WHERE note_id = ?1
                         ORDER BY created_at DESC, rowid DESC",
                    )
                    .map_err(|e| format!("Falha ao preparar listagem de logs: {e}"))?;
                let rows = stmt
                    .query_map(params![nid], row_to_integration_log)
                    .map_err(|e| format!("Falha ao listar logs de integração: {e}"))?;
                let mut logs = Vec::new();
                for row in rows {
                    logs.push(row.map_err(|e| format!("Falha ao ler log de integração: {e}"))?);
                }
                Ok(logs)
            }
            None => {
                let mut stmt = conn
                    .prepare(
                        "SELECT id, note_id, author_id, target, status,
                                payload_json, response_status, error_message, created_at
                         FROM integration_logs
                         ORDER BY created_at DESC, rowid DESC",
                    )
                    .map_err(|e| format!("Falha ao preparar listagem de logs: {e}"))?;
                let rows = stmt
                    .query_map([], row_to_integration_log)
                    .map_err(|e| format!("Falha ao listar logs de integração: {e}"))?;
                let mut logs = Vec::new();
                for row in rows {
                    logs.push(row.map_err(|e| format!("Falha ao ler log de integração: {e}"))?);
                }
                Ok(logs)
            }
        }
    }

    pub fn list_pending_sync_notes(&self) -> Result<Vec<Note>, String> {
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, author_id, author_name, title, content_md,
                        pipedrive_deal_id, pipedrive_person_id, created_at, updated_at, synced_at
                 FROM notes
                 WHERE synced_at IS NULL OR updated_at > synced_at
                 ORDER BY updated_at ASC, rowid ASC",
            )
            .map_err(|e| format!("Falha ao preparar notas pendentes de sync: {e}"))?;
        let rows = stmt
            .query_map([], row_to_note)
            .map_err(|e| format!("Falha ao listar notas pendentes de sync: {e}"))?;
        let mut notes = Vec::new();
        for row in rows {
            notes.push(row.map_err(|e| format!("Falha ao ler nota pendente de sync: {e}"))?);
        }
        Ok(notes)
    }

    pub fn mark_note_synced(&self, id: &str, synced_at: &str) -> Result<bool, String> {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Ok(false);
        }
        let conn = self.lock_conn()?;
        let affected = conn
            .execute(
                "UPDATE notes SET synced_at = ?1 WHERE id = ?2",
                params![synced_at, trimmed],
            )
            .map_err(|e| format!("Falha ao marcar nota sincronizada: {e}"))?;
        Ok(affected > 0)
    }

    pub fn list_pending_integration_logs(&self) -> Result<Vec<IntegrationLog>, String> {
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, note_id, author_id, target, status,
                        payload_json, response_status, error_message, created_at
                 FROM integration_logs
                 WHERE status IN ('pending', 'error')
                 ORDER BY created_at ASC, rowid ASC",
            )
            .map_err(|e| format!("Falha ao preparar logs pendentes: {e}"))?;
        let rows = stmt
            .query_map([], row_to_integration_log)
            .map_err(|e| format!("Falha ao listar logs pendentes: {e}"))?;
        let mut logs = Vec::new();
        for row in rows {
            logs.push(row.map_err(|e| format!("Falha ao ler log pendente: {e}"))?);
        }
        Ok(logs)
    }
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            author_id TEXT NOT NULL,
            author_name TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            content_md TEXT NOT NULL DEFAULT '',
            pipedrive_deal_id INTEGER,
            pipedrive_person_id INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            synced_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at DESC);

        CREATE TABLE IF NOT EXISTS todos (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
            due_date TEXT,
            pipedrive_activity_id INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_todos_note_id ON todos (note_id);

        CREATE TABLE IF NOT EXISTS integration_logs (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            author_id TEXT NOT NULL,
            target TEXT NOT NULL CHECK (target IN ('pipedrive', 'n8n')),
            status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'error')),
            payload_json TEXT NOT NULL,
            response_status INTEGER,
            error_message TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_integration_logs_note_id ON integration_logs (note_id);

        CREATE TABLE IF NOT EXISTS cs_profile (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            author_id TEXT NOT NULL,
            author_name TEXT NOT NULL,
            token TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS dock_appearance (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            theme TEXT NOT NULL CHECK (theme IN ('dark', 'light', 'high-contrast')),
            accent TEXT NOT NULL CHECK (accent IN ('violet', 'blue', 'emerald', 'amber')),
            expanded_opacity INTEGER NOT NULL CHECK (expanded_opacity BETWEEN 40 AND 100),
            collapsed_opacity INTEGER NOT NULL CHECK (collapsed_opacity BETWEEN 40 AND 100),
            panel_size TEXT NOT NULL CHECK (panel_size IN ('compact', 'default', 'wide')),
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS integration_settings (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            pipedrive_api_base TEXT NOT NULL DEFAULT '',
            pipedrive_api_token TEXT NOT NULL DEFAULT '',
            n8n_webhook_url TEXT NOT NULL DEFAULT '',
            n8n_webhook_secret TEXT NOT NULL DEFAULT '',
            supabase_url TEXT NOT NULL DEFAULT '',
            supabase_anon_key TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        );",
    )
    .map_err(|e| format!("Falha ao inicializar schema SQLite: {e}"))
}

fn read_stored_integration_config(conn: &Connection) -> Result<StoredIntegrationConfig, String> {
    let row = conn
        .query_row(
            "SELECT pipedrive_api_base, pipedrive_api_token,
                    n8n_webhook_url, n8n_webhook_secret,
                    supabase_url, supabase_anon_key
             FROM integration_settings
             WHERE singleton = 1",
            [],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                ))
            },
        )
        .optional()
        .map_err(|e| format!("Falha ao ler configurações de integrações: {e}"))?;

    match row {
        Some((
            pipedrive_api_base,
            pipedrive_api_token,
            n8n_webhook_url,
            n8n_webhook_secret,
            supabase_url,
            supabase_anon_key,
        )) => Ok(StoredIntegrationConfig {
            pipedrive_api_base: normalize_non_empty(pipedrive_api_base),
            pipedrive_api_token: normalize_non_empty(pipedrive_api_token),
            n8n_webhook_url: normalize_non_empty(n8n_webhook_url),
            n8n_webhook_secret: normalize_non_empty(n8n_webhook_secret),
            supabase_url: normalize_non_empty(supabase_url),
            supabase_anon_key: normalize_non_empty(supabase_anon_key),
        }),
        None => Ok(StoredIntegrationConfig::default()),
    }
}

fn normalize_non_empty(raw: String) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn normalize_optional_url(raw: &str, label: &str) -> Result<Option<String>, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.chars().any(char::is_whitespace)
        || !(trimmed.starts_with("https://") || trimmed.starts_with("http://"))
    {
        return Err(format!("{label} inválida. Use uma URL http:// ou https://."));
    }
    Ok(Some(trimmed.trim_end_matches('/').to_string()))
}

fn resolve_next_secret(
    clear: bool,
    incoming: Option<&str>,
    existing: Option<String>,
) -> Option<String> {
    if clear {
        return None;
    }
    if let Some(raw) = incoming {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    existing
}

fn read_dock_appearance(conn: &Connection) -> Result<DockAppearance, String> {
    let row = conn
        .query_row(
            "SELECT theme, accent, expanded_opacity, collapsed_opacity, panel_size
             FROM dock_appearance
             WHERE singleton = 1",
            [],
            |r| {
                let theme: String = r.get(0)?;
                let accent: String = r.get(1)?;
                let expanded_opacity: i64 = r.get(2)?;
                let collapsed_opacity: i64 = r.get(3)?;
                let panel_size: String = r.get(4)?;
                Ok((
                    theme,
                    accent,
                    expanded_opacity,
                    collapsed_opacity,
                    panel_size,
                ))
            },
        )
        .optional()
        .map_err(|e| format!("Falha ao ler aparência do dock: {e}"))?;

    match row {
        Some((theme, accent, expanded_opacity, collapsed_opacity, panel_size)) => {
            Ok(DockAppearance {
                theme: DockTheme::from_db(&theme)?,
                accent: DockAccent::from_db(&accent)?,
                expanded_opacity: clamp_opacity(expanded_opacity),
                collapsed_opacity: clamp_opacity(collapsed_opacity),
                panel_size: DockPanelSize::from_db(&panel_size)?,
            })
        }
        None => Ok(DockAppearance::default()),
    }
}

fn read_active_profile(conn: &Connection) -> Result<ActiveProfile, String> {
    let row = conn
        .query_row(
            "SELECT author_id, author_name, token FROM cs_profile WHERE singleton = 1",
            [],
            |r| {
                let author_id: String = r.get(0)?;
                let author_name: String = r.get(1)?;
                let token: String = r.get(2)?;
                Ok((author_id, author_name, token))
            },
        )
        .optional()
        .map_err(|e| format!("Falha ao ler perfil CS: {e}"))?;

    match row {
        Some((author_id, author_name, token)) => Ok(ActiveProfile {
            author_id,
            author_name,
            has_token: !token.trim().is_empty(),
            is_configured: true,
        }),
        None => Ok(ActiveProfile {
            author_id: DEFAULT_AUTHOR_ID.to_string(),
            author_name: DEFAULT_AUTHOR_NAME.to_string(),
            has_token: false,
            is_configured: false,
        }),
    }
}

fn read_note_by_id(conn: &Connection, id: &str) -> Result<Option<Note>, String> {
    conn.query_row(
        "SELECT id, author_id, author_name, title, content_md,
                pipedrive_deal_id, pipedrive_person_id, created_at, updated_at, synced_at
         FROM notes
         WHERE id = ?1",
        params![id],
        row_to_note,
    )
    .optional()
    .map_err(|e| format!("Falha ao buscar nota: {e}"))
}

fn read_todo_by_id(conn: &Connection, id: &str) -> Result<Option<Todo>, String> {
    conn.query_row(
        "SELECT id, note_id, text, done, due_date, pipedrive_activity_id
         FROM todos
         WHERE id = ?1",
        params![id],
        row_to_todo,
    )
    .optional()
    .map_err(|e| format!("Falha ao buscar tarefa: {e}"))
}

fn row_to_note(row: &Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        author_id: row.get(1)?,
        author_name: row.get(2)?,
        title: row.get(3)?,
        content_md: row.get(4)?,
        pipedrive_deal_id: row.get(5)?,
        pipedrive_person_id: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        synced_at: row.get(9)?,
    })
}

fn row_to_todo(row: &Row<'_>) -> rusqlite::Result<Todo> {
    let done_int: i64 = row.get(3)?;
    Ok(Todo {
        id: row.get(0)?,
        note_id: row.get(1)?,
        text: row.get(2)?,
        done: done_int != 0,
        due_date: row.get(4)?,
        pipedrive_activity_id: row.get(5)?,
    })
}

fn read_integration_log_by_id(
    conn: &Connection,
    id: &str,
) -> Result<Option<IntegrationLog>, String> {
    conn.query_row(
        "SELECT id, note_id, author_id, target, status,
                payload_json, response_status, error_message, created_at
         FROM integration_logs
         WHERE id = ?1",
        params![id],
        row_to_integration_log,
    )
    .optional()
    .map_err(|e| format!("Falha ao buscar log de integração: {e}"))
}

fn row_to_integration_log(row: &Row<'_>) -> rusqlite::Result<IntegrationLog> {
    let target_raw: String = row.get(3)?;
    let status_raw: String = row.get(4)?;
    let target = IntegrationTarget::from_db(&target_raw).map_err(|msg| {
        rusqlite::Error::FromSqlConversionFailure(
            3,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, msg)),
        )
    })?;
    let status = IntegrationLogStatus::from_db(&status_raw).map_err(|msg| {
        rusqlite::Error::FromSqlConversionFailure(
            4,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, msg)),
        )
    })?;

    Ok(IntegrationLog {
        id: row.get(0)?,
        note_id: row.get(1)?,
        author_id: row.get(2)?,
        target,
        status,
        payload_json: row.get(5)?,
        response_status: row.get(6)?,
        error_message: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn normalize_optional_id(id: Option<String>) -> Option<String> {
    id.map(|raw| raw.trim().to_string())
        .filter(|trimmed| !trimmed.is_empty())
}

fn normalize_due_date(due_date: Option<String>) -> Result<Option<String>, String> {
    let Some(raw) = due_date else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let is_iso_date = trimmed.len() == 10
        && trimmed.as_bytes()[4] == b'-'
        && trimmed.as_bytes()[7] == b'-'
        && NaiveDate::parse_from_str(trimmed, "%Y-%m-%d").is_ok();
    let is_rfc3339 = DateTime::parse_from_rfc3339(trimmed).is_ok();

    if is_iso_date || is_rfc3339 {
        Ok(Some(trimmed.to_string()))
    } else {
        Err("Prazo inválido. Use o formato YYYY-MM-DD.".to_string())
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Micros, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct TempDbCleanup(PathBuf);

    impl Drop for TempDbCleanup {
        fn drop(&mut self) {
            let base = self.0.to_string_lossy().to_string();
            let _ = fs::remove_file(&self.0);
            let _ = fs::remove_file(format!("{base}-wal"));
            let _ = fs::remove_file(format!("{base}-shm"));
            if let Some(dir) = self.0.parent() {
                let _ = fs::remove_dir_all(dir);
            }
        }
    }

    fn temp_db_path(name: &str) -> (PathBuf, TempDbCleanup) {
        let dir = std::env::temp_dir().join(format!("quicknote-crm-{name}-{}", Uuid::new_v4()));
        let db_path = dir.join("quicknote.db");
        let guard = TempDbCleanup(db_path.clone());
        (db_path, guard)
    }

    #[test]
    fn initializes_schema_and_enforces_foreign_keys() {
        let db = Database::open_in_memory().expect("open in-memory db");
        let conn = db.lock_conn().expect("lock connection");

        let fk_enabled: i64 = conn
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .expect("read foreign_keys pragma");
        assert_eq!(fk_enabled, 1);

        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();

        for required in ["cs_profile", "integration_logs", "notes", "todos"] {
            assert!(tables.contains(&required.to_string()), "missing table {required}");
        }
    }

    #[test]
    fn persists_profile_notes_and_todos_across_disk_reopen() {
        let (path, _guard) = temp_db_path("persist");

        let note_id;
        let todo_id;
        {
            let db = Database::open(&path).expect("open disk db");
            let profile = db
                .set_active_profile(SetActiveProfileInput {
                    author_id: "cs-ana".to_string(),
                    author_name: "Ana Paula".to_string(),
                    token: Some("secret-cs-token".to_string()),
                    clear_token: false,
                })
                .expect("save profile");
            assert!(profile.has_token);
            assert!(profile.is_configured);

            let note = db
                .save_note_draft(SaveNoteDraftInput {
                    id: None,
                    title: "Acme Onboarding".to_string(),
                    content_md: "## Pontos\n- Integração".to_string(),
                    pipedrive_deal_id: Some(42),
                    pipedrive_person_id: None,
                })
                .expect("save note");
            note_id = note.id.clone();

            let todo = db
                .upsert_todo(UpsertTodoInput {
                    id: None,
                    note_id: note.id,
                    text: "Enviar proposta".to_string(),
                    done: false,
                    due_date: Some("2026-11-25".to_string()),
                })
                .expect("save todo");
            todo_id = todo.id;
        }

        let reopened = Database::open(&path).expect("reopen disk db");
        let profile = reopened.get_active_profile().expect("read profile");
        assert_eq!(profile.author_id, "cs-ana");
        assert_eq!(profile.author_name, "Ana Paula");
        assert!(profile.has_token);
        assert!(profile.is_configured);

        let note = reopened
            .get_note(&note_id)
            .expect("get note")
            .expect("note exists");
        assert_eq!(note.title, "Acme Onboarding");
        assert_eq!(note.content_md, "## Pontos\n- Integração");
        assert_eq!(note.author_id, "cs-ana");
        assert_eq!(note.pipedrive_deal_id, Some(42));

        let todos = reopened.list_todos(Some(&note_id)).expect("list todos");
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].id, todo_id);
        assert_eq!(todos[0].text, "Enviar proposta");
        assert!(!todos[0].done);
        assert_eq!(todos[0].due_date.as_deref(), Some("2026-11-25"));
    }

    #[test]
    fn updating_note_preserves_created_at_and_linked_todos() {
        let db = Database::open_in_memory().expect("open db");

        let created = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("note-fixed".to_string()),
                title: "Inicial".to_string(),
                content_md: "V1".to_string(),
                pipedrive_deal_id: Some(10),
                pipedrive_person_id: None,
            })
            .expect("create note");

        let todo = db
            .upsert_todo(UpsertTodoInput {
                id: None,
                note_id: created.id.clone(),
                text: "Follow-up".to_string(),
                done: false,
                due_date: None,
            })
            .expect("create todo");

        std::thread::sleep(std::time::Duration::from_millis(2));

        let updated = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some(created.id.clone()),
                title: "Atualizado".to_string(),
                content_md: "V2".to_string(),
                pipedrive_deal_id: None,
                pipedrive_person_id: Some(99),
            })
            .expect("update note");

        assert_eq!(updated.created_at, created.created_at);
        assert_ne!(updated.updated_at, created.updated_at);
        assert_eq!(updated.pipedrive_deal_id, Some(10));
        assert_eq!(updated.pipedrive_person_id, Some(99));

        let remaining_todos = db.list_todos(Some(&created.id)).expect("list todos");
        assert_eq!(remaining_todos.len(), 1);
        assert_eq!(remaining_todos[0].id, todo.id);
    }

    #[test]
    fn profile_keeps_token_write_only_and_supports_fallback_and_clear() {
        let db = Database::open_in_memory().expect("open db");

        let fallback = db.get_active_profile().expect("fallback profile");
        assert_eq!(fallback.author_id, DEFAULT_AUTHOR_ID);
        assert_eq!(fallback.author_name, DEFAULT_AUTHOR_NAME);
        assert!(!fallback.has_token);
        assert!(!fallback.is_configured);

        assert!(db
            .set_active_profile(SetActiveProfileInput {
                author_id: "   ".to_string(),
                author_name: "Ana".to_string(),
                token: None,
                clear_token: false,
            })
            .is_err());

        let saved = db
            .set_active_profile(SetActiveProfileInput {
                author_id: " cs-01 ".to_string(),
                author_name: " Ana ".to_string(),
                token: Some(" super-secret ".to_string()),
                clear_token: false,
            })
            .expect("set profile");
        assert_eq!(saved.author_id, "cs-01");
        assert_eq!(saved.author_name, "Ana");
        assert!(saved.has_token);
        assert!(saved.is_configured);

        let json = serde_json::to_value(&saved).expect("serialize profile");
        assert!(json.get("token").is_none(), "token must never serialize to IPC");

        let preserved = db
            .set_active_profile(SetActiveProfileInput {
                author_id: "cs-01".to_string(),
                author_name: "Ana Maria".to_string(),
                token: None,
                clear_token: false,
            })
            .expect("update name without token");
        assert!(preserved.has_token);

        let cleared = db
            .set_active_profile(SetActiveProfileInput {
                author_id: "cs-01".to_string(),
                author_name: "Ana Maria".to_string(),
                token: Some("ignored-when-clearing".to_string()),
                clear_token: true,
            })
            .expect("clear token");
        assert!(!cleared.has_token);
        assert!(cleared.is_configured);
    }

    #[test]
    fn promotes_fallback_author_only_for_unclaimed_notes() {
        let db = Database::open_in_memory().expect("open db");

        let anon = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("anon-note".to_string()),
                title: "Rascunho".to_string(),
                content_md: "Texto".to_string(),
                pipedrive_deal_id: None,
                pipedrive_person_id: None,
            })
            .expect("save anon note");
        assert_eq!(anon.author_id, DEFAULT_AUTHOR_ID);

        db.set_active_profile(SetActiveProfileInput {
            author_id: "cs-ana".to_string(),
            author_name: "Ana".to_string(),
            token: None,
            clear_token: false,
        })
        .expect("configure ana");

        let promoted = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("anon-note".to_string()),
                title: "Rascunho editado".to_string(),
                content_md: "Texto".to_string(),
                pipedrive_deal_id: None,
                pipedrive_person_id: None,
            })
            .expect("promote note author");
        assert_eq!(promoted.author_id, "cs-ana");
        assert_eq!(promoted.author_name, "Ana");

        db.set_active_profile(SetActiveProfileInput {
            author_id: "cs-bruno".to_string(),
            author_name: "Bruno".to_string(),
            token: None,
            clear_token: false,
        })
        .expect("switch to bruno");

        let kept = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("anon-note".to_string()),
                title: "Editado por Bruno".to_string(),
                content_md: "Texto".to_string(),
                pipedrive_deal_id: None,
                pipedrive_person_id: None,
            })
            .expect("preserve named author");
        assert_eq!(kept.author_id, "cs-ana");
        assert_eq!(kept.author_name, "Ana");
    }

    #[test]
    fn manages_todos_validations_toggles_filters_and_cascade_delete() {
        let db = Database::open_in_memory().expect("open db");

        let note1 = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("n1".to_string()),
                title: "Nota 1".to_string(),
                content_md: String::new(),
                pipedrive_deal_id: None,
                pipedrive_person_id: None,
            })
            .unwrap();
        let note2 = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("n2".to_string()),
                title: "Nota 2".to_string(),
                content_md: String::new(),
                pipedrive_deal_id: None,
                pipedrive_person_id: None,
            })
            .unwrap();

        assert!(db
            .upsert_todo(UpsertTodoInput {
                id: None,
                note_id: note1.id.clone(),
                text: "   ".to_string(),
                done: false,
                due_date: None,
            })
            .is_err());

        assert!(db
            .upsert_todo(UpsertTodoInput {
                id: None,
                note_id: note1.id.clone(),
                text: "Com data ruim".to_string(),
                done: false,
                due_date: Some("25/11/2026".to_string()),
            })
            .is_err());

        assert!(db
            .upsert_todo(UpsertTodoInput {
                id: None,
                note_id: "nao-existe".to_string(),
                text: "Sem pai".to_string(),
                done: false,
                due_date: None,
            })
            .is_err());

        let t1 = db
            .upsert_todo(UpsertTodoInput {
                id: None,
                note_id: note1.id.clone(),
                text: "Tarefa A".to_string(),
                done: false,
                due_date: Some("2026-11-30".to_string()),
            })
            .unwrap();
        let t2 = db
            .upsert_todo(UpsertTodoInput {
                id: None,
                note_id: note2.id.clone(),
                text: "Tarefa B".to_string(),
                done: false,
                due_date: None,
            })
            .unwrap();

        assert_eq!(db.list_todos(Some(&note1.id)).unwrap().len(), 1);
        assert_eq!(db.list_todos(None).unwrap().len(), 2);

        let toggled = db.toggle_todo(&t1.id).unwrap();
        assert!(toggled.done);
        let untoggled = db.toggle_todo(&t1.id).unwrap();
        assert!(!untoggled.done);
        assert!(db.toggle_todo("missing-id").is_err());

        assert!(db.delete_todo(&t2.id).unwrap());
        assert!(!db.delete_todo(&t2.id).unwrap());

        assert!(db.delete_note(&note1.id).unwrap());
        assert!(!db.delete_note(&note1.id).unwrap());
        assert!(db.get_note(&note1.id).unwrap().is_none());
        assert!(db.list_todos(None).unwrap().is_empty());
    }

    #[test]
    fn enforces_check_constraints_on_integration_logs() {
        let db = Database::open_in_memory().expect("open db");
        let note = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("n-log".to_string()),
                title: "Log".to_string(),
                content_md: String::new(),
                pipedrive_deal_id: None,
                pipedrive_person_id: None,
            })
            .unwrap();

        let conn = db.lock_conn().unwrap();
        let bad_target = conn.execute(
            "INSERT INTO integration_logs (id, note_id, author_id, target, status, payload_json, created_at)
             VALUES ('l1', ?1, 'local-cs', 'slack', 'pending', '{}', '2026-11-19T12:00:00Z')",
            params![note.id],
        );
        assert!(bad_target.is_err());

        let bad_status = conn.execute(
            "INSERT INTO integration_logs (id, note_id, author_id, target, status, payload_json, created_at)
             VALUES ('l2', ?1, 'local-cs', 'pipedrive', 'queued', '{}', '2026-11-19T12:00:00Z')",
            params![note.id],
        );
        assert!(bad_status.is_err());

        let valid = conn.execute(
            "INSERT INTO integration_logs (id, note_id, author_id, target, status, payload_json, created_at)
             VALUES ('l3', ?1, 'local-cs', 'n8n', 'sent', '{}', '2026-11-19T12:00:00Z')",
            params![note.id],
        );
        assert!(valid.is_ok());
    }

    #[test]
    fn creates_updates_queries_and_cascades_integration_logs() {
        let db = Database::open_in_memory().expect("open db");
        db.set_active_profile(SetActiveProfileInput {
            author_id: "cs-ana".to_string(),
            author_name: "Ana".to_string(),
            token: None,
            clear_token: false,
        })
        .unwrap();

        let note_a = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("note-a".to_string()),
                title: "Nota A".to_string(),
                content_md: "Corpo A".to_string(),
                pipedrive_deal_id: Some(42),
                pipedrive_person_id: None,
            })
            .unwrap();
        let note_b = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("note-b".to_string()),
                title: "Nota B".to_string(),
                content_md: "Corpo B".to_string(),
                pipedrive_deal_id: None,
                pipedrive_person_id: None,
            })
            .unwrap();

        let missing_note_err = db
            .create_integration_log(CreateIntegrationLogInput {
                id: None,
                note_id: "nao-existe".to_string(),
                author_id: None,
                target: IntegrationTarget::Pipedrive,
                status: IntegrationLogStatus::Pending,
                payload_json: "{}".to_string(),
                response_status: None,
                error_message: None,
            })
            .unwrap_err();
        assert!(missing_note_err.contains("Nota vinculada"));

        let created = db
            .create_integration_log(CreateIntegrationLogInput {
                id: None,
                note_id: note_a.id.clone(),
                author_id: None,
                target: IntegrationTarget::Pipedrive,
                status: IntegrationLogStatus::Pending,
                payload_json: r#"{"deal_id":42}"#.to_string(),
                response_status: None,
                error_message: None,
            })
            .unwrap();
        assert_eq!(created.author_id, "cs-ana");
        assert_eq!(created.target, IntegrationTarget::Pipedrive);
        assert_eq!(created.status, IntegrationLogStatus::Pending);

        let updated = db
            .update_integration_log_status(
                &created.id,
                IntegrationLogStatus::Sent,
                Some(201),
                None,
            )
            .unwrap();
        assert_eq!(updated.status, IntegrationLogStatus::Sent);
        assert_eq!(updated.response_status, Some(201));

        let fetched = db.get_integration_log(&created.id).unwrap().unwrap();
        assert_eq!(fetched, updated);

        let failed = db
            .create_integration_log(CreateIntegrationLogInput {
                id: Some("log-err".to_string()),
                note_id: note_b.id.clone(),
                author_id: Some("cs-custom".to_string()),
                target: IntegrationTarget::N8n,
                status: IntegrationLogStatus::Error,
                payload_json: r#"{"source":"quicknote-crm"}"#.to_string(),
                response_status: Some(502),
                error_message: Some("Bad Gateway".to_string()),
            })
            .unwrap();
        assert_eq!(failed.author_id, "cs-custom");

        let all_logs = db.list_integration_logs(None).unwrap();
        assert_eq!(all_logs.len(), 2);

        let note_a_logs = db.list_integration_logs(Some(&note_a.id)).unwrap();
        assert_eq!(note_a_logs.len(), 1);
        assert_eq!(note_a_logs[0].id, created.id);

        let pending_logs = db.list_pending_integration_logs().unwrap();
        assert_eq!(pending_logs.len(), 1);
        assert_eq!(pending_logs[0].id, "log-err");

        assert!(db.delete_note(&note_b.id).unwrap());
        assert!(db.get_integration_log("log-err").unwrap().is_none());
        assert!(db.list_pending_integration_logs().unwrap().is_empty());
    }

    #[test]
    fn lists_pending_sync_notes_when_unsynced_or_modified_after_sync() {
        let db = Database::open_in_memory().expect("open db");

        let note_1 = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("sync-1".to_string()),
                title: "Primeira".to_string(),
                content_md: "v1".to_string(),
                pipedrive_deal_id: None,
                pipedrive_person_id: None,
            })
            .unwrap();
        let note_2 = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("sync-2".to_string()),
                title: "Segunda".to_string(),
                content_md: "v1".to_string(),
                pipedrive_deal_id: None,
                pipedrive_person_id: None,
            })
            .unwrap();

        let pending_initial = db.list_pending_sync_notes().unwrap();
        assert_eq!(pending_initial.len(), 2);

        assert!(db.mark_note_synced(&note_1.id, &note_1.updated_at).unwrap());
        let pending_after_one = db.list_pending_sync_notes().unwrap();
        assert_eq!(pending_after_one.len(), 1);
        assert_eq!(pending_after_one[0].id, note_2.id);

        let _ = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some(note_1.id.clone()),
                title: "Primeira editada".to_string(),
                content_md: "v2".to_string(),
                pipedrive_deal_id: None,
                pipedrive_person_id: None,
            })
            .unwrap();

        let pending_after_edit = db.list_pending_sync_notes().unwrap();
        assert_eq!(pending_after_edit.len(), 2);
    }

    #[test]
    fn persists_pipedrive_activity_id_on_todo() {
        let db = Database::open_in_memory().unwrap();
        let note = db
            .save_note_draft(SaveNoteDraftInput {
                id: Some("n-act".to_string()),
                title: "Call".to_string(),
                content_md: "Resumo".to_string(),
                pipedrive_deal_id: Some(42),
                pipedrive_person_id: None,
            })
            .unwrap();

        let todo = db
            .upsert_todo(UpsertTodoInput {
                id: Some("t-act".to_string()),
                note_id: note.id,
                text: "Enviar proposta".to_string(),
                done: false,
                due_date: Some("2026-11-25".to_string()),
            })
            .unwrap();
        assert_eq!(todo.pipedrive_activity_id, None);

        let updated = db.set_todo_pipedrive_activity_id(&todo.id, 9876).unwrap();
        assert_eq!(updated.pipedrive_activity_id, Some(9876));

        assert!(db.set_todo_pipedrive_activity_id(&todo.id, 0).is_err());
        assert!(db.set_todo_pipedrive_activity_id("inexistente", 9876).is_err());
    }

    #[test]
    fn dock_appearance_persists_partial_updates_clamps_opacity_and_resets() {
        let dir = std::env::temp_dir().join(format!("quicknote-appearance-{}", Uuid::new_v4()));
        let db_file = dir.join("quicknote.db");

        {
            let db = Database::open(&db_file).expect("open db");
            assert_eq!(db.get_dock_appearance().unwrap(), DockAppearance::default());

            let updated = db
                .set_dock_appearance(UpdateDockAppearanceInput {
                    theme: Some(DockTheme::Light),
                    accent: Some(DockAccent::Emerald),
                    expanded_opacity: Some(150),
                    collapsed_opacity: Some(15),
                    panel_size: Some(DockPanelSize::Wide),
                })
                .unwrap();

            assert_eq!(updated.theme, DockTheme::Light);
            assert_eq!(updated.accent, DockAccent::Emerald);
            assert_eq!(updated.expanded_opacity, 100);
            assert_eq!(updated.collapsed_opacity, 40);
            assert_eq!(updated.panel_size, DockPanelSize::Wide);

            let partial = db
                .set_dock_appearance(UpdateDockAppearanceInput {
                    theme: Some(DockTheme::HighContrast),
                    ..Default::default()
                })
                .unwrap();
            assert_eq!(partial.theme, DockTheme::HighContrast);
            assert_eq!(partial.accent, DockAccent::Emerald);
            assert_eq!(partial.collapsed_opacity, 40);
            assert_eq!(partial.panel_size, DockPanelSize::Wide);
        }

        {
            let reopened = Database::open(&db_file).expect("reopen db");
            let loaded = reopened.get_dock_appearance().unwrap();
            assert_eq!(loaded.theme, DockTheme::HighContrast);
            assert_eq!(loaded.accent, DockAccent::Emerald);
            assert_eq!(loaded.expanded_opacity, 100);
            assert_eq!(loaded.collapsed_opacity, 40);
            assert_eq!(loaded.panel_size, DockPanelSize::Wide);

            let reset = reopened.reset_dock_appearance().unwrap();
            assert_eq!(reset, DockAppearance::default());
            assert_eq!(
                reopened.get_dock_appearance().unwrap(),
                DockAppearance::default()
            );
        }

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn integration_settings_write_only_persist_and_clear_across_reopen() {
        let dir = std::env::temp_dir().join(format!("quicknote-crm-int-{}", Uuid::new_v4()));
        let db_file: PathBuf = dir.join("quicknote.db");

        {
            let db = Database::open(&db_file).expect("open db");
            assert_eq!(
                db.get_integration_settings().unwrap(),
                IntegrationSettings::default()
            );

            let invalid_url = db.set_integration_settings(SetIntegrationSettingsInput {
                pipedrive_api_base: Some("ftp://invalida".to_string()),
                ..Default::default()
            });
            assert!(invalid_url.unwrap_err().contains("URL base do Pipedrive"));

            let saved = db
                .set_integration_settings(SetIntegrationSettingsInput {
                    pipedrive_api_base: Some(" https://api.pipedrive.com/v1/ ".to_string()),
                    pipedrive_api_token: Some("secret-pd-123".to_string()),
                    n8n_webhook_url: Some("https://n8n.example.com/webhook/cs".to_string()),
                    n8n_webhook_secret: Some("secret-n8n-456".to_string()),
                    supabase_url: Some("https://proj.supabase.co/".to_string()),
                    supabase_anon_key: Some("secret-supa-789".to_string()),
                    ..Default::default()
                })
                .unwrap();

            assert_eq!(saved.pipedrive_api_base, "https://api.pipedrive.com/v1");
            assert!(saved.has_pipedrive_token);
            assert_eq!(saved.n8n_webhook_url, "https://n8n.example.com/webhook/cs");
            assert!(saved.has_n8n_secret);
            assert_eq!(saved.supabase_url, "https://proj.supabase.co");
            assert!(saved.has_supabase_key);

            let serialized = serde_json::to_string(&saved).unwrap();
            assert!(!serialized.contains("secret-pd-123"));
            assert!(!serialized.contains("secret-n8n-456"));
            assert!(!serialized.contains("secret-supa-789"));

            let preserved = db
                .set_integration_settings(SetIntegrationSettingsInput {
                    n8n_webhook_url: Some("https://n8n.example.com/webhook/v2".to_string()),
                    pipedrive_api_token: Some("   ".to_string()),
                    ..Default::default()
                })
                .unwrap();
            assert_eq!(preserved.pipedrive_api_base, "https://api.pipedrive.com/v1");
            assert!(preserved.has_pipedrive_token);
            assert_eq!(preserved.n8n_webhook_url, "https://n8n.example.com/webhook/v2");
            assert!(preserved.has_n8n_secret);
            assert!(preserved.has_supabase_key);

            let cleared = db
                .set_integration_settings(SetIntegrationSettingsInput {
                    clear_n8n_secret: true,
                    ..Default::default()
                })
                .unwrap();
            assert!(cleared.has_pipedrive_token);
            assert!(!cleared.has_n8n_secret);
            assert!(cleared.has_supabase_key);
        }

        {
            let reopened = Database::open(&db_file).expect("reopen db");
            let loaded = reopened.get_integration_settings().unwrap();
            assert_eq!(loaded.pipedrive_api_base, "https://api.pipedrive.com/v1");
            assert!(loaded.has_pipedrive_token);
            assert_eq!(loaded.n8n_webhook_url, "https://n8n.example.com/webhook/v2");
            assert!(!loaded.has_n8n_secret);
            assert_eq!(loaded.supabase_url, "https://proj.supabase.co");
            assert!(loaded.has_supabase_key);

            let stored = reopened.load_integration_config().unwrap();
            assert_eq!(stored.pipedrive_api_token.as_deref(), Some("secret-pd-123"));
            assert_eq!(stored.n8n_webhook_secret, None);
            assert_eq!(stored.supabase_anon_key.as_deref(), Some("secret-supa-789"));

            let debug_str = format!("{stored:?}");
            assert!(!debug_str.contains("secret-pd-123"));
            assert!(!debug_str.contains("secret-supa-789"));
            assert!(debug_str.contains("[REDACTED]"));
        }

        let _ = fs::remove_dir_all(&dir);
    }
}
