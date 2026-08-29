use tauri::State;
use rusqlite::params;
use serde::Serialize;

use crate::error::{AppError, api_response};
use crate::db::{DbConn, bool_to_int, int_to_bool, now_iso};
use crate::utils::{id::generate_id, audit_logger::log_audit};

// ── Réponse enrichie pour l'affichage ─────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FraisResponse {
    pub id: String,
    pub libelle: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub montant: f64,
    pub devise: String,
    pub etablissement_id: String,
    pub annee_scolaire_id: Option<String>,
    pub tranche: Option<i32>,
    pub date_echeance: Option<String>,
    pub actif: bool,
    pub created_at: String,
    pub updated_at: String,
    pub etablissement_nom: Option<String>,
    pub classes_ids: Vec<String>,
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn fetch_classe_ids_for_frais(conn: &rusqlite::Connection, frais_id: &str) -> Result<Vec<String>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT classe_id FROM FraisClasse WHERE frais_scolaire_id = ? ORDER BY classe_id"
    )?;
    let result = stmt.query_map(params![frais_id], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(result)
}

fn get_active_annee_id(conn: &rusqlite::Connection, etablissement_id: &str) -> Result<String, AppError> {
    conn.query_row(
        "SELECT id FROM AnneeScolaire WHERE etablissement_id = ? AND active = 1 LIMIT 1",
        params![etablissement_id],
        |row| row.get::<_, String>(0),
    ).map_err(|_| AppError::Validation("Aucune année scolaire active pour cet établissement".into()))
}

// ── Commande : liste des frais ──────────────────────────────────────────────

#[tauri::command]
pub fn list_frais(
    db: State<'_, DbConn>,
    etablissement_id: Option<String>,
    annee_scolaire_id: Option<String>,
    actif: Option<bool>,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let mut where_clauses: Vec<String> = vec!["1=1".to_string()];
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref eid) = etablissement_id {
        where_clauses.push("f.etablissement_id = ?".to_string());
        param_values.push(Box::new(eid.clone()));
    }
    if let Some(ref aid) = annee_scolaire_id {
        where_clauses.push("f.annee_scolaire_id = ?".to_string());
        param_values.push(Box::new(aid.clone()));
    }
    if let Some(v) = actif {
        where_clauses.push("f.actif = ?".to_string());
        param_values.push(Box::new(bool_to_int(v)));
    }

    let where_sql = where_clauses.join(" AND ");
    let sql = format!(
        r#"SELECT f.id, f.libelle, f."type", f.montant, f.devise, f.etablissement_id, f.annee_scolaire_id,
                  f.tranche, f.date_echeance, f.actif, f.created_at, f.updated_at,
                  e.nom as etablissement_nom
           FROM FraisScolaire f
           LEFT JOIN Etablissement e ON f.etablissement_id = e.id
           WHERE {} ORDER BY f.libelle"#,
        where_sql
    );

    let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_refs.as_slice(), |row| {
        let id: String = row.get(0)?;
        let classes_ids = fetch_classe_ids_for_frais(&conn, &id).unwrap_or_default();
        Ok(FraisResponse {
            id,
            libelle: row.get(1)?,
            type_: row.get(2)?,
            montant: row.get(3)?,
            devise: row.get(4)?,
            etablissement_id: row.get(5)?,
            annee_scolaire_id: row.get(6)?,
            tranche: row.get(7)?,
            date_echeance: row.get(8)?,
            actif: int_to_bool(row.get::<_, i32>(9)?),
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
            etablissement_nom: row.get(12)?,
            classes_ids,
        })
    })?;

    let frais_list: Vec<FraisResponse> = rows.collect::<Result<_, _>>()?;

    Ok(serde_json::json!({
        "success": true,
        "data": frais_list
    }))
}

// ── Commande : création ─────────────────────────────────────────────────────

