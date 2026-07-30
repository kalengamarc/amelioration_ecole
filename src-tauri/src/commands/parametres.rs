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
    let devise = devise_defaut.unwrap_or_else(|| "BIF".to_string());

    let conn = db.lock()?;

    // Check if configuration already exists for this etablissement_id (regardless of annee_scolaire_id)
    let existing_id: Option<String> = conn.query_row(
        "SELECT id FROM ParametreEtablissement WHERE etablissement_id = ?",
        params![etablissement_id],
        |row| row.get(0),
    ).ok();

    if let Some(existing) = existing_id {
        conn.execute(
            "UPDATE ParametreEtablissement SET \
             annee_scolaire_id = ?1, mentions_legales = ?2, pied_page_recu = ?3, \
             nom_imprimante = ?4, taux_change_usd_bif = ?5, devise_defaut = ?6, updated_at = ?7 \
             WHERE id = ?8",
            params![annee_scolaire_id, mentions_legales, pied_page_recu, nom_imprimante, taux, devise, now, existing],
        )?;
    } else {
        conn.execute(
            "INSERT INTO ParametreEtablissement (id, etablissement_id, annee_scolaire_id, mentions_legales, \
             pied_page_recu, nom_imprimante, taux_change_usd_bif, devise_defaut, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![id, etablissement_id, annee_scolaire_id, mentions_legales, pied_page_recu,
                    nom_imprimante, taux, devise, now, now],
        )?;
    }

    drop(conn);
    log_audit(&db, None, "UPDATE", "parametre_etablissement", Some(&etablissement_id), None);

    let conn = db.lock()?;
    let result = conn.query_row(
        "SELECT id, etablissement_id, annee_scolaire_id, mentions_legales, pied_page_recu, \
         nom_imprimante, taux_change_usd_bif, devise_defaut \
         FROM ParametreEtablissement WHERE etablissement_id = ?",
        params![etablissement_id],
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
    )?;

    Ok(api_response(Ok(result)))
}