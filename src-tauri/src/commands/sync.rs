use tauri::State;
use rusqlite::params;
use crate::db::DbConn;
use crate::error::{AppError, api_response};
use crate::db::now_iso;
use crate::utils::{id::generate_id, audit_logger::log_audit};
use serde::Serialize;

#[derive(Serialize)]
pub struct SyncStatus {
    pub configured: bool,
    pub last_sync: Option<String>,
    pub supabase_url: Option<String>,
    pub supabase_key: Option<String>,
}

#[tauri::command]
pub fn sync_status(db: State<'_, DbConn>) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let supabase_url: Option<String> = conn
        .query_row(
            "SELECT valeur FROM ConfigSysteme WHERE cle = 'SUPABASE_URL'",
            [],
            |row| row.get(0),
        )
        .ok();

    let supabase_key: Option<String> = conn
        .query_row(
            "SELECT valeur FROM ConfigSysteme WHERE cle = 'SUPABASE_KEY'",
            [],
            |row| row.get(0),
        )
        .ok();

    let last_sync: Option<String> = conn
        .query_row(
            "SELECT valeur FROM ConfigSysteme WHERE cle = 'LAST_SYNC'",
            [],
            |row| row.get(0),
        )
        .ok();

    drop(conn);

    let configured = supabase_url.is_some() && supabase_url.as_ref().map_or(false, |u| !u.is_empty())
        && supabase_key.is_some() && supabase_key.as_ref().map_or(false, |k| !k.is_empty());

    let status = SyncStatus {
        configured,
        last_sync,
        supabase_url,
        supabase_key,
    };

    Ok(api_response(Ok(status)))
}

#[tauri::command]
pub fn sync_push(db: State<'_, DbConn>) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;
    let summary = crate::sync::run_bidirectional_sync(&conn)?;
    Ok(api_response(Ok(summary)))
}

#[tauri::command]
pub fn sync_pull(db: State<'_, DbConn>) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;
    let summary = crate::sync::run_bidirectional_sync(&conn)?;
    Ok(api_response(Ok(summary)))
}

#[tauri::command]
pub fn save_sync_config(
    db: State<'_, DbConn>,
    supabase_url: String,
    supabase_key: String,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let now = now_iso();

    // UPSERT SUPABASE_URL
    conn.execute(
        "INSERT INTO ConfigSysteme (id, cle, valeur, created_at, updated_at) \
         VALUES (?1, 'SUPABASE_URL', ?2, ?3, ?3) \
         ON CONFLICT(cle) DO UPDATE SET valeur = ?2, updated_at = ?3",
        params![generate_id(), supabase_url, now],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;

    // UPSERT SUPABASE_KEY
    conn.execute(
        "INSERT INTO ConfigSysteme (id, cle, valeur, created_at, updated_at) \
         VALUES (?1, 'SUPABASE_KEY', ?2, ?3, ?3) \
         ON CONFLICT(cle) DO UPDATE SET valeur = ?2, updated_at = ?3",
        params![generate_id(), supabase_key, now],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;

    drop(conn);

    log_audit(
        &db,
        None,
        "UPDATE",
        "ConfigSysteme",
        None,
        Some("Updated sync configuration"), // Corrigé : Option<&str>
    );

    Ok(api_response(Ok("Sync configuration saved successfully")))
}