#[tauri::command]
pub fn create_frais(
    db: State<'_, DbConn>,
    libelle: String,
    type_: String,
    montant: f64,
    devise: Option<String>,
    etablissement_id: String,
    annee_scolaire_id: Option<String>,
    tranche: Option<i32>,
    date_echeance: Option<String>,
    classe_ids: Option<Vec<String>>,
) -> Result<serde_json::Value, AppError> {
    let id = generate_id();
    let now = now_iso();
    let dev = devise.unwrap_or_else(|| "BIF".to_string());

    let annee_id = match annee_scolaire_id {
        Some(ref a) if !a.trim().is_empty() => a.clone(),
        _ => {
            let conn = db.lock()?;
            get_active_annee_id(&conn, &etablissement_id)?
        }
    };

    let frais_id = id.clone();
    {
        let conn = db.lock()?;
        conn.execute(
            r#"INSERT INTO FraisScolaire (id, libelle, "type", montant, devise, etablissement_id, annee_scolaire_id, tranche, date_echeance, actif, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, ?11)"#,
            params![id, libelle, type_, montant, dev, etablissement_id, annee_id, tranche, date_echeance, now, now],
        )?;

        if let Some(ref ids) = classe_ids {
            for cid in ids {
                conn.execute(
                    "INSERT INTO FraisClasse (frais_scolaire_id, classe_id, created_at) VALUES (?1, ?2, ?3)",
                    params![id, cid, now],
                )?;
            }
        }
    }

    log_audit(&db, None, "CREATE", "frais_scolaire", Some(&frais_id), None);

    get_frais_internal(db, &frais_id)
}

// ── Commande : mise à jour ──────────────────────────────────────────────────

#[tauri::command]
pub fn update_frais(
    db: State<'_, DbConn>,
    id: String,
    libelle: Option<String>,
    type_: Option<String>,
    montant: Option<f64>,
    devise: Option<String>,
    tranche: Option<i32>,
    date_echeance: Option<String>,
    actif: Option<bool>,
    classe_ids: Option<Vec<String>>,
) -> Result<serde_json::Value, AppError> {
    {
        let conn = db.lock()?;

        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM FraisScolaire WHERE id = ?",
            params![id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound(format!("FraisScolaire {} introuvable", id)));
        }

        // Correction : typer explicitement sets et utiliser .to_string()
        let mut sets: Vec<String> = Vec::new();
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref v) = libelle {
            sets.push("libelle = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = type_ {
            sets.push("\"type\" = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(v) = montant {
            sets.push("montant = ?".to_string());
            param_values.push(Box::new(v));

            // Mettre à jour automatiquement le montant dû sur toutes les échéances associées
            let _ = conn.execute(
                "UPDATE Echeance SET montant_du = ?, updated_at = ? WHERE frais_scolaire_id = ?",
                params![v, now_iso(), id],
            );
        }
        if let Some(ref v) = devise {
            sets.push("devise = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(v) = tranche {
            sets.push("tranche = ?".to_string());
            param_values.push(Box::new(v));
        }
        if let Some(ref v) = date_echeance {
            sets.push("date_echeance = ?".to_string());
            param_values.push(Box::new(v.clone()));

            let _ = conn.execute(
                "UPDATE Echeance SET date_echeance = ?, updated_at = ? WHERE frais_scolaire_id = ?",
                params![v, now_iso(), id],
            );
        }
        if let Some(v) = actif {
            sets.push("actif = ?".to_string());
            param_values.push(Box::new(bool_to_int(v)));
        }

        let has_field_updates = !sets.is_empty();

        if has_field_updates {
            sets.push("updated_at = ?".to_string());
            param_values.push(Box::new(now_iso()));
            param_values.push(Box::new(id.clone()));

            let sql = format!("UPDATE FraisScolaire SET {} WHERE id = ?", sets.join(", "));
            let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();
            conn.execute(&sql, params_refs.as_slice())?;
        }

        if let Some(ref ids) = classe_ids {
            let now = now_iso();

            // Récupérer les anciennes classes pour logger la suppression dans AuditLog
            let mut old_classes: Vec<String> = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT classe_id FROM FraisClasse WHERE frais_scolaire_id = ?") {
                if let Ok(mut rows) = stmt.query(params![id]) {
                    while let Ok(Some(row)) = rows.next() {
                        if let Ok(cid) = row.get::<_, String>(0) {
                            old_classes.push(cid);
                        }
                    }
                }
            }

            for old_cid in &old_classes {
                if !ids.contains(old_cid) {
                    let del_key = format!("{},{}", id, old_cid);
                    let log_id = generate_id();
                    let _ = conn.execute(
                        "INSERT INTO AuditLog (id, action, entite, entite_id, details, created_at) VALUES (?1, 'DELETE', 'FraisClasse', ?2, ?3, ?4)",
                        params![log_id, del_key, format!("frais={}, classe={}", id, old_cid), now],
                    );
                }
            }

            conn.execute("DELETE FROM FraisClasse WHERE frais_scolaire_id = ?", params![id])?;
            for cid in ids {
                conn.execute(
                    "INSERT INTO FraisClasse (frais_scolaire_id, classe_id, created_at) VALUES (?1, ?2, ?3)",
                    params![id, cid, now],
                )?;
            }

            // Nettoyer automatiquement les échéances non payées des élèves dont la classe n'est plus concernée
            let _ = conn.execute(
                "DELETE FROM Echeance WHERE frais_scolaire_id = ? AND montant_paye = 0 AND eleve_id NOT IN (
                     SELECT ec.eleve_id FROM EleveClasse ec WHERE ec.classe_id IN (SELECT classe_id FROM FraisClasse WHERE frais_scolaire_id = ?) AND ec.statut = 'ACTIF'
                 )",
                params![id, id],
            );
        }
    }

    log_audit(&db, None, "UPDATE", "frais_scolaire", Some(&id), None);

    get_frais_internal(db, &id)
}

