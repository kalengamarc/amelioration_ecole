use tauri::State;
use rusqlite::params;
use crate::db::DbConn;
use crate::error::{AppError, api_response};
use crate::db::now_iso;
use crate::utils::{id::generate_id, audit_logger::log_audit};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub configured: bool,
    pub last_sync: Option<String>,
    pub supabase_url: Option<String>,
    pub supabase_key: Option<String>,
}

#[tauri::command]
pub fn validate_sync_ready(db: State<'_, DbConn>) -> Result<serde_json::Value, AppError> {
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

    let configured = supabase_url.as_ref().map_or(false, |u| !u.trim().is_empty())
        && supabase_key.as_ref().map_or(false, |k| !k.trim().is_empty());

    let required_tables = [
        "Etablissement", "AnneeScolaire", "Classe", "User", "Eleve", "Tuteur",
        "TuteurEleve", "EleveClasse", "FraisScolaire", "FraisClasse", "Echeance",
        "Paiement", "AnnulationRecu", "Depense", "ParametreEtablissement",
        "AuditLog", "ConfigSysteme", "SyncLog",
    ];

    let mut stats: Vec<serde_json::Value> = Vec::new();
    let mut issues: Vec<String> = Vec::new();
    let mut total_rows = 0usize;

    for table in required_tables {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table],
                |row| row.get::<_, i64>(0).map(|count| count > 0),
            )
            .unwrap_or(false);

        if !exists {
            issues.push(format!("Table manquante : {}", table));
            stats.push(serde_json::json!({"table": table, "count": 0, "exists": false}));
            continue;
        }

        let count: i64 = conn
            .query_row(&format!("SELECT COUNT(*) FROM \"{}\"", table), [], |row| row.get(0))
            .unwrap_or(0);

        total_rows += count as usize;
        stats.push(serde_json::json!({"table": table, "count": count, "exists": true}));
    }

    if !configured {
        issues.push("Configuration Supabase incomplète : URL ou clé manquante.".to_string());
    }

    if total_rows == 0 {
        issues.push("Aucune donnée locale trouvée. Créez au moins un établissement, une année, un élève et quelques paiements avant de synchroniser.".to_string());
    }

    let echeance_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM Echeance", [], |row| row.get(0))
        .unwrap_or(0);
    let eleve_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM Eleve", [], |row| row.get(0))
        .unwrap_or(0);
    let paiement_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM Paiement", [], |row| row.get(0))
        .unwrap_or(0);

    if echeance_count > 0 {
        let bad_echeances: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM Echeance e LEFT JOIN Eleve el ON el.id = e.eleve_id LEFT JOIN FraisScolaire fs ON fs.id = e.frais_scolaire_id WHERE e.eleve_id IS NOT NULL AND (el.id IS NULL OR fs.id IS NULL)",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if bad_echeances > 0 {
            issues.push("Des échéances référencent des élèves ou frais inexistants.".to_string());
        }
    }

    if eleve_count > 0 {
        let duplicate_matricules: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM (SELECT matricule FROM Eleve WHERE matricule IS NOT NULL GROUP BY matricule HAVING COUNT(*) > 1)",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if duplicate_matricules > 0 {
            issues.push("Des matricules d'élèves sont dupliqués.".to_string());
        }
    }

    if paiement_count > 0 {
        let negative_payments: i64 = conn
            .query_row("SELECT COUNT(*) FROM Paiement WHERE montant < 0", [], |row| row.get(0))
            .unwrap_or(0);
        if negative_payments > 0 {
            issues.push("Des paiements négatifs ont été détectés.".to_string());
        }
    }

    let ready = configured && issues.is_empty();

    Ok(api_response(Ok(serde_json::json!({
        "ready": ready,
        "configured": configured,
        "totalRows": total_rows,
        "issues": issues,
        "stats": stats,
        "message": if ready { "La base locale est prête pour la synchronisation." } else { "La base locale n'est pas encore prête pour la synchronisation." }
    }))))
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

    let configured = supabase_url.is_some() && supabase_url.as_ref().map_or(false, |u| !u.trim().is_empty())
        && supabase_key.is_some() && supabase_key.as_ref().map_or(false, |k| !k.trim().is_empty());

    let status = SyncStatus {
        configured,
        last_sync,
        supabase_url,
        supabase_key,
    };

    Ok(api_response(Ok(status)))
}

#[tauri::command]
pub async fn sync_push() -> Result<serde_json::Value, AppError> {
    tokio::task::spawn_blocking(move || {
        let path = crate::db::get_db_path();
        let conn = rusqlite::Connection::open(&path)
            .map_err(|e| AppError::Database(format!("Erreur ouverture DB synchro: {}", e)))?;
        let _ = conn.execute_batch("PRAGMA journal_mode=WAL;");
        let _ = conn.execute_batch("PRAGMA busy_timeout=5000;");
        let summary = crate::sync::run_bidirectional_sync(&conn)?;
        Ok(api_response(Ok(summary)))
    })
    .await
    .map_err(|e| AppError::Internal(format!("Erreur thread synchro: {}", e)))?
}

#[tauri::command]
pub async fn sync_pull() -> Result<serde_json::Value, AppError> {
    tokio::task::spawn_blocking(move || {
        let path = crate::db::get_db_path();
        let conn = rusqlite::Connection::open(&path)
            .map_err(|e| AppError::Database(format!("Erreur ouverture DB synchro: {}", e)))?;
        let _ = conn.execute_batch("PRAGMA journal_mode=WAL;");
        let _ = conn.execute_batch("PRAGMA busy_timeout=5000;");
        let summary = crate::sync::run_bidirectional_sync(&conn)?;
        Ok(api_response(Ok(summary)))
    })
    .await
    .map_err(|e| AppError::Internal(format!("Erreur thread synchro: {}", e)))?
}

#[tauri::command]
pub fn save_sync_config(
    db: State<'_, DbConn>,
    supabase_url: String,
    supabase_key: String,
) -> Result<serde_json::Value, AppError> {
    let url_clean = supabase_url.trim().to_string();
    let key_clean = supabase_key.trim().to_string();

    if url_clean.is_empty() || key_clean.is_empty() {
        return Err(AppError::Internal("L'URL et la clé Supabase ne peuvent pas être vides".to_string()));
    }

    let now = now_iso();
    let conn = db.lock()?;

    // UPSERT SUPABASE_URL
    conn.execute(
        "INSERT INTO ConfigSysteme (id, cle, valeur, created_at, updated_at) \
         VALUES (?1, 'SUPABASE_URL', ?2, ?3, ?3) \
         ON CONFLICT(cle) DO UPDATE SET valeur = ?2, updated_at = ?3",
        params![generate_id(), url_clean, now],
    )
    .map_err(|e| AppError::Database(format!("Erreur enregistrement SUPABASE_URL: {}", e)))?;

    // UPSERT SUPABASE_KEY
    conn.execute(
        "INSERT INTO ConfigSysteme (id, cle, valeur, created_at, updated_at) \
         VALUES (?1, 'SUPABASE_KEY', ?2, ?3, ?3) \
         ON CONFLICT(cle) DO UPDATE SET valeur = ?2, updated_at = ?3",
        params![generate_id(), key_clean, now],
    )
    .map_err(|e| AppError::Database(format!("Erreur enregistrement SUPABASE_KEY: {}", e)))?;

    drop(conn);

    log_audit(
        &db,
        None,
        "UPDATE",
        "ConfigSysteme",
        None,
        Some("Updated sync configuration"),
    );

    Ok(api_response(Ok("Configuration enregistrée avec succès")))
}