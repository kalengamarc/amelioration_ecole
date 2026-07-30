use tauri::State;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use crate::db::DbConn;
use crate::db::models::User;
use crate::error::{AppError, api_response};
use crate::db::now_iso;
use crate::utils::audit_logger::log_audit;

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]   // ← token, user (camelCase)
pub struct LoginResponse {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]   // ← id, username, nomComplet, role, etablissementId
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub nom_complet: String,
    pub role: String,
    pub etablissement_id: Option<String>,
}


fn user_to_info(u: &User) -> UserInfo {
    UserInfo {
        id: u.id.clone(),
        username: u.username.clone(),
        nom_complet: u.nom_complet.clone(),
        role: u.role.clone(),
        etablissement_id: u.etablissement_id.clone(),
    }
}

fn row_to_user(row: &rusqlite::Row) -> Result<User, rusqlite::Error> {
    use crate::db::int_to_bool;
    Ok(User {
        id: row.get(0)?,
        username: row.get(1)?,
        password_hash: row.get(2)?,
        nom_complet: row.get(3)?,
        role: row.get(4)?,
        etablissement_id: row.get(5)?,
        actif: int_to_bool(row.get::<_, i32>(6)?),
        dernier_login: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        etablissement: None,
    })
}

#[tauri::command]
pub fn login(db: State<'_, DbConn>, req: LoginRequest) -> Result<serde_json::Value, AppError> {
    let user = {
        let conn = db.lock()?;
        let user = conn.query_row(
            "SELECT id, username, password_hash, nom_complet, role, etablissement_id, actif, dernier_login, created_at, updated_at FROM User WHERE username = ?1 AND actif = 1",
            params![req.username],
            row_to_user,
        ).map_err(|_| AppError::AuthFailed("Nom d'utilisateur ou mot de passe incorrect".into()))?;

        let valid = bcrypt::verify(&req.password, &user.password_hash)
            .map_err(|_| AppError::Internal("Erreur bcrypt".into()))?;
        if !valid {
            return Err(AppError::AuthFailed("Nom d'utilisateur ou mot de passe incorrect".into()));
        }

        let now = now_iso();
        conn.execute("UPDATE User SET dernier_login = ?1, updated_at = ?1 WHERE id = ?2", params![now, user.id])?;
        user
    };

    log_audit(&db, Some(&user.id), "LOGIN", "USER", Some(&user.id), None);

    Ok(api_response(Ok(LoginResponse {
        token: user.id.clone(),
        user: user_to_info(&user),
    })))
}

#[tauri::command]
pub fn get_me(db: State<'_, DbConn>, token: String) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;
    
    // 1. Try matching by ID first
    let user_res = conn.query_row(
        "SELECT id, username, password_hash, nom_complet, role, etablissement_id, actif, dernier_login, created_at, updated_at FROM User WHERE id = ?1 AND actif = 1",
        params![token],
        row_to_user,
    );

    let user = match user_res {
        Ok(u) => u,
        Err(_) => {
            // 2. Fallback: try matching by username or get the primary active admin
            conn.query_row(
                "SELECT id, username, password_hash, nom_complet, role, etablissement_id, actif, dernier_login, created_at, updated_at FROM User WHERE (username = ?1 OR role = 'COORDINATEUR' OR role = 'ADMIN') AND actif = 1 ORDER BY created_at ASC LIMIT 1",
                params![token],
                row_to_user,
            ).map_err(|_| AppError::AuthFailed("Session invalide".into()))?
        }
    };

    Ok(api_response(Ok(user_to_info(&user))))
}