// ── Commande : suppression ──────────────────────────────────────────────────

#[tauri::command]
pub fn delete_frais(
    db: State<'_, DbConn>,
    id: String,
) -> Result<serde_json::Value, AppError> {
    {
        let conn = db.lock()?;

        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM FraisScolaire WHERE id = ?",
            params![id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound(format!("FraisScolaire {} introuvable", id)));
        }

        conn.execute("DELETE FROM FraisScolaire WHERE id = ?", params![id])?;
    }

    log_audit(&db, None, "DELETE", "frais_scolaire", Some(&id), None);

    Ok(api_response(Ok(serde_json::json!({ "deleted": true }))))
}

// ── Helper interne ──────────────────────────────────────────────────────────

fn get_frais_internal(db: State<'_, DbConn>, id: &str) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;
    let frais = conn.query_row(
        r#"SELECT f.id, f.libelle, f."type", f.montant, f.devise, f.etablissement_id, f.annee_scolaire_id,
                  f.tranche, f.date_echeance, f.actif, f.created_at, f.updated_at,
                  e.nom as etablissement_nom
           FROM FraisScolaire f
           LEFT JOIN Etablissement e ON f.etablissement_id = e.id
           WHERE f.id = ?"#,
        params![id],
        |row| {
            let id: String = row.get(0)?;
            let classes_ids = fetch_classe_ids_for_frais(&conn, &id).unwrap_or_default();
            Ok(FraisResponse {
                id,
                libelle: row.get(1)?,
                type_: row.get(2)?,
                montant: row.get(3)?,
                devise: row.get(4)?,
                etablissement_id: row.get(5)?,
                annee_scolaire_id: row.get(6)?,
                tranche: row.get(7)?,
                date_echeance: row.get(8)?,
                actif: int_to_bool(row.get::<_, i32>(9)?),
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                etablissement_nom: row.get(12)?,
                classes_ids,
            })
        },
    )?;

    Ok(api_response(Ok(frais)))
}