use tauri::State;
use rusqlite::params;

use crate::error::{AppError, list_response, api_response};
use crate::db::{DbConn, bool_to_int, int_to_bool, now_iso};
use crate::db::models::*;
use crate::utils::{id::generate_id, audit_logger::log_audit};

// ── Helper : mapping enrichi avec établissement et année scolaire ──────────

fn row_to_classe_enrichie(row: &rusqlite::Row) -> Result<Classe, rusqlite::Error> {
    let etablissement = Etablissement {
        id: row.get(3)?,          // etablissement_id
        nom: row.get(9)?,         // etablissement_nom
        type_: String::new(),     // non nécessaire ici
        adresse: None,
        telephone: None,
        email: None,
        logo_url: None,
        couleur_principale: String::new(),
        rccm: None,
        id_nat: None,
        devise: String::new(),
        actif: true,
        created_at: String::new(),
        updated_at: String::new(),
    };

    let annee_scolaire = AnneeScolaire {
        id: row.get(4)?,          // annee_scolaire_id
        libelle: row.get(10)?,    // annee_libelle
        etablissement_id: row.get(3)?,
        date_debut: None,         // pas nécessaire
        date_fin: None,
        active: false,
        created_at: String::new(),
        updated_at: String::new(),
        etablissement: None,
    };

    Ok(Classe {
        id: row.get(0)?,
        nom: row.get(1)?,
        niveau: row.get(2)?,
        etablissement_id: row.get(3)?,
        annee_scolaire_id: row.get(4)?,
        effectif_max: row.get(5)?,
        actif: int_to_bool(row.get::<_, i32>(6)?),
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        etablissement: Some(etablissement),
        annee_scolaire: Some(annee_scolaire),
        effectif: row.get(11)?,        // effectif
        frais_classes: None,
    })
}

// ── Commande : liste des classes ────────────────────────────────────────────

#[tauri::command]
pub fn list_classes(
    db: State<'_, DbConn>,
    etablissement_id: Option<String>,
    annee_scolaire_id: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let mut where_clauses: Vec<String> = vec!["1=1".to_string()];
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref eid) = etablissement_id {
        where_clauses.push("c.etablissement_id = ?".to_string());
        param_values.push(Box::new(eid.clone()));
    }
    if let Some(ref aid) = annee_scolaire_id {
        where_clauses.push("c.annee_scolaire_id = ?".to_string());
        param_values.push(Box::new(aid.clone()));
    }

    let where_sql = where_clauses.join(" AND ");
    let sql = format!(
        r#"SELECT c.id, c.nom, c.niveau, c.etablissement_id, c.annee_scolaire_id, c.effectif_max, c.actif, c.created_at, c.updated_at,
                  e.nom as etablissement_nom,
                  a.libelle as annee_libelle,
                  (SELECT COUNT(*) FROM EleveClasse ec WHERE ec.classe_id = c.id AND ec.statut = 'ACTIF') as effectif
           FROM Classe c
           LEFT JOIN Etablissement e ON c.etablissement_id = e.id
           LEFT JOIN AnneeScolaire a ON c.annee_scolaire_id = a.id
           WHERE {} ORDER BY c.nom"#,
        where_sql
    );

    let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_refs.as_slice(), |row| row_to_classe_enrichie(row))?;
    let classes = rows.collect::<Result<Vec<_>, _>>()?;

    Ok(list_response("classes", Ok(classes)))
}

// ── Commande : détail d'une classe ──────────────────────────────────────────

#[tauri::command]
pub fn get_classe(
    db: State<'_, DbConn>,
    id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let sql = r#"SELECT c.id, c.nom, c.niveau, c.etablissement_id, c.annee_scolaire_id, c.effectif_max, c.actif, c.created_at, c.updated_at,
                        e.nom as etablissement_nom,
                        a.libelle as annee_libelle,
                        (SELECT COUNT(*) FROM EleveClasse ec WHERE ec.classe_id = c.id AND ec.statut = 'ACTIF') as effectif
                 FROM Classe c
                 LEFT JOIN Etablissement e ON c.etablissement_id = e.id
                 LEFT JOIN AnneeScolaire a ON c.annee_scolaire_id = a.id
                 WHERE c.id = ?"#;

    let classe = conn.query_row(sql, params![id], |row| row_to_classe_enrichie(row))
        .map_err(|_| AppError::NotFound(format!("Classe {} introuvable", id)))?;

    Ok(api_response(Ok(classe)))
}

// ── Commande : création ─────────────────────────────────────────────────────

#[tauri::command]
pub fn create_classe(
    db: State<'_, DbConn>,
    nom: String,
    niveau: String,
    etablissement_id: String,
    annee_scolaire_id: String,
    effectif_max: Option<i32>,
) -> Result<serde_json::Value, AppError> {
    let id = generate_id();
    let now = now_iso();
    let eff_max = effectif_max.unwrap_or(40);

    {
        let conn = db.lock()?;
        conn.execute(
            "INSERT INTO Classe (id, nom, niveau, etablissement_id, annee_scolaire_id, effectif_max, actif, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
            params![id, nom, niveau, etablissement_id, annee_scolaire_id, eff_max, now, now],
        )?;
    }

    log_audit(&db, None, "CREATE", "classe", Some(&id), None);

    // On retourne l'objet complet via get_classe pour éviter la duplication
    get_classe(db, id)
}

// ── Commande : mise à jour ─────────────────────────────────────────────────

#[tauri::command]
pub fn update_classe(
    db: State<'_, DbConn>,
    id: String,
    nom: Option<String>,
    niveau: Option<String>,
    effectif_max: Option<i32>,
    actif: Option<bool>,
) -> Result<serde_json::Value, AppError> {
    {
        let conn = db.lock()?;

        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM Classe WHERE id = ?",
            params![id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound(format!("Classe {} introuvable", id)));
        }

        let mut sets: Vec<String> = Vec::new();
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref v) = nom {
            sets.push("nom = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(ref v) = niveau {
            sets.push("niveau = ?".to_string());
            param_values.push(Box::new(v.clone()));
        }
        if let Some(v) = effectif_max {
            sets.push("effectif_max = ?".to_string());
            param_values.push(Box::new(v));
        }
        if let Some(v) = actif {
            sets.push("actif = ?".to_string());
            param_values.push(Box::new(bool_to_int(v)));
        }

        if !sets.is_empty() {
            sets.push("updated_at = ?".to_string());
            param_values.push(Box::new(now_iso()));
            param_values.push(Box::new(id.clone()));

            let sql = format!("UPDATE Classe SET {} WHERE id = ?", sets.join(", "));
            let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();
            conn.execute(&sql, params_refs.as_slice())?;
        }
    }

    log_audit(&db, None, "UPDATE", "classe", Some(&id), None);

    get_classe(db, id)
}

// ── Commande : suppression ─────────────────────────────────────────────────

#[tauri::command]
pub fn delete_classe(
    db: State<'_, DbConn>,
    id: String,
) -> Result<serde_json::Value, AppError> {
    {
        let conn = db.lock()?;

        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM Classe WHERE id = ?",
            params![id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound(format!("Classe {} introuvable", id)));
        }

        conn.execute("DELETE FROM Classe WHERE id = ?", params![id])?;
    }

    log_audit(&db, None, "DELETE", "classe", Some(&id), None);

    Ok(api_response(Ok(serde_json::json!({ "deleted": true }))))
}