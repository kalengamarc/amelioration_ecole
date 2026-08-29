use tauri::State;
use rusqlite::params;
use serde::Serialize;

use crate::error::{AppError, list_response, api_response};
use crate::db::{DbConn, bool_to_int, int_to_bool, now_iso};
use crate::db::models::*;
use crate::utils::{id::generate_id, audit_logger::log_audit};

// ── Struct pour la liste (avec compteurs) ────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EtablissementListResponse {
    pub id: String,
    pub nom: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub adresse: Option<String>,
    pub telephone: Option<String>,
    pub email: Option<String>,
    pub logo_url: Option<String>,
    pub couleur_principale: String,
    pub rccm: Option<String>,
    pub id_nat: Option<String>,
    pub devise: String,
    pub actif: bool,
    pub created_at: String,
    pub updated_at: String,
    pub nombre_eleves: i64,
    pub nombre_classes: i64,
    pub nombre_frais: i64,
}

// ── Helper de mapping (conservé) ─────────────────────────────────────────

fn row_to_etablissement(row: &rusqlite::Row) -> Result<Etablissement, rusqlite::Error> {
    Ok(Etablissement {
        id: row.get(0)?,
        nom: row.get(1)?,
        type_: row.get(2)?,
        adresse: row.get(3)?,
        telephone: row.get(4)?,
        email: row.get(5)?,
        logo_url: row.get(6)?,
        couleur_principale: row.get(7)?,
        rccm: row.get(8)?,
        id_nat: row.get(9)?,
        devise: row.get(10)?,
        actif: int_to_bool(row.get::<_, i32>(11)?),
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

// ── Commande LIST (modifiée) ─────────────────────────────────────────────

#[tauri::command]
pub fn list_etablissements(
    db: State<'_, DbConn>,
    id: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let query = if let Some(ref _eid) = id {
        format!(
            "SELECT e.id, e.nom, e.\"type\", e.adresse, e.telephone, e.email, e.logo_url, e.couleur_principale, e.rccm, e.id_nat, e.devise, e.actif, e.created_at, e.updated_at,
                    (SELECT COUNT(*) FROM Eleve el WHERE el.etablissement_id = e.id AND el.statut IN ('ACTIF', 'INSCRIT') AND EXISTS (SELECT 1 FROM EleveClasse ec JOIN Classe c ON c.id = ec.classe_id WHERE ec.eleve_id = el.id AND ec.statut = 'ACTIF' AND c.actif = 1 AND c.etablissement_id = e.id AND c.annee_scolaire_id = el.annee_scolaire_id)) as nb_eleves,
                    (SELECT COUNT(*) FROM Classe c WHERE c.etablissement_id = e.id AND c.actif = 1) as nb_classes,
                    (SELECT COUNT(*) FROM FraisScolaire WHERE etablissement_id = e.id) as nb_frais
             FROM Etablissement e
             WHERE e.id = ?"
        )
    } else {
        "SELECT e.id, e.nom, e.\"type\", e.adresse, e.telephone, e.email, e.logo_url, e.couleur_principale, e.rccm, e.id_nat, e.devise, e.actif, e.created_at, e.updated_at,
                (SELECT COUNT(*) FROM Eleve el WHERE el.etablissement_id = e.id AND el.statut IN ('ACTIF', 'INSCRIT') AND EXISTS (SELECT 1 FROM EleveClasse ec JOIN Classe c ON c.id = ec.classe_id WHERE ec.eleve_id = el.id AND ec.statut = 'ACTIF' AND c.actif = 1 AND c.etablissement_id = e.id AND c.annee_scolaire_id = el.annee_scolaire_id)) as nb_eleves,
                (SELECT COUNT(*) FROM Classe c WHERE c.etablissement_id = e.id AND c.actif = 1) as nb_classes,
                (SELECT COUNT(*) FROM FraisScolaire WHERE etablissement_id = e.id) as nb_frais
         FROM Etablissement e
         WHERE e.actif = 1".to_string()
    };

    // Préparation des paramètres
    let params_slice: Option<Box<dyn rusqlite::types::ToSql>> = id.map(|v| Box::new(v) as Box<dyn rusqlite::types::ToSql>);
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = match params_slice {
        Some(ref p) => vec![p.as_ref()],
        None => vec![],
    };

    let mut stmt = conn.prepare(&query)?;
    let rows = stmt.query_map(params_refs.as_slice(), |row| {
        Ok(EtablissementListResponse {
            id: row.get(0)?,
            nom: row.get(1)?,
            type_: row.get(2)?,
            adresse: row.get(3)?,
            telephone: row.get(4)?,
            email: row.get(5)?,
            logo_url: row.get(6)?,
            couleur_principale: row.get(7)?,
            rccm: row.get(8)?,
            id_nat: row.get(9)?,
            devise: row.get(10)?,
            actif: int_to_bool(row.get::<_, i32>(11)?),
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
            nombre_eleves: row.get(14)?,
            nombre_classes: row.get(15)?,
            nombre_frais: row.get(16)?,
        })
    })?;

    let etabs: Vec<EtablissementListResponse> = rows.collect::<Result<_, _>>()?;

    Ok(list_response("etablissements", Ok(etabs)))
}

#[tauri::command]
pub fn get_etablissement(
    db: State<'_, DbConn>,
    id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let etab = conn.query_row(
        "SELECT id, nom, \"type\", adresse, telephone, email, logo_url, couleur_principale, rccm, id_nat, devise, actif, created_at, updated_at FROM Etablissement WHERE id = ?",
        params![id],
        |row| row_to_etablissement(row),
    ).map_err(|_| AppError::NotFound(format!("Etablissement {} introuvable", id)))?;

    Ok(api_response(Ok(etab)))
}

#[tauri::command]
pub fn create_etablissement(
    db: State<'_, DbConn>,
    nom: String,
    type_: String,
    adresse: Option<String>,
    telephone: Option<String>,
    email: Option<String>,
    logo_url: Option<String>,
    couleur_principale: Option<String>,
    devise: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let id = generate_id();
    let now = now_iso();
    let couleur = couleur_principale.unwrap_or_else(|| "#075e54".to_string());
    let dev = devise.unwrap_or_else(|| "BIF".to_string());

    let etab = {
        let conn = db.lock()?;
        conn.execute(
            "INSERT INTO Etablissement (id, nom, \"type\", adresse, telephone, email, logo_url, couleur_principale, devise, actif, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
            params![id, nom, type_, adresse, telephone, email, logo_url, couleur, dev, now, now],
        )?;

        let etab = conn.query_row(
            "SELECT id, nom, \"type\", adresse, telephone, email, logo_url, couleur_principale, rccm, id_nat, devise, actif, created_at, updated_at FROM Etablissement WHERE id = ?",
            params![id],
            |row| row_to_etablissement(row),
        )?;
        etab
    };

    log_audit(&db, None, "CREATE", "etablissement", Some(&id), None);

    Ok(api_response(Ok(etab)))
}

#[tauri::command]
pub fn update_etablissement(
    db: State<'_, DbConn>,
    id: String,
    nom: Option<String>,
    type_: Option<String>,
    adresse: Option<String>,
    telephone: Option<String>,
    email: Option<String>,
    logo_url: Option<String>,
    couleur_principale: Option<String>,
    devise: Option<String>,
    actif: Option<bool>,
) -> Result<serde_json::Value, AppError> {
    let etab = {
        let conn = db.lock()?;

        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM Etablissement WHERE id = ?",
            params![id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound(format!("Etablissement {} introuvable", id)));
        }

        let mut sets: Vec<String> = Vec::new();
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref v) = nom {
            sets.push("nom = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = type_ {
            sets.push("\"type\" = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = adresse {
            sets.push("adresse = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = telephone {
            sets.push("telephone = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = email {
            sets.push("email = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = logo_url {
            sets.push("logo_url = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = couleur_principale {
            sets.push("couleur_principale = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = devise {
            sets.push("devise = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(v) = actif {
            sets.push("actif = ?".to_string());
            param_values.push(Box::new(bool_to_int(v)));
        }

        if sets.is_empty() {
            let etab = conn.query_row(
                "SELECT id, nom, \"type\", adresse, telephone, email, logo_url, couleur_principale, rccm, id_nat, devise, actif, created_at, updated_at FROM Etablissement WHERE id = ?",
                params![id],
                |row| row_to_etablissement(row),
            )?;
            return Ok(api_response(Ok(etab)));
        }

        sets.push("updated_at = ?".to_string());
        param_values.push(Box::new(now_iso()));
        param_values.push(Box::new(id.clone()));

        let sql = format!("UPDATE Etablissement SET {} WHERE id = ?", sets.join(", "));
        let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();
        conn.execute(&sql, params_refs.as_slice())?;

        let etab = conn.query_row(
            "SELECT id, nom, \"type\", adresse, telephone, email, logo_url, couleur_principale, rccm, id_nat, devise, actif, created_at, updated_at FROM Etablissement WHERE id = ?",
            params![id],
            |row| row_to_etablissement(row),
        )?;
        etab
    };

    log_audit(&db, None, "UPDATE", "etablissement", Some(&id), None);

    Ok(api_response(Ok(etab)))
}

#[tauri::command]
pub fn delete_etablissement(
    db: State<'_, DbConn>,
    id: String,
) -> Result<serde_json::Value, AppError> {
    {
        let conn = db.lock()?;

        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM Etablissement WHERE id = ?",
            params![id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound(format!("Etablissement {} introuvable", id)));
        }

        conn.execute(
            "UPDATE Etablissement SET actif = 0, updated_at = ? WHERE id = ?",
            params![now_iso(), id],
        )?;
    }

    log_audit(&db, None, "DELETE", "etablissement", Some(&id), None);

    Ok(api_response(Ok(serde_json::json!({ "deleted": true }))))
}

#[tauri::command]
pub fn get_etablissement_context(
    db: State<'_, DbConn>,
    id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let etab = conn.query_row(
        "SELECT id, nom, \"type\", adresse, telephone, email, logo_url, couleur_principale, rccm, id_nat, devise, actif, created_at, updated_at FROM Etablissement WHERE id = ?",
        params![id],
        |row| row_to_etablissement(row),
    ).map_err(|_| AppError::NotFound(format!("Etablissement {} introuvable", id)))?;

    let mut stmt = conn.prepare(
        "SELECT p.id, p.etablissement_id, p.annee_scolaire_id, p.mentions_legales, p.pied_page_recu, p.nom_imprimante, p.taux_change_usd_bif, p.devise_defaut, p.created_by, p.created_at, p.updated_at FROM ParametreEtablissement p WHERE p.etablissement_id = ?"
    )?;
    let params_list = stmt.query_map(params![id], |row| {
        Ok(ParametreEtablissement {
            id: row.get(0)?,
            etablissement_id: row.get(1)?,
            annee_scolaire_id: row.get(2)?,
            mentions_legales: row.get(3)?,
            pied_page_recu: row.get(4)?,
            nom_imprimante: row.get(5)?,
            taux_change_usd_bif: row.get(6)?,
            devise_defaut: row.get(7)?,
            created_by: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;

    let result = serde_json::json!({
        "etablissement": etab,
        "parametres": params_list,
    });

    Ok(api_response(Ok(result)))
}