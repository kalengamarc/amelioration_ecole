use tauri::State;
use rusqlite::params;

use crate::error::{AppError, list_response, api_response};
use crate::db::{DbConn, bool_to_int, int_to_bool, now_iso};
use crate::db::models::*;
use crate::utils::{id::generate_id, audit_logger::log_audit};

fn row_to_annee_scolaire(row: &rusqlite::Row) -> Result<AnneeScolaire, rusqlite::Error> {
    Ok(AnneeScolaire {
        id: row.get(0)?,
        libelle: row.get(1)?,
        etablissement_id: row.get(2)?,
        date_debut: row.get(3)?,
        date_fin: row.get(4)?,
        active: int_to_bool(row.get::<_, i32>(5)?),
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        etablissement: None,
    })
}

#[tauri::command]
pub fn list_annees_scolaires(
    db: State<'_, DbConn>,
    etablissement_id: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let annees = if let Some(ref eid) = etablissement_id {
        let mut stmt = conn.prepare(
            "SELECT id, libelle, etablissement_id, date_debut, date_fin, active, created_at, updated_at FROM AnneeScolaire WHERE etablissement_id = ? ORDER BY date_debut DESC"
        )?;
        let result = stmt.query_map(params![eid], |row| row_to_annee_scolaire(row))?
            .collect::<Result<Vec<_>, _>>()?;
        result
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, libelle, etablissement_id, date_debut, date_fin, active, created_at, updated_at FROM AnneeScolaire ORDER BY date_debut DESC"
        )?;
        let result = stmt.query_map([], |row| row_to_annee_scolaire(row))?
            .collect::<Result<Vec<_>, _>>()?;
        result
    };

    Ok(list_response("annees_scolaires", Ok(annees)))
}

#[tauri::command]
pub fn create_annee_scolaire(
    db: State<'_, DbConn>,
    libelle: String,
    etablissement_id: String,
    date_debut: Option<String>,   // ← devenu optionnel
    date_fin: Option<String>,     // ← devenu optionnel
) -> Result<serde_json::Value, AppError> {
    let id = generate_id();
    let now = now_iso();

    let annee = {
        let conn = db.lock()?;

        // Check for duplicate libelle within same etablissement
        let duplicate: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM AnneeScolaire WHERE etablissement_id = ? AND libelle = ?",
            params![etablissement_id, libelle],
            |row| row.get(0),
        )?;
        if duplicate {
            return Err(AppError::Validation(format!(
                "L'annee scolaire '{}' existe deja pour cet etablissement", libelle
            )));
        }

        conn.execute(
            "INSERT INTO AnneeScolaire (id, libelle, etablissement_id, date_debut, date_fin, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
            params![id, libelle, etablissement_id, date_debut, date_fin, now, now],
        )?;

        let annee = conn.query_row(
            "SELECT id, libelle, etablissement_id, date_debut, date_fin, active, created_at, updated_at FROM AnneeScolaire WHERE id = ?",
            params![id],
            |row| row_to_annee_scolaire(row),
        )?;
        annee
    };

    log_audit(&db, None, "CREATE", "annee_scolaire", Some(&id), None);

    Ok(api_response(Ok(annee)))
}

#[tauri::command]
pub fn update_annee_scolaire(
    db: State<'_, DbConn>,
    id: String,
    libelle: Option<String>,
    date_debut: Option<String>,
    date_fin: Option<String>,
    active: Option<bool>,
) -> Result<serde_json::Value, AppError> {
    let annee = {
        let conn = db.lock()?;

        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM AnneeScolaire WHERE id = ?",
            params![id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound(format!("AnneeScolaire {} introuvable", id)));
        }

        let mut sets: Vec<String> = Vec::new();
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref v) = libelle {
            sets.push("libelle = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = date_debut {
            sets.push("date_debut = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = date_fin {
            sets.push("date_fin = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(v) = active {
            sets.push("active = ?".to_string());
            param_values.push(Box::new(bool_to_int(v)));
        }

        if sets.is_empty() {
            let annee = conn.query_row(
                "SELECT id, libelle, etablissement_id, date_debut, date_fin, active, created_at, updated_at FROM AnneeScolaire WHERE id = ?",
                params![id],
                |row| row_to_annee_scolaire(row),
            )?;
            return Ok(api_response(Ok(annee)));
        }

        sets.push("updated_at = ?".to_string());
        param_values.push(Box::new(now_iso()));
        param_values.push(Box::new(id.clone()));

        let sql = format!("UPDATE AnneeScolaire SET {} WHERE id = ?", sets.join(", "));
        let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();
        conn.execute(&sql, params_refs.as_slice())?;

        let annee = conn.query_row(
            "SELECT id, libelle, etablissement_id, date_debut, date_fin, active, created_at, updated_at FROM AnneeScolaire WHERE id = ?",
            params![id],
            |row| row_to_annee_scolaire(row),
        )?;
        annee
    };

    log_audit(&db, None, "UPDATE", "annee_scolaire", Some(&id), None);

    Ok(api_response(Ok(annee)))
}

#[tauri::command]
pub fn delete_annee_scolaire(
    db: State<'_, DbConn>,
    id: String,
) -> Result<serde_json::Value, AppError> {
    {
        let conn = db.lock()?;

        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM AnneeScolaire WHERE id = ?",
            params![id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound(format!("AnneeScolaire {} introuvable", id)));
        }

        conn.execute("DELETE FROM AnneeScolaire WHERE id = ?", params![id])?;
    }

    log_audit(&db, None, "DELETE", "annee_scolaire", Some(&id), None);

    Ok(api_response(Ok(serde_json::json!({ "deleted": true }))))
}

#[tauri::command]
pub fn activer_annee_scolaire(
    db: State<'_, DbConn>,
    id: String,
) -> Result<serde_json::Value, AppError> {
    let annee = {
        let conn = db.lock()?;

        let etab_id: String = conn.query_row(
            "SELECT etablissement_id FROM AnneeScolaire WHERE id = ?",
            params![id],
            |row| row.get(0),
        ).map_err(|_| AppError::NotFound(format!("AnneeScolaire {} introuvable", id)))?;

        let now = now_iso();

        conn.execute(
            "UPDATE AnneeScolaire SET active = 0, updated_at = ? WHERE etablissement_id = ?",
            params![now, etab_id],
        )?;

        conn.execute(
            "UPDATE AnneeScolaire SET active = 1, updated_at = ? WHERE id = ?",
            params![now, id],
        )?;

        let annee = conn.query_row(
            "SELECT id, libelle, etablissement_id, date_debut, date_fin, active, created_at, updated_at FROM AnneeScolaire WHERE id = ?",
            params![id],
            |row| row_to_annee_scolaire(row),
        )?;
        annee
    };

    log_audit(&db, None, "UPDATE", "annee_scolaire", Some(&id), Some("Activation"));

    Ok(api_response(Ok(annee)))
}