use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::db::{DbConn, now_iso};
use crate::error::{api_response, AppError};
use crate::utils::{audit_logger::log_audit, id::generate_id};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ParametresResponse {
    id: String,
    etablissement_id: String,
    annee_scolaire_id: Option<String>,
    mentions_legales: Option<String>,
    pied_page_recu: Option<String>,
    nom_imprimante: Option<String>,
    taux_change_usd_bif: f64,
    devise_defaut: String,
}

#[tauri::command]
pub fn get_parametres(
    db: State<'_, DbConn>,
    etablissement_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let params = conn.query_row(
        "SELECT id, etablissement_id, annee_scolaire_id, mentions_legales, pied_page_recu, \
         nom_imprimante, taux_change_usd_bif, devise_defaut \
         FROM ParametreEtablissement WHERE etablissement_id = ?",
        params![etablissement_id],
        |row| {
            Ok(ParametresResponse {
                id: row.get(0)?,
                etablissement_id: row.get(1)?,
                annee_scolaire_id: row.get(2)?,
                mentions_legales: row.get(3)?,
                pied_page_recu: row.get(4)?,
                nom_imprimante: row.get(5)?,
                taux_change_usd_bif: row.get(6)?,
                devise_defaut: row.get(7)?,
            })
        },
    ).unwrap_or_else(|_| ParametresResponse {
        id: String::new(),
        etablissement_id,
        annee_scolaire_id: None,
        mentions_legales: None,
        pied_page_recu: None,
        nom_imprimante: None,
        taux_change_usd_bif: 2500.0,
        devise_defaut: "BIF".to_string(),
    });

    Ok(api_response(Ok(params)))
}

#[tauri::command]
pub fn save_parametres(
    db: State<'_, DbConn>,
    etablissement_id: String,
    annee_scolaire_id: Option<String>,
    mentions_legales: Option<String>,
    pied_page_recu: Option<String>,
    nom_imprimante: Option<String>,
    taux_change_usd_bif: Option<f64>,
    devise_defaut: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let now = now_iso();
    let id = generate_id();
    let taux = taux_change_usd_bif.unwrap_or(2500.0);
    let devise = devise_defaut.clone().unwrap_or_else(|| "BIF".to_string());

    let conn = db.lock()?;

    let existing_id: Option<String> = {
        let mut sql = "SELECT id FROM ParametreEtablissement WHERE etablissement_id = ?".to_string();
        let mut param_s: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(etablissement_id.clone())];

        if let Some(ref asid) = annee_scolaire_id {
            sql.push_str(" AND annee_scolaire_id = ?");
            param_s.push(Box::new(asid.clone()));
        } else {
            sql.push_str(" AND annee_scolaire_id IS NULL");
        }

        let refs: Vec<&dyn rusqlite::types::ToSql> = param_s.iter().map(|p| p.as_ref()).collect();
        conn.query_row(&sql, refs.as_slice(), |row| row.get::<_, String>(0)).ok()
    };

    let result = if let Some(existing) = existing_id {
        let mut sets = vec!["updated_at = ?".to_string()];
        let mut vals: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now.clone())];

        if let Some(ref v) = annee_scolaire_id {
            sets.push("annee_scolaire_id = ?".into());
            vals.push(Box::new(v.clone()));
        }
        if let Some(ref v) = mentions_legales {
            sets.push("mentions_legales = ?".into());
            vals.push(Box::new(v.clone()));
        }
        if let Some(ref v) = pied_page_recu {
            sets.push("pied_page_recu = ?".into());
            vals.push(Box::new(v.clone()));
        }
        if let Some(ref v) = nom_imprimante {
            sets.push("nom_imprimante = ?".into());
            vals.push(Box::new(v.clone()));
        }
        if taux_change_usd_bif.is_some() {
            sets.push("taux_change_usd_bif = ?".into());
            vals.push(Box::new(taux));
        }
        if devise_defaut.is_some() {
            sets.push("devise_defaut = ?".into());
            vals.push(Box::new(devise));
        }

        vals.push(Box::new(existing.clone()));

        let sql = format!("UPDATE ParametreEtablissement SET {} WHERE id = ?", sets.join(", "));
        let refs: Vec<&dyn rusqlite::types::ToSql> = vals.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, refs.as_slice())?;

        drop(conn);
        log_audit(&db, None, "UPDATE", "parametre_etablissement", Some(&etablissement_id), None);

        let conn = db.lock()?;
        conn.query_row(
            "SELECT id, etablissement_id, annee_scolaire_id, mentions_legales, pied_page_recu, \
             nom_imprimante, taux_change_usd_bif, devise_defaut \
             FROM ParametreEtablissement WHERE id = ?",
            params![existing],
            |row| Ok(ParametresResponse {
                id: row.get(0)?,
                etablissement_id: row.get(1)?,
                annee_scolaire_id: row.get(2)?,
                mentions_legales: row.get(3)?,
                pied_page_recu: row.get(4)?,
                nom_imprimante: row.get(5)?,
                taux_change_usd_bif: row.get(6)?,
                devise_defaut: row.get(7)?,
            }),
        )?
    } else {
        conn.execute(
            "INSERT INTO ParametreEtablissement (id, etablissement_id, annee_scolaire_id, mentions_legales, \
             pied_page_recu, nom_imprimante, taux_change_usd_bif, devise_defaut, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![id, etablissement_id, annee_scolaire_id, mentions_legales, pied_page_recu,
                    nom_imprimante, taux, devise, now, now],
        )?;

        drop(conn);
        log_audit(&db, None, "CREATE", "parametre_etablissement", Some(&etablissement_id), None);

        let conn = db.lock()?;
        conn.query_row(
            "SELECT id, etablissement_id, annee_scolaire_id, mentions_legales, pied_page_recu, \
             nom_imprimante, taux_change_usd_bif, devise_defaut \
             FROM ParametreEtablissement WHERE id = ?",
            params![id],
            |row| Ok(ParametresResponse {
                id: row.get(0)?,
                etablissement_id: row.get(1)?,
                annee_scolaire_id: row.get(2)?,
                mentions_legales: row.get(3)?,
                pied_page_recu: row.get(4)?,
                nom_imprimante: row.get(5)?,
                taux_change_usd_bif: row.get(6)?,
                devise_defaut: row.get(7)?,
            }),
        )?
    };

    Ok(api_response(Ok(result)))
}