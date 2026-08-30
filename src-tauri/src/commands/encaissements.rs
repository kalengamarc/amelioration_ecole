use tauri::State;
use rusqlite::params;
use serde_json::json;

use crate::error::{AppError, api_response};
use crate::db::{DbConn, bool_to_int, now_iso};
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
    search: Option<String>,
    mode_paiement: Option<String>,
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
        // Inclure toute la journée sélectionnée dans le filtre de date de fin.
        where_conditions.push("p.created_at < (? || 'T23:59:59.999Z')".to_string());
        param_values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = search {
        let value = format!("%{}%", v.trim().to_lowercase());
        where_conditions.push(
            "(LOWER(p.numero_recu) LIKE ? OR LOWER(COALESCE(el.nom, '') || ' ' || COALESCE(el.prenom, '')) LIKE ? OR LOWER(COALESCE(el.matricule, '')) LIKE ? OR LOWER(COALESCE(p.motif, '')) LIKE ? OR LOWER(COALESCE(p.reference_paiement, '')) LIKE ?)".to_string(),
        );
        for _ in 0..5 {
            param_values.push(Box::new(value.clone()));
        }
    }
    if let Some(ref v) = mode_paiement {
        where_conditions.push("p.mode_paiement = ?".to_string());
        param_values.push(Box::new(v.clone()));
    }

    let where_clause = where_conditions.join(" AND ");

    let count_query = format!(
        "SELECT COUNT(*) as total FROM Paiement p LEFT JOIN Eleve el ON p.eleve_id = el.id WHERE {}",
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
            "dateEncaissement": row.get::<_, String>(18)?,
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
    eleve_id: String,
    echeance_id: Option<String>,
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
    let mut numero_recu = generate_receipt_number(&conn);

    let eleve_exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM Eleve WHERE id = ?",
        params![eleve_id],
        |r| r.get(0),
    ).unwrap_or(false);

    if !eleve_exists {
        return Err(AppError::Validation("L'élève sélectionné n'existe pas dans la base de données locale. Veuillez le synchroniser ou rafraîchir.".into()));
    }

    let etab_id = if conn.query_row("SELECT COUNT(*) > 0 FROM Etablissement WHERE id = ?", params![etablissement_id], |r| r.get::<_, bool>(0)).unwrap_or(false) {
        etablissement_id
    } else {
        conn.query_row("SELECT id FROM Etablissement LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap_or(etablissement_id)
    };

    let mut valid_annee_id: Option<String> = None;
    if let Some(ref a) = annee_scolaire_id {
        if !a.trim().is_empty() && a != "undefined" && a != "null" {
            if conn.query_row("SELECT COUNT(*) > 0 FROM AnneeScolaire WHERE id = ?", params![a], |r| r.get::<_, bool>(0)).unwrap_or(false) {
                valid_annee_id = Some(a.clone());
            }
        }
    }
    if valid_annee_id.is_none() {
        valid_annee_id = conn.query_row(
            "SELECT id FROM AnneeScolaire WHERE etablissement_id = ? AND active = 1 LIMIT 1",
            params![etab_id],
            |r| r.get::<_, String>(0),
        ).ok();
    }
    if valid_annee_id.is_none() {
        valid_annee_id = conn.query_row(
            "SELECT id FROM AnneeScolaire WHERE etablissement_id = ? LIMIT 1",
            params![etab_id],
            |r| r.get::<_, String>(0),
        ).ok();
    }
    if valid_annee_id.is_none() {
        valid_annee_id = conn.query_row("SELECT id FROM AnneeScolaire LIMIT 1", [], |r| r.get::<_, String>(0)).ok();
    }
    let final_annee_id = match valid_annee_id {
        Some(a) => a,
        None => {
            let new_annee_id = generate_id();
            let year_lbl = format!("{}-{}", chrono::Datelike::year(&chrono::Utc::now()), chrono::Datelike::year(&chrono::Utc::now()) + 1);
            conn.execute(
                "INSERT INTO AnneeScolaire (id, libelle, etablissement_id, date_debut, date_fin, active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)",
                params![new_annee_id, year_lbl, etab_id, "2026-09-01", "2027-07-01", now],
            )?;
            new_annee_id
        }
    };

    let peut_payer: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM Eleve el JOIN Etablissement et ON et.id = el.etablissement_id WHERE el.id = ?1 AND el.statut IN ('ACTIF', 'INSCRIT') AND el.etablissement_id = ?2 AND et.actif = 1)",
        params![eleve_id, etab_id],
        |r| r.get(0),
    ).unwrap_or(false);
    if !peut_payer {
        return Err(AppError::Validation("Paiement impossible : l'élève doit être actif et dépendre d'un établissement actif.".into()));
    }

    let valid_user_id = if !user_id.trim().is_empty() && user_id != "undefined" && user_id != "null" && conn.query_row("SELECT COUNT(*) > 0 FROM User WHERE id = ?", params![user_id], |r| r.get::<_, bool>(0)).unwrap_or(false) {
        user_id
    } else {
        conn.query_row("SELECT id FROM User LIMIT 1", [], |r| r.get::<_, String>(0)).unwrap_or_else(|_| "admin".to_string())
    };

    let ech_clean = match echeance_id {
        Some(ref e) if !e.trim().is_empty() && e != "undefined" && e != "null" => {
            if conn.query_row("SELECT COUNT(*) > 0 FROM Echeance WHERE id = ?", params![e], |r| r.get::<_, bool>(0)).unwrap_or(false) {
                Some(e.clone())
            } else {
                None
            }
        }
        _ => None,
    };

    let montant_affecte_val = montant_affecte.unwrap_or(montant);
    let devise_echeance_val = devise_echeance.unwrap_or_else(|| devise.clone());

    // Insert payment record with echeance_id.
    // En cas de collision sur le numero_recu (double-clic, ou course entre deux
    // insertions simultanées), on régénère un numéro et on réessaie au lieu
    // d'échouer — évite le rejet du paiement par la contrainte UNIQUE.
    let mut inserted = false;
    for attempt in 0..5 {
        let res = conn.execute(
            "INSERT INTO Paiement (id, eleve_id, echeance_id, etablissement_id, annee_scolaire_id, user_id, motif, montant, devise, montant_affecte, devise_echeance, mode_paiement, reference_paiement, taux_change, montant_original, numero_recu, annule, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, 0, ?17, ?17)",
            params![id, eleve_id, ech_clean, etab_id, final_annee_id, valid_user_id, motif, montant, devise, montant_affecte_val, devise_echeance_val, mode_paiement, reference_paiement, taux_change, montant_original, numero_recu, now],
        );
        match res {
            Ok(_) => {
                inserted = true;
                break;
            }
            Err(e) => {
                let is_unique_violation = matches!(
                    &e,
                    rusqlite::Error::SqliteFailure(ferr, _)
                        if ferr.code == rusqlite::ErrorCode::ConstraintViolation
                );
                if is_unique_violation && attempt < 4 {
                    numero_recu = generate_receipt_number(&conn);
                    continue;
                }
                return Err(e.into());
            }
        }
    }
    if !inserted {
        return Err(AppError::Database("Insertion du paiement impossible après plusieurs tentatives".into()));
    }

    // Update Echeance.montant_paye if echeance_id is provided
    if let Some(ref ech_id) = ech_clean {
        let _ = conn.execute(
            "UPDATE Echeance SET montant_paye = montant_paye + ?, updated_at = ? WHERE id = ?",
            params![montant_affecte_val, now, ech_id],
        );
    }

    drop(conn);
    log_audit(&db, None, "CREATE", "paiement", Some(&id), Some(&format!("n° recu={}, montant={}", numero_recu, montant)));

    let conn = db.lock()?;
    let result = conn.query_row(
        "SELECT p.id, p.numero_recu, p.eleve_id, p.echeance_id, p.etablissement_id, p.annee_scolaire_id,
                p.user_id, p.motif, p.montant, p.devise, p.montant_affecte, p.devise_echeance,
                p.mode_paiement, p.reference_paiement, p.taux_change, p.montant_original,
                p.annule, p.date_annulation, p.created_at, p.updated_at,
                TRIM(COALESCE(el.nom, '') || ' ' || COALESCE(el.prenom, '')) as eleve_nom,
                COALESCE(el.matricule, '—') as eleve_matricule,
                COALESCE(c.nom, '—') as classe_nom,
                COALESCE(u.nom_complet, 'Système') as user_nom_complet
         FROM Paiement p
         LEFT JOIN Eleve el ON p.eleve_id = el.id
         LEFT JOIN EleveClasse ec ON ec.eleve_id = el.id AND ec.statut = 'ACTIF'
         LEFT JOIN Classe c ON c.id = ec.classe_id
         LEFT JOIN User u ON p.user_id = u.id
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
                "caissierNom": row.get::<_, Option<String>>(23)?.unwrap_or_else(|| "Système".to_string()),
            }))
        },
    )?;

    Ok(api_response(Ok(result)))
}

