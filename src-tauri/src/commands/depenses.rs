use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::db::{now_iso, DbConn};
use crate::error::{api_response, list_response, AppError};
use crate::utils::{audit_logger::log_audit, id::generate_id};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DepenseResponse {
    pub id: String,
    pub etablissement_id: String,
    pub annee_scolaire_id: String,
    pub categorie: String,
    pub libelle: String,
    pub montant: f64,
    pub devise: Option<String>,
    pub beneficiaire: Option<String>,
    pub date_depense: String,
    pub reference_piece: Option<String>,
    pub justificatif_url: Option<String>,
    pub statut: String,
    pub created_by_id: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub etablissement_nom: Option<String>,
}

fn row_to_depense(row: &rusqlite::Row) -> Result<DepenseResponse, rusqlite::Error> {
    Ok(DepenseResponse {
        id: row.get(0)?,
        etablissement_id: row.get(1)?,
        annee_scolaire_id: row.get(2)?,
        categorie: row.get(3)?,
        libelle: row.get(4)?,
        montant: row.get(5)?,
        devise: row.get(6)?,
        beneficiaire: row.get(7)?,
        date_depense: row.get(8)?,
        reference_piece: row.get(9)?,
        justificatif_url: row.get(10)?,
        statut: row.get(11)?,
        created_by_id: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
        etablissement_nom: row.get(15)?,
    })
}

fn get_active_annee_id(conn: &rusqlite::Connection, etablissement_id: &str) -> Result<String, AppError> {
    conn.query_row(
        "SELECT id FROM AnneeScolaire WHERE etablissement_id = ? AND active = 1 LIMIT 1",
        params![etablissement_id],
        |row| row.get::<_, String>(0),
    ).map_err(|_| AppError::Validation("Aucune année scolaire active pour cet établissement".into()))
}

