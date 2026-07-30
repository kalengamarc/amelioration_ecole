use tauri::State;
use rusqlite::params;
use serde::Serialize;
use serde_json::json;

use crate::error::{AppError, api_response};
use crate::db::{DbConn, bool_to_int, int_to_bool, now_iso};
use crate::utils::{id::generate_id, audit_logger::log_audit};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserResponse {
    pub id: String,
    pub username: String,
    pub nom_complet: String,
    pub role: String,
    pub etablissement_id: Option<String>,
    pub actif: bool,
    pub dernier_login: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub etablissement_nom: Option<String>,
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn row_to_user_response(row: &rusqlite::Row) -> Result<UserResponse, rusqlite::Error> {
    Ok(UserResponse {
        id: row.get(0)?,
        username: row.get(1)?,
        nom_complet: row.get(3)?,
        role: row.get(4)?,
        etablissement_id: row.get(5)?,
        actif: int_to_bool(row.get::<_, i32>(6)?),
        dernier_login: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        etablissement_nom: row.get(10)?,
    })
}

// ── Commandes ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_utilisateurs(
    db: State<'_, DbConn>,
    etablissement_id: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let users = if let Some(ref eid) = etablissement_id {
        let mut stmt = conn.prepare(
            "SELECT u.id, u.username, u.password_hash, u.nom_complet, u.role, u.etablissement_id, u.actif, u.dernier_login, u.created_at, u.updated_at, e.nom as etablissement_nom \
             FROM User u \
             LEFT JOIN Etablissement e ON u.etablissement_id = e.id \
             WHERE u.etablissement_id = ? \
             ORDER BY u.created_at DESC"
        )?;
        let result = stmt.query_map(params![eid], row_to_user_response)?
            .collect::<Result<Vec<_>, _>>()?;
        result
    } else {
        let mut stmt = conn.prepare(
            "SELECT u.id, u.username, u.password_hash, u.nom_complet, u.role, u.etablissement_id, u.actif, u.dernier_login, u.created_at, u.updated_at, e.nom as etablissement_nom \
             FROM User u \
             LEFT JOIN Etablissement e ON u.etablissement_id = e.id \
             WHERE u.actif = 1 \
             ORDER BY u.created_at DESC"
        )?;
        let result = stmt.query_map([], row_to_user_response)?
            .collect::<Result<Vec<_>, _>>()?;
        result
    };

    Ok(json!({
        "success": true,
        "data": users
    }))
}

#[tauri::command]
pub fn create_utilisateur(
    db: State<'_, DbConn>,
    username: String,
    password: String,
    nom_complet: String,
    role: String,
    etablissement_id: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let id = generate_id();
    let now = now_iso();

    let user = {
        let conn = db.lock()?;

        // Vérifier l'unicité
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM User WHERE username = ?",
            params![username],
            |row| row.get(0),
        )?;
        if count > 0 {
            return Err(AppError::BadRequest("Ce nom d'utilisateur existe déjà".to_string()));
        }

        let password_hash = bcrypt::hash(&password, 4)
            .map_err(|e| AppError::Internal(format!("Erreur de hashage du mot de passe: {}", e)))?;

        conn.execute(
            "INSERT INTO User (id, username, password_hash, nom_complet, role, etablissement_id, actif, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
            params![id, username, password_hash, nom_complet, role, etablissement_id, now, now],
        )?;

        conn.query_row(
            "SELECT u.id, u.username, u.password_hash, u.nom_complet, u.role, u.etablissement_id, u.actif, u.dernier_login, u.created_at, u.updated_at, e.nom as etablissement_nom \
             FROM User u \
             LEFT JOIN Etablissement e ON u.etablissement_id = e.id \
             WHERE u.id = ?",
            params![id],
            row_to_user_response,
        )?
    };

    log_audit(&db, None, "CREATE", "user", Some(&id), Some(&format!("username={}, role={}", username, role)));

    Ok(api_response(Ok(user)))
}

#[tauri::command]
pub fn update_utilisateur(
    db: State<'_, DbConn>,
    id: String,
    nom_complet: Option<String>,
    role: Option<String>,
    etablissement_id: Option<String>,
    actif: Option<bool>,
    password: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let user = {
        let conn = db.lock()?;

        // Vérifier l'existence
        conn.query_row(
            "SELECT id FROM User WHERE id = ?",
            params![id],
            |row| row.get::<_, String>(0),
        ).map_err(|_| AppError::NotFound(format!("Utilisateur {} introuvable", id)))?;

        let mut sets = vec!["updated_at = ?".to_string()];
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now_iso())];

        if let Some(ref v) = nom_complet {
            sets.push("nom_complet = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = role {
            sets.push("role = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = etablissement_id {
            sets.push("etablissement_id = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(v) = actif {
            sets.push("actif = ?".to_string());
            param_values.push(Box::new(bool_to_int(v)));
        }
        if let Some(ref v) = password {
            let hashed = bcrypt::hash(v, 4)
                .map_err(|e| AppError::Internal(format!("Erreur de hashage du mot de passe: {}", e)))?;
            sets.push("password_hash = ?".to_string());
            param_values.push(Box::new(hashed));
        }

        if sets.len() > 1 {
            param_values.push(Box::new(id.clone()));
            let sql = format!("UPDATE User SET {} WHERE id = ?", sets.join(", "));
            let refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
            conn.execute(&sql, refs.as_slice())?;
        }

        conn.query_row(
            "SELECT u.id, u.username, u.password_hash, u.nom_complet, u.role, u.etablissement_id, u.actif, u.dernier_login, u.created_at, u.updated_at, e.nom as etablissement_nom \
             FROM User u \
             LEFT JOIN Etablissement e ON u.etablissement_id = e.id \
             WHERE u.id = ?",
            params![id],
            row_to_user_response,
        )?
    };

    log_audit(&db, None, "UPDATE", "user", Some(&id), None);

    Ok(api_response(Ok(user)))
}

#[tauri::command]
pub fn delete_utilisateur(
    db: State<'_, DbConn>,
    id: String,
) -> Result<serde_json::Value, AppError> {
    {
        let conn = db.lock()?;
        let now = now_iso();
        conn.execute(
            "UPDATE User SET actif = 0, updated_at = ? WHERE id = ?",
            params![now, id],
        )?;
    }
    log_audit(&db, None, "DELETE", "user", Some(&id), None);
    Ok(api_response(Ok(json!({ "deleted": true }))))
}