#[tauri::command]
pub fn annuler_paiement(
    db: State<'_, DbConn>,
    id: String,
    user_id: String,
    motif: String,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let (already_annule, _eleve_id, montant, devise, numero_recu, echeance_id, montant_affecte_val): (bool, String, f64, String, String, Option<String>, Option<f64>) = conn
        .query_row(
            "SELECT annule, eleve_id, montant, devise, numero_recu, echeance_id, montant_affecte FROM Paiement WHERE id = ?",
            params![id],
            |row| {
                let annule_int: i32 = row.get(0)?;
                Ok((
                    annule_int != 0,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<f64>>(6)?,
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

    // Revert Echeance.montant_paye if linked to an echeance
    if let Some(ref ech_id) = echeance_id {
        if !ech_id.trim().is_empty() {
            let m_affecte = montant_affecte_val.unwrap_or(montant);
            let _ = conn.execute(
                "UPDATE Echeance SET montant_paye = MAX(0, montant_paye - ?), updated_at = ? WHERE id = ?",
                params![m_affecte, now, ech_id],
            );
        }
    }

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

#[tauri::command]
pub fn update_paiement(
    db: State<'_, DbConn>,
    id: String,
    motif: String,
    montant: f64,
    devise: String,
    mode_paiement: String,
    reference_paiement: Option<String>,
    taux_change: Option<f64>,
    montant_affecte: Option<f64>,
    devise_echeance: Option<String>,
) -> Result<serde_json::Value, AppError> {
    if !montant.is_finite() || montant <= 0.0 {
        return Err(AppError::Validation("Le montant du reçu doit être supérieur à zéro.".into()));
    }
    if motif.trim().is_empty() {
        return Err(AppError::Validation("Le motif du reçu est obligatoire.".into()));
    }
    if devise.trim().is_empty() {
        return Err(AppError::Validation("La devise du reçu est obligatoire.".into()));
    }
    if mode_paiement.trim().is_empty() {
        return Err(AppError::Validation("Le mode de paiement est obligatoire.".into()));
    }
    if (mode_paiement == "CHEQUE" || mode_paiement == "VIREMENT")
        && reference_paiement.as_deref().map(str::trim).unwrap_or("").is_empty()
    {
        return Err(AppError::Validation("La référence est obligatoire pour un chèque ou un virement.".into()));
    }
    let new_montant_affecte = montant_affecte.unwrap_or(montant);
    if !new_montant_affecte.is_finite() || new_montant_affecte <= 0.0 {
        return Err(AppError::Validation("Le montant imputé doit être supérieur à zéro.".into()));
    }
    if let Some(taux) = taux_change {
        if !taux.is_finite() || taux <= 0.0 {
            return Err(AppError::Validation("Le taux de change doit être supérieur à zéro.".into()));
        }
    }

    let mut conn = db.lock()?;
    let tx = conn.transaction()?;

    let (old_echeance_id, old_montant_affecte, old_montant, old_annule, old_numero_recu): (Option<String>, Option<f64>, f64, i32, String) = tx
        .query_row(
            "SELECT echeance_id, montant_affecte, montant, annule, numero_recu FROM Paiement WHERE id = ?",
            params![id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .map_err(|_| AppError::NotFound("Paiement introuvable".into()))?;

    if old_annule != 0 {
        return Err(AppError::BadRequest("Impossible de modifier un paiement annulé".into()));
    }

    let now = now_iso();
    let old_affecte_val = old_montant_affecte.unwrap_or(old_montant);

    if let Some(ref ech_id) = old_echeance_id {
        if !ech_id.trim().is_empty() {
            let difference = new_montant_affecte - old_affecte_val;
            if difference != 0.0 {
                tx.execute(
                    "UPDATE Echeance SET montant_paye = MAX(0, montant_paye + ?1), updated_at = ?2 WHERE id = ?3",
                    params![difference, now, ech_id],
                )?;
            }
        }
    }

    tx.execute(
        "UPDATE Paiement SET motif = ?1, montant = ?2, devise = ?3, mode_paiement = ?4, reference_paiement = ?5, taux_change = ?6, montant_affecte = ?7, devise_echeance = ?8, updated_at = ?9 WHERE id = ?10",
        params![
            motif.trim(),
            montant,
            devise.trim(),
            mode_paiement.trim(),
            reference_paiement,
            taux_change,
            new_montant_affecte,
            devise_echeance,
            now,
            id
        ],
    )?;

    tx.commit()?;
    drop(conn);

    log_audit(&db, None, "UPDATE", "paiement", Some(&id), Some(&format!("Modification du paiement n° {}, nouveau montant={} {}", old_numero_recu, montant, devise)));

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
    ).map_err(|_| AppError::NotFound(format!("Paiement {} introuvable après mise à jour", id)))?;

    Ok(api_response(Ok(result)))
}