#[tauri::command]
pub fn list_depenses(
    db: State<'_, DbConn>,
    etablissement_id: Option<String>,
    annee_scolaire_id: Option<String>,
    categorie: Option<String>,
    statut: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let mut conditions = vec!["1=1".to_string()];
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

    if let Some(ref v) = etablissement_id {
        conditions.push("d.etablissement_id = ?".to_string());
        param_values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = annee_scolaire_id {
        conditions.push("d.annee_scolaire_id = ?".to_string());
        param_values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = categorie {
        conditions.push("d.categorie = ?".to_string());
        param_values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = statut {
        conditions.push("d.statut = ?".to_string());
        param_values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = date_from {
        conditions.push("d.date_depense >= ?".to_string());
        param_values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = date_to {
        conditions.push("d.date_depense <= ?".to_string());
        param_values.push(Box::new(v.clone()));
    }

    let query = format!(
        "SELECT d.id, d.etablissement_id, d.annee_scolaire_id, d.categorie, d.libelle, d.montant, d.devise, d.beneficiaire, d.date_depense, d.reference_piece, d.justificatif_url, d.statut, d.created_by_id, d.created_at, d.updated_at, e.nom as etablissement_nom \
         FROM Depense d \
         LEFT JOIN Etablissement e ON d.etablissement_id = e.id \
         WHERE {} \
         ORDER BY d.created_at DESC",
        conditions.join(" AND ")
    );

    let mut stmt = conn.prepare(&query)?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let rows = stmt.query_map(params_refs.as_slice(), |row| row_to_depense(row))?;

    let mut results: Vec<DepenseResponse> = Vec::new();
    for row in rows {
        results.push(row?);
    }

    Ok(list_response("depenses", Ok(results)))
}

#[tauri::command]
pub fn create_depense(
    db: State<'_, DbConn>,
    etablissement_id: String,
    annee_scolaire_id: Option<String>,
    categorie: String,
    libelle: String,
    montant: f64,
    devise: Option<String>,
    beneficiaire: Option<String>,
    date_depense: String,
    reference_piece: Option<String>,
    justificatif_url: Option<String>,
    created_by_id: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let id = generate_id();
    let now = now_iso();

    let annee_id = match annee_scolaire_id {
        Some(ref a) if !a.is_empty() => a.clone(),
        _ => {
            let conn = db.lock()?;
            get_active_annee_id(&conn, &etablissement_id)?
        }
    };

    {
        let conn = db.lock()?;
        conn.execute(
            "INSERT INTO Depense (id, etablissement_id, annee_scolaire_id, categorie, libelle, montant, devise, beneficiaire, date_depense, reference_piece, justificatif_url, statut, created_by_id, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'EN_ATTENTE', ?12, ?13, ?14)",
            params![id, etablissement_id, annee_id, categorie, libelle, montant, devise, beneficiaire, date_depense, reference_piece, justificatif_url, created_by_id, now, now],
        )?;
    }

    log_audit(
        &db,
        None,
        "CREATE",
        "depense",
        Some(&id),
        Some(&format!(
            "Création de la dépense id={}, libelle={}, montant={}",
            id, libelle, montant
        )),
    );

    let conn = db.lock()?;
    let result = conn.query_row(
        "SELECT d.id, d.etablissement_id, d.annee_scolaire_id, d.categorie, d.libelle, d.montant, d.devise, d.beneficiaire, d.date_depense, d.reference_piece, d.justificatif_url, d.statut, d.created_by_id, d.created_at, d.updated_at, e.nom as etablissement_nom \
         FROM Depense d \
         LEFT JOIN Etablissement e ON d.etablissement_id = e.id \
         WHERE d.id = ?1",
        params![id],
        |row| row_to_depense(row),
    )?;

    Ok(api_response(Ok(result)))
}

#[tauri::command]
pub fn update_depense(
    db: State<'_, DbConn>,
    id: String,
    categorie: Option<String>,
    libelle: Option<String>,
    montant: Option<f64>,
    devise: Option<String>,
    beneficiaire: Option<String>,
    date_depense: Option<String>,
    reference_piece: Option<String>,
    statut: Option<String>,
) -> Result<serde_json::Value, AppError> {
    {
        let conn = db.lock()?;

        let mut set_clauses = vec!["updated_at = ?".to_string()];
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now_iso())];

        if let Some(ref v) = categorie {
            set_clauses.push("categorie = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = libelle {
            set_clauses.push("libelle = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(v) = montant {
            set_clauses.push("montant = ?".to_string());
            param_values.push(Box::new(v));
        }
        if let Some(ref v) = devise {
            set_clauses.push("devise = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = beneficiaire {
            set_clauses.push("beneficiaire = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = date_depense {
            set_clauses.push("date_depense = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = reference_piece {
            set_clauses.push("reference_piece = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = statut {
            set_clauses.push("statut = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }

        param_values.push(Box::new(id.clone()));

        let query = format!("UPDATE Depense SET {} WHERE id = ?", set_clauses.join(", "));

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();
        let rows_affected = conn.execute(&query, params_refs.as_slice())?;

        if rows_affected == 0 {
            return Err(AppError::NotFound("Dépense non trouvée".to_string()));
        }
    }

    log_audit(
        &db,
        None,
        "UPDATE",
        "depense",
        Some(&id),
        Some(&format!("Mise à jour de la dépense id={}", id)),
    );

    let conn = db.lock()?;
    let result = conn.query_row(
        "SELECT d.id, d.etablissement_id, d.annee_scolaire_id, d.categorie, d.libelle, d.montant, d.devise, d.beneficiaire, d.date_depense, d.reference_piece, d.justificatif_url, d.statut, d.created_by_id, d.created_at, d.updated_at, e.nom as etablissement_nom \
         FROM Depense d \
         LEFT JOIN Etablissement e ON d.etablissement_id = e.id \
         WHERE d.id = ?1",
        params![id],
        |row| row_to_depense(row),
    )?;

    Ok(api_response(Ok(result)))
}

#[tauri::command]
pub fn delete_depense(db: State<'_, DbConn>, id: String) -> Result<serde_json::Value, AppError> {
    {
        let conn = db.lock()?;

        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM Depense WHERE id = ?1",
                params![id],
                |row| row.get::<_, i64>(0),
            )
            .map(|c| c > 0)?;

        if !exists {
            return Err(AppError::NotFound("Dépense non trouvée".to_string()));
        }

        conn.execute("DELETE FROM Depense WHERE id = ?1", params![id])?;
    }

    log_audit(
        &db,
        None,
        "DELETE",
        "depense",
        Some(&id),
        Some(&format!("Suppression de la dépense id={}", id)),
    );

    Ok(api_response(Ok(serde_json::json!({ "deleted": true }))))
}