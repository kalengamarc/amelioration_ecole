use tauri::State;
use rusqlite::params;
use serde_json::json;

use crate::error::{AppError, api_response};
use crate::db::{DbConn, bool_to_int, int_to_bool, now_iso};
use crate::utils::{id::{generate_id, generate_receipt_number}, audit_logger::log_audit};

#[tauri::command]
pub fn list_paiements(
    db: State<'_, DbConn>,
    etablissement_id: Option<String>,
    annee_scolaire_id: Option<String>,
    eleve_id: Option<String>,
    annule: Option<bool>,
    date_from: Option<String>,
    date_to: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(20).max(1).min(100);
    let offset = (page - 1) * page_size;

    let mut where_conditions = vec!["1=1".to_string()];
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

    if let Some(ref v) = etablissement_id {
        where_conditions.push("p.etablissement_id = ?".to_string());
        param_values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = annee_scolaire_id {
        where_conditions.push("p.annee_scolaire_id = ?".to_string());
        param_values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = eleve_id {
        where_conditions.push("p.eleve_id = ?".to_string());
        param_values.push(Box::new(v.clone()));
    }
    if let Some(v) = annule {
        where_conditions.push("p.annule = ?".to_string());
        param_values.push(Box::new(bool_to_int(v)));
    }
    if let Some(ref v) = date_from {
        where_conditions.push("p.created_at >= ?".to_string());
        param_values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = date_to {
        where_conditions.push("p.created_at <= ?".to_string());
        param_values.push(Box::new(v.clone()));
    }

    let where_clause = where_conditions.join(" AND ");

    let count_query = format!(
        "SELECT COUNT(*) as total FROM Paiement p WHERE {}",
        where_clause
    );
    let params_refs_count: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    let total: i64 = conn.query_row(&count_query, params_refs_count.as_slice(), |row| {
        row.get::<_, i64>(0)
    })?;

    let query = format!(
        "SELECT p.id, p.numero_recu, p.eleve_id, p.echeance_id, p.etablissement_id, p.annee_scolaire_id, \
         p.user_id, p.motif, p.montant, p.devise, p.montant_affecte, p.devise_echeance, \
         p.mode_paiement, p.reference_paiement, p.taux_change, p.montant_original, \
         p.annule, p.date_annulation, p.created_at, p.updated_at, \
         TRIM(el.nom || ' ' || el.prenom) as eleve_nom, \
         el.matricule as eleve_matricule, \
         COALESCE(c.nom, '—') as classe_nom, \
         u.nom_complet as user_nom_complet \
         FROM Paiement p \
         LEFT JOIN Eleve el ON p.eleve_id = el.id \
         LEFT JOIN EleveClasse ec ON ec.eleve_id = el.id AND ec.statut = 'ACTIF' \
         LEFT JOIN Classe c ON c.id = ec.classe_id \
         LEFT JOIN User u ON p.user_id = u.id \
         WHERE {} \
         ORDER BY p.created_at DESC \
         LIMIT ? OFFSET ?",
        where_clause
    );

    let mut param_values_paginated = param_values;
    param_values_paginated.push(Box::new(page_size));
    param_values_paginated.push(Box::new(offset));
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values_paginated.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&query)?;
    let rows = stmt.query_map(params_refs.as_slice(), |row| {
        let annule_val: i32 = row.get(16)?;
        Ok(json!({
            "id": row.get::<_, String>(0)?,
            "numeroRecu": row.get::<_, String>(1)?,
            "eleveId": row.get::<_, String>(2)?,
            "echeanceId": row.get::<_, Option<String>>(3)?,
            "etablissementId": row.get::<_, String>(4)?,
            "anneeScolaireId": row.get::<_, String>(5)?,
            "userId": row.get::<_, String>(6)?,
            "motif": row.get::<_, String>(7)?,
            "montant": row.get::<_, f64>(8)?,
            "devise": row.get::<_, String>(9)?,
            "montantAffecte": row.get::<_, Option<f64>>(10)?,
            "deviseEcheance": row.get::<_, Option<String>>(11)?,
            "modePaiement": row.get::<_, String>(12)?,
            "referencePaiement": row.get::<_, Option<String>>(13)?,
            "tauxChange": row.get::<_, Option<f64>>(14)?,
            "montantOriginal": row.get::<_, Option<f64>>(15)?,
            "annule": annule_val != 0,
            "dateAnnulation": row.get::<_, Option<String>>(17)?,
            "dateEncaissement": row.get::<_, String>(18)?,   // created_at
            "updatedAt": row.get::<_, String>(19)?,
            "eleveNom": row.get::<_, String>(20)?,
            "eleveMatricule": row.get::<_, String>(21)?,
            "eleveClasse": row.get::<_, String>(22)?,
            "caissierNom": row.get::<_, Option<String>>(23)?,
        }))
    })?;

    let mut paiements = Vec::new();
    for row in rows {
        paiements.push(row?);
    }

    Ok(json!({
        "success": true,
        "paiements": paiements,
        "total": total,
        "page": page,
        "pageSize": page_size,
    }))
}

#[tauri::command]
pub fn create_paiement(
    db: State<'_, DbConn>,
    _eleve_id: String,
    _echeance_id: Option<String>,
    etablissement_id: String,
    annee_scolaire_id: Option<String>,
    user_id: String,
    motif: String,
    montant: f64,
    devise: String,
    montant_affecte: Option<f64>,
    devise_echeance: Option<String>,
    mode_paiement: String,
    reference_paiement: Option<String>,
    taux_change: Option<f64>,
    montant_original: Option<f64>,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;
    let now = now_iso();
    let id = generate_id();
    let numero_recu = generate_receipt_number(&conn);

    // Déterminer l'année scolaire active si non fournie
    let annee_id = match annee_scolaire_id {
        Some(ref a) if !a.is_empty() => a.clone(),
        _ => {
            conn.query_row(
                "SELECT id FROM AnneeScolaire WHERE etablissement_id = ? AND active = 1 LIMIT 1",
                params![etablissement_id],
                |row| row.get::<_, String>(0),
            ).map_err(|_| AppError::Validation("Aucune année scolaire active pour cet établissement".into()))?
        }
    };

    let montant_affecte_val = montant_affecte.unwrap_or(montant);
    let devise_echeance_val = devise_echeance.unwrap_or_else(|| devise.clone());

    conn.execute(
        "INSERT INTO Paiement (id, eleve_id, echeance_id, etablissement_id, annee_scolaire_id, user_id, motif, montant, devise, montant_affecte, devise_echeance, mode_paiement, reference_paiement, taux_change, montant_original, numero_recu, annule, created_at, updated_at)
         VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 0, ?16, ?17)",
        params![id, _eleve_id, etablissement_id, annee_id, user_id, motif, montant, devise, montant_affecte_val, devise_echeance_val, mode_paiement, reference_paiement, taux_change, montant_original, numero_recu, now, now],
    )?;

    drop(conn);
    log_audit(&db, None, "CREATE", "paiement", Some(&id), Some(&format!("n° recu={}, montant={}", numero_recu, montant)));

    let conn = db.lock()?;
    let result = conn.query_row(
        "SELECT p.id, p.numero_recu, p.eleve_id, p.echeance_id, p.etablissement_id, p.annee_scolaire_id,
                p.user_id, p.motif, p.montant, p.devise, p.montant_affecte, p.devise_echeance,
                p.mode_paiement, p.reference_paiement, p.taux_change, p.montant_original,
                p.annule, p.date_annulation, p.created_at, p.updated_at,
                TRIM(el.nom || ' ' || el.prenom) as eleve_nom,
                el.matricule as eleve_matricule,
                COALESCE(c.nom, '—') as classe_nom,
                u.nom_complet as user_nom_complet
         FROM Paiement p
         JOIN Eleve el ON p.eleve_id = el.id
         LEFT JOIN EleveClasse ec ON ec.eleve_id = el.id AND ec.statut = 'ACTIF'
         LEFT JOIN Classe c ON c.id = ec.classe_id
         JOIN User u ON p.user_id = u.id
         WHERE p.id = ?",
        params![id],
        |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "numeroRecu": row.get::<_, String>(1)?,
                "eleveId": row.get::<_, String>(2)?,
                "echeanceId": row.get::<_, Option<String>>(3)?,
                "etablissementId": row.get::<_, String>(4)?,
                "anneeScolaireId": row.get::<_, String>(5)?,
                "userId": row.get::<_, String>(6)?,
                "motif": row.get::<_, String>(7)?,
                "montant": row.get::<_, f64>(8)?,
                "devise": row.get::<_, String>(9)?,
                "montantAffecte": row.get::<_, Option<f64>>(10)?,
                "deviseEcheance": row.get::<_, Option<String>>(11)?,
                "modePaiement": row.get::<_, String>(12)?,
                "referencePaiement": row.get::<_, Option<String>>(13)?,
                "tauxChange": row.get::<_, Option<f64>>(14)?,
                "montantOriginal": row.get::<_, Option<f64>>(15)?,
                "annule": row.get::<_, i32>(16)? != 0,
                "dateAnnulation": row.get::<_, Option<String>>(17)?,
                "dateEncaissement": row.get::<_, String>(18)?,
                "updatedAt": row.get::<_, String>(19)?,
                "eleveNom": row.get::<_, String>(20)?,
                "eleveMatricule": row.get::<_, String>(21)?,
                "eleveClasse": row.get::<_, String>(22)?,
                "caissierNom": row.get::<_, String>(23)?,
            }))
        },
    )?;

    Ok(api_response(Ok(result)))
}

// annuler_paiement et get_paiement sont également mis à jour avec les mêmes champs plats
#[tauri::command]
pub fn annuler_paiement(
    db: State<'_, DbConn>,
    id: String,
    user_id: String,
    motif: String,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let (already_annule, _eleve_id, montant, devise, numero_recu): (bool, String, f64, String, String) = conn
        .query_row(
            "SELECT annule, eleve_id, montant, devise, numero_recu FROM Paiement WHERE id = ?",
            params![id],
            |row| {
                let annule_int: i32 = row.get(0)?;
                Ok((
                    annule_int != 0,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .map_err(|_| AppError::NotFound("Paiement introuvable".into()))?;

    if already_annule {
        return Err(AppError::BadRequest("Ce paiement est déjà annulé".into()));
    }

    let now = now_iso();

    conn.execute(
        "UPDATE Paiement SET annule = 1, date_annulation = ?, updated_at = ? WHERE id = ?",
        params![now, now, id],
    )?;

    let annulation_id = generate_id();
    conn.execute(
        "INSERT INTO AnnulationRecu (id, paiement_id, user_id, motif, date_annulation, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![annulation_id, id, user_id, motif, now, now],
    )?;

    drop(conn);
    log_audit(&db, None, "ANNULATION", "paiement", Some(&id), Some(&format!("Annulation du paiement n° {}, montant={} {}", numero_recu, montant, devise)));

    Ok(api_response(Ok(json!({
        "id": id,
        "annule": true,
        "dateAnnulation": now,
        "motif": motif,
    }))))
}

#[tauri::command]
pub fn get_paiement(
    db: State<'_, DbConn>,
    id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let result = conn.query_row(
        "SELECT p.id, p.numero_recu, p.eleve_id, p.echeance_id, p.etablissement_id, p.annee_scolaire_id, \
         p.user_id, p.motif, p.montant, p.devise, p.montant_affecte, p.devise_echeance, \
         p.mode_paiement, p.reference_paiement, p.taux_change, p.montant_original, \
         p.annule, p.date_annulation, p.created_at, p.updated_at, \
         TRIM(el.nom || ' ' || el.prenom) as eleve_nom, \
         el.matricule as eleve_matricule, \
         COALESCE(c.nom, '—') as classe_nom, \
         u.nom_complet as user_nom_complet \
         FROM Paiement p \
         LEFT JOIN Eleve el ON p.eleve_id = el.id \
         LEFT JOIN EleveClasse ec ON ec.eleve_id = el.id AND ec.statut = 'ACTIF' \
         LEFT JOIN Classe c ON c.id = ec.classe_id \
         LEFT JOIN User u ON p.user_id = u.id \
         WHERE p.id = ?",
        params![id],
        |row| {
            let annule_val: i32 = row.get(16)?;
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "numeroRecu": row.get::<_, String>(1)?,
                "eleveId": row.get::<_, String>(2)?,
                "echeanceId": row.get::<_, Option<String>>(3)?,
                "etablissementId": row.get::<_, String>(4)?,
                "anneeScolaireId": row.get::<_, String>(5)?,
                "userId": row.get::<_, String>(6)?,
                "motif": row.get::<_, String>(7)?,
                "montant": row.get::<_, f64>(8)?,
                "devise": row.get::<_, String>(9)?,
                "montantAffecte": row.get::<_, Option<f64>>(10)?,
                "deviseEcheance": row.get::<_, Option<String>>(11)?,
                "modePaiement": row.get::<_, String>(12)?,
                "referencePaiement": row.get::<_, Option<String>>(13)?,
                "tauxChange": row.get::<_, Option<f64>>(14)?,
                "montantOriginal": row.get::<_, Option<f64>>(15)?,
                "annule": annule_val != 0,
                "dateAnnulation": row.get::<_, Option<String>>(17)?,
                "dateEncaissement": row.get::<_, String>(18)?,
                "updatedAt": row.get::<_, String>(19)?,
                "eleveNom": row.get::<_, Option<String>>(20)?,
                "eleveMatricule": row.get::<_, Option<String>>(21)?,
                "eleveClasse": row.get::<_, Option<String>>(22)?,
                "caissierNom": row.get::<_, Option<String>>(23)?,
            }))
        },
    ).map_err(|_| AppError::NotFound(format!("Paiement {} introuvable", id)))?;

    Ok(api_response(Ok(result)))
}