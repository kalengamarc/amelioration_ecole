// src/commands/eleves.rs
use crate::db::DbConn;
use crate::error::{AppError, api_response};
use crate::utils::audit_logger::log_audit;
use crate::utils::id::{generate_id, generate_matricule};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::State;

// ─── Types de réponse (camelCase) ──────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EleveResponse {
    pub id: String,
    pub matricule: String,
    pub nom: String,
    pub prenom: String,
    pub sexe: String,
    pub date_naissance: Option<String>,
    pub lieu_naissance: Option<String>,
    pub statut: String,
    pub etablissement_id: String,
    pub annee_scolaire_id: Option<String>,
    pub created_at: String,
    pub etablissement: Option<EtablissementRef>,
    pub classes: Vec<InscriptionRef>,
    pub inscriptions: Vec<InscriptionRef>,
    pub tuteurs: Vec<TuteurEleveRef>,
    pub echeances: Vec<EcheanceRef>,
    pub paiements: Vec<PaiementRef>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EtablissementRef {
    pub id: String,
    pub nom: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InscriptionRef {
    pub id: String,
    pub classe_id: String,
    pub statut: String,
    pub date_inscription: String,
    pub classe: Option<ClasseRef>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClasseRef {
    pub id: String,
    pub nom: String,
    pub niveau: String,
    pub annee_scolaire: Option<AnneeRef>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnneeRef {
    pub id: String,
    pub libelle: String,
    pub active: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TuteurEleveRef {
    pub tuteur: TuteurRef,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TuteurRef {
    pub id: String,
    pub nom: String,
    pub prenom: String,
    pub telephone: String,
    pub telephone2: Option<String>,
    pub relation: Option<String>,
    pub adresse: Option<String>,
    pub profession: Option<String>,
    pub is_principal: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EcheanceRef {
    pub id: String,
    pub montant_du: f64,
    pub montant_paye: f64,
    pub statut: String,
    pub date_echeance: Option<String>,
    pub frais_scolaire: Option<FraisRef>,
    pub restant: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FraisRef {
    pub libelle: String,
    pub devise: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PaiementRef {
    pub id: String,
    pub numero_recu: Option<String>,
    pub motif: String,
    pub montant: f64,
    pub devise: String,
    pub mode_paiement: String,
    pub annule: bool,
    pub created_at: String,
}

// ─── Types d'entrée (camelCase) ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEleveInput {
    pub nom: String,
    pub prenom: String,
    pub sexe: String,
    pub date_naissance: Option<String>,
    pub lieu_naissance: Option<String>,
    pub etablissement_id: String,
    pub annee_scolaire_id: String,
    pub classe_id: String,
    pub tuteurs: Option<Vec<TuteurInput>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TuteurInput {
    pub nom: String,
    pub prenom: String,
    pub telephone: String,
    pub telephone2: Option<String>,
    pub relation: Option<String>,
    pub adresse: Option<String>,
    pub profession: Option<String>,
    pub is_principal: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEleveInput {
    pub nom: Option<String>,
    pub prenom: Option<String>,
    pub sexe: Option<String>,
    pub date_naissance: Option<String>,
    pub lieu_naissance: Option<String>,
    pub classe_id: Option<String>,
    pub tuteurs: Option<Vec<TuteurInput>>,
}

// ─── Fonctions utilitaires ──────────────────────────────────────────────────

// NOTE : le générateur de matricule vit dans src-tauri/src/utils/id.rs
// (generate_matricule). Il intègre un code machine persistant pour éviter
// les collisions entre machines sur la clé unique Eleve.matricule.

/// Réconcilie les tuteurs d'un élève avec la liste reçue du formulaire.
///
/// Avant : chaque édition d'un élève SUPPRIMAIT tous les liens TuteurEleve puis
/// recréait des lignes Tuteur avec de nouveaux UUID. Résultat : doublons de
/// tuteurs, orphelins, et à chaque synchro le push renvoyait des tuteurs neufs.
///
/// Maintenant : un tuteur existant est réutilisé par numéro de téléphone (et
/// ses champs sont mis à jour), les liens sont créés/supprimés différemment,
/// et is_principal est synchronisé. Les IDs restent stables entre machines.
fn reconcile_tuteurs_for_eleve(
    conn: &rusqlite::Connection,
    eleve_id: &str,
    tuteurs: &[TuteurInput],
    now: &str,
) -> Result<(), AppError> {
    // Liens existants (tuteur_id, is_principal)
    let mut existing: Vec<(String, i32)> = Vec::new();
    {
        let mut stmt = conn.prepare("SELECT tuteur_id, is_principal FROM TuteurEleve WHERE eleve_id = ?")?;
        let rows = stmt.query_map([eleve_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i32>(1)?)))?;
        for r in rows {
            existing.push(r?);
        }
    }

    let mut kept: HashSet<String> = HashSet::new();

    for t in tuteurs {
        let nom = t.nom.trim();
        let prenom = t.prenom.trim();
        let tel = t.telephone.trim();
        let tel_norm = tel.replace(' ', "");
        let tel_lower = tel_norm.to_lowercase();
        // Le formulaire envoie 'Non renseigné' quand aucun téléphone n'est saisi.
        // Un tel "téléphone" ne permet PAS d'identifier un tuteur : le dédupliquer
        // fusionnerait tous les parents sans téléphone en un seul tuteur.
        let has_real_phone = !tel_norm.is_empty()
            && tel_lower != "nonrenseigné"
            && tel_lower != "nonrenseigne";

        // Réutiliser un tuteur existant ayant le même téléphone normalisé
        // (le numéro est l'identifiant naturel du parent/tuteur).
        let tuteur_id: Option<String> = if has_real_phone {
            conn.query_row(
                "SELECT id FROM Tuteur WHERE REPLACE(COALESCE(telephone, ''), ' ', '') = ?1 LIMIT 1",
                [&tel_norm],
                |r| r.get(0),
            )
            .ok()
        } else {
            None
        };

        let tuteur_id = match tuteur_id {
            Some(id) => {
                // Mettre à jour les informations du tuteur existant
                conn.execute(
                    "UPDATE Tuteur SET nom = ?1, prenom = ?2, telephone = ?3, telephone2 = ?4, \
                     relation = ?5, adresse = ?6, profession = ?7, updated_at = ?8 WHERE id = ?9",
                    params![nom, prenom, tel, t.telephone2.as_deref(), t.relation.as_deref(),
                            t.adresse.as_deref(), t.profession.as_deref(), now, id],
                )?;
                id
            }
            None => {
                let id = generate_id();
                conn.execute(
                    "INSERT INTO Tuteur (id, nom, prenom, telephone, telephone2, relation, adresse, profession, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![id, nom, prenom, tel, t.telephone2.as_deref(), t.relation.as_deref(),
                            t.adresse.as_deref(), t.profession.as_deref(), now, now],
                )?;
                id
            }
        };

        let is_principal = t.is_principal.unwrap_or(false) as i32;

        if existing.iter().any(|(eid, _)| *eid == tuteur_id) {
            conn.execute(
                "UPDATE TuteurEleve SET is_principal = ?1 WHERE eleve_id = ?2 AND tuteur_id = ?3",
                params![is_principal, eleve_id, tuteur_id],
            )?;
        } else {
            conn.execute(
                "INSERT INTO TuteurEleve (eleve_id, tuteur_id, is_principal, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![eleve_id, tuteur_id, is_principal, now],
            )?;
        }
        kept.insert(tuteur_id);
    }

    // Supprimer uniquement les liens qui ne sont plus dans la liste
    for (tuteur_id, _) in existing {
        if !kept.contains(&tuteur_id) {
            conn.execute(
                "DELETE FROM TuteurEleve WHERE eleve_id = ?1 AND tuteur_id = ?2",
                params![eleve_id, tuteur_id],
            )?;
        }
    }

    Ok(())
}

fn fetch_inscriptions(conn: &rusqlite::Connection, eleve_id: &str) -> Result<Vec<InscriptionRef>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT ec.eleve_id, ec.classe_id, ec.statut, ec.date_inscription,
                c.id, c.nom, c.niveau, a.id, a.libelle, a.active
         FROM EleveClasse ec
         JOIN Classe c ON c.id = ec.classe_id
         JOIN AnneeScolaire a ON a.id = c.annee_scolaire_id
         WHERE ec.eleve_id = ?"
    )?;
    let rows = stmt.query_map(params![eleve_id], |row| {
        Ok(InscriptionRef {
            id: row.get::<_, String>(0)?,
            classe_id: row.get::<_, String>(1)?,
            statut: row.get::<_, String>(2)?,
            date_inscription: row.get::<_, String>(3)?,
            classe: Some(ClasseRef {
                id: row.get::<_, String>(4)?,
                nom: row.get::<_, String>(5)?,
                niveau: row.get::<_, String>(6)?,
                annee_scolaire: Some(AnneeRef {
                    id: row.get::<_, String>(7)?,
                    libelle: row.get::<_, String>(8)?,
                    active: row.get::<_, i32>(9)? != 0,
                }),
            }),
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn fetch_tuteurs(conn: &rusqlite::Connection, eleve_id: &str) -> Result<Vec<TuteurEleveRef>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.nom, t.prenom, t.telephone, t.telephone2,
                t.relation, t.adresse, t.profession, te.is_principal
         FROM Tuteur t
         JOIN TuteurEleve te ON te.tuteur_id = t.id
         WHERE te.eleve_id = ?"
    )?;
    let rows = stmt.query_map(params![eleve_id], |row| {
        Ok(TuteurEleveRef {
            tuteur: TuteurRef {
                id: row.get::<_, String>(0)?,
                nom: row.get::<_, String>(1)?,
                prenom: row.get::<_, String>(2)?,
                telephone: row.get::<_, String>(3)?,
                telephone2: row.get::<_, Option<String>>(4)?,
                relation: row.get::<_, Option<String>>(5)?,
                adresse: row.get::<_, Option<String>>(6)?,
                profession: row.get::<_, Option<String>>(7)?,
                is_principal: row.get::<_, i32>(8)? != 0,
            },
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    eprintln!("DEBUG: Tuteurs for eleve_id {}: {:?}", eleve_id, rows);
    Ok(rows)
}

fn fetch_echeances(conn: &rusqlite::Connection, eleve_id: &str) -> Result<Vec<EcheanceRef>, AppError> {
    let mut stmt = conn.prepare(
        r#"
        WITH frais_applicables AS (
            -- Frais liés à la classe de l'élève
            SELECT fs.id, fs.montant, fs.libelle, fs.devise, fs.date_echeance
            FROM FraisScolaire fs
            JOIN FraisClasse fc ON fc.frais_scolaire_id = fs.id
            JOIN EleveClasse ec ON ec.classe_id = fc.classe_id AND ec.eleve_id = ?1 AND ec.statut = 'ACTIF'
            WHERE fs.actif = 1
            UNION
            -- Frais globaux (sans lien avec une classe)
            SELECT fs.id, fs.montant, fs.libelle, fs.devise, fs.date_echeance
            FROM FraisScolaire fs
            WHERE fs.actif = 1
              AND NOT EXISTS (SELECT 1 FROM FraisClasse WHERE frais_scolaire_id = fs.id)
        )
        SELECT
            fa.id,
            fa.montant,
            COALESCE(SUM(COALESCE(p.montant_affecte, p.montant)), 0) as montant_paye,
            CASE
                WHEN COALESCE(SUM(COALESCE(p.montant_affecte, p.montant)), 0) >= fa.montant THEN 'PAYE'
                WHEN COALESCE(SUM(COALESCE(p.montant_affecte, p.montant)), 0) = 0 THEN 'EN_ATTENTE'
                ELSE 'PARTIELLEMENT_PAYE'
            END as statut,
            fa.date_echeance,
            fa.libelle,
            fa.devise
        FROM frais_applicables fa
        LEFT JOIN Paiement p ON p.eleve_id = ?1
            AND COALESCE(p.annule, 0) = 0
            AND (
                p.echeance_id = fa.id
                OR (
                    (p.echeance_id IS NULL OR TRIM(p.echeance_id) = '')
                    AND p.motif = fa.libelle
                    AND UPPER(COALESCE(NULLIF(TRIM(p.devise), ''), 'CDF')) = UPPER(COALESCE(NULLIF(TRIM(fa.devise), ''), 'CDF'))
                )
            )
        GROUP BY fa.id
        ORDER BY fa.date_echeance
        "#
    )?;

    let rows = stmt.query_map(params![eleve_id], |row| {
        let montant_du: f64 = row.get(1)?;
        let montant_paye: f64 = row.get(2)?;
        Ok(EcheanceRef {
            id: row.get(0)?,
            montant_du,
            montant_paye,
            statut: row.get(3)?,
            date_echeance: row.get(4)?,
            frais_scolaire: Some(FraisRef {
                libelle: row.get(5)?,
                devise: row.get(6)?,
            }),
            restant: montant_du - montant_paye,
        })
    })?;

    let mut echeances = Vec::new();
    for r in rows {
        echeances.push(r?);
    }
    Ok(echeances)
}

fn fetch_paiements(conn: &rusqlite::Connection, eleve_id: &str) -> Result<Vec<PaiementRef>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, numero_recu, motif, montant, devise, mode_paiement, annule, created_at
         FROM Paiement WHERE eleve_id = ? ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map(params![eleve_id], |row| {
        Ok(PaiementRef {
            id: row.get::<_, String>(0)?,
            numero_recu: row.get::<_, Option<String>>(1)?,
            motif: row.get::<_, String>(2)?,
            montant: row.get::<_, f64>(3)?,
            devise: row.get::<_, String>(4)?,
            mode_paiement: row.get::<_, String>(5)?,
            annule: row.get::<_, i32>(6)? != 0,
            created_at: row.get::<_, String>(7)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn build_eleve_response(
    conn: &rusqlite::Connection,
    id: &str,
    matricule: &str,
    nom: &str,
    prenom: &str,
    sexe: &str,
    date_naissance: &Option<String>,
    lieu_naissance: &Option<String>,
    statut: &str,
    etablissement_id: &str,
    annee_scolaire_id: &Option<String>,
    created_at: &str,
) -> Result<EleveResponse, AppError> {
    let etab = conn.query_row(
        "SELECT id, nom FROM Etablissement WHERE id = ?",
        params![etablissement_id],
        |row| {
            Ok(EtablissementRef {
                id: row.get::<_, String>(0)?,
                nom: row.get::<_, String>(1)?,
            })
        },
    ).ok();

    let inscriptions = fetch_inscriptions(conn, id)?;
    let tuteurs = fetch_tuteurs(conn, id)?;
    let echeances = fetch_echeances(conn, id)?;
    let paiements = fetch_paiements(conn, id)?;

    Ok(EleveResponse {
        id: id.to_string(),
        matricule: matricule.to_string(),
        nom: nom.to_string(),
        prenom: prenom.to_string(),
        sexe: sexe.to_string(),
        date_naissance: date_naissance.clone(),
        lieu_naissance: lieu_naissance.clone(),
        statut: statut.to_string(),
        etablissement_id: etablissement_id.to_string(),
        annee_scolaire_id: annee_scolaire_id.clone(),
        created_at: created_at.to_string(),
        etablissement: etab,
        classes: inscriptions.clone(),
        inscriptions,
        tuteurs,
        echeances,
        paiements,
    })
}

// ─── Commandes Tauri ────────────────────────────────────────────────────────
// (list_eleves, get_eleve, create_eleve, update_eleve, delete_eleve, get_eleve_stats inchangées)
// ...

#[tauri::command]
pub fn list_eleves(
    db: State<'_, DbConn>,
    etablissement_id: Option<String>,
    annee_scolaire_id: Option<String>,
    classe_id: Option<String>,
    statut: Option<String>,
    search: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;
    let page = page.unwrap_or(1).max(1);
    let limit = limit.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * limit;

    let mut conditions = vec!["1=1".to_string()];
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    // Population opérationnelle : seuls les élèves pouvant actuellement payer
    // sont affichés par défaut. Le statut TRANSFERE reste consultable explicitement.
    if statut.as_deref() != Some("TRANSFERE") {
        conditions.push("e.statut IN ('ACTIF', 'INSCRIT')".into());
        conditions.push("EXISTS (SELECT 1 FROM Etablissement ea WHERE ea.id = e.etablissement_id AND ea.actif = 1)".into());
        // Suppression de la condition exigeant une classe active pour afficher tous les élèves
    }

    if let Some(ref v) = etablissement_id {
        conditions.push("e.etablissement_id = ?".into());
        params_vec.push(Box::new(v.clone()));
    }
    if let Some(ref v) = annee_scolaire_id {
        conditions.push("e.annee_scolaire_id = ?".into());
        params_vec.push(Box::new(v.clone()));
    }
    if let Some(ref v) = classe_id {
        conditions.push("e.id IN (SELECT eleve_id FROM EleveClasse WHERE statut='ACTIF' AND classe_id=?)".into());
        params_vec.push(Box::new(v.clone()));
    }
    if let Some(ref v) = statut {
        if v == "TRANSFERE" {
            conditions.push("e.statut = 'TRANSFERE'".into());
        } else {
            conditions.push("e.statut != 'TRANSFERE'".into());
            if v != "ALL" {
                conditions.push("e.statut = ?".into());
                params_vec.push(Box::new(v.clone()));
            }
        }
    } else {
        conditions.push("e.statut != 'TRANSFERE'".into());
    }
    if let Some(ref s) = search {
        conditions.push("(e.nom LIKE ? OR e.prenom LIKE ? OR e.matricule LIKE ?)".into());
        let pattern = format!("%{}%", s);
        params_vec.push(Box::new(pattern.clone()));
        params_vec.push(Box::new(pattern.clone()));
        params_vec.push(Box::new(pattern));
    }

    let where_clause = conditions.join(" AND ");

    let count_sql = format!("SELECT COUNT(*) FROM Eleve e WHERE {}", where_clause);
    let count_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let total: i64 = conn.query_row(&count_sql, count_refs.as_slice(), |row| row.get(0))?;
    let total_pages = (total + limit - 1) / limit;

    let data_sql = format!(
        "SELECT e.id, e.matricule, e.nom, e.prenom, e.sexe,
                e.date_naissance, e.lieu_naissance, e.statut,
                e.etablissement_id, e.annee_scolaire_id, e.created_at
         FROM Eleve e WHERE {} ORDER BY e.nom, e.prenom LIMIT ? OFFSET ?",
        where_clause
    );
    let mut data_params = params_vec;
    data_params.push(Box::new(limit));
    data_params.push(Box::new(offset));
    let data_refs: Vec<&dyn rusqlite::types::ToSql> = data_params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&data_sql)?;
    let eleves = stmt.query_map(data_refs.as_slice(), |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, Option<String>>(9)?,
            row.get::<_, String>(10)?,
        ))
    })?.collect::<Result<Vec<_>, _>>()?;

    let mut result = Vec::new();
    for (id, matricule, nom, prenom, sexe, date_naissance, lieu_naissance, statut,
         etab_id, annee_id, created_at) in eleves {
        let resp = build_eleve_response(&conn, &id, &matricule, &nom, &prenom, &sexe,
            &date_naissance, &lieu_naissance, &statut, &etab_id, &annee_id, &created_at)?;
        result.push(resp);
    }

    Ok(serde_json::json!({
        "success": true,
        "data": result,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "totalPages": total_pages,
        }
    }))
}

#[tauri::command]
pub fn get_eleve(db: State<'_, DbConn>, id: String) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;
    let row = conn.query_row(
        "SELECT id, matricule, nom, prenom, sexe, date_naissance, lieu_naissance, statut,
                etablissement_id, annee_scolaire_id, created_at
         FROM Eleve WHERE id = ?",
        params![id],
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, Option<String>>(9)?,
            row.get::<_, String>(10)?,
        )),
    ).map_err(|_| AppError::NotFound("Élève introuvable".into()))?;

    let (eleve_id, matricule, nom, prenom, sexe, date_naissance, lieu_naissance, statut,
         etablissement_id, annee_scolaire_id, created_at) = row;

    let resp = build_eleve_response(&conn, &eleve_id, &matricule, &nom, &prenom, &sexe,
        &date_naissance, &lieu_naissance, &statut, &etablissement_id, &annee_scolaire_id, &created_at)?;

    Ok(api_response(Ok(resp)))
}

#[tauri::command]
pub fn create_eleve(
    db: State<'_, DbConn>,
    data: CreateEleveInput,
) -> Result<serde_json::Value, AppError> {
    let id = generate_id();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let matricule;

    {
        let conn = db.lock()?;
        matricule = generate_matricule(&conn);

        // Vérifications
        let etab_exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM Etablissement WHERE id = ? AND actif = 1",
            params![data.etablissement_id],
            |r| r.get(0),
        )?;
        if !etab_exists {
            return Err(AppError::Validation("Établissement introuvable ou inactif".into()));
        }
        let annee_exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM AnneeScolaire WHERE id = ? AND active = 1",
            params![data.annee_scolaire_id],
            |r| r.get(0),
        )?;
        if !annee_exists {
            return Err(AppError::Validation("Année scolaire introuvable ou inactive".into()));
        }
        let classe_ok: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM Classe WHERE id = ? AND actif = 1 AND etablissement_id = ? AND annee_scolaire_id = ?",
            params![data.classe_id, data.etablissement_id, data.annee_scolaire_id],
            |r| r.get(0),
        )?;
        if !classe_ok {
            return Err(AppError::Validation("Classe introuvable, inactive ou ne correspond pas à l'établissement/année".into()));
        }

        conn.execute(
            "INSERT INTO Eleve (id, matricule, nom, prenom, sexe, date_naissance, lieu_naissance, statut, etablissement_id, annee_scolaire_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'INSCRIT', ?8, ?9, ?10, ?11)",
            params![id, matricule, data.nom, data.prenom, data.sexe,
                    data.date_naissance, data.lieu_naissance,
                    data.etablissement_id, data.annee_scolaire_id, now, now],
        )?;
        conn.execute(
            "INSERT INTO EleveClasse (eleve_id, classe_id, statut, date_inscription) VALUES (?1, ?2, 'ACTIF', ?3)",
            params![id, data.classe_id, now],
        )?;

        if let Some(tuteurs) = &data.tuteurs {
            reconcile_tuteurs_for_eleve(&conn, &id, tuteurs, &now)?;
        }
    }

    let resp = {
        let conn = db.lock()?;
        build_eleve_response(&conn, &id, &matricule, &data.nom, &data.prenom, &data.sexe,
            &data.date_naissance, &data.lieu_naissance, &"INSCRIT".to_string(),
            &data.etablissement_id, &Some(data.annee_scolaire_id.clone()), &now)?
    };

    log_audit(&db, None, "CREATE", "eleve", Some(&id), Some(&format!("matricule={}", matricule)));
    Ok(api_response(Ok(resp)))
}

#[tauri::command]
pub fn update_eleve(
    db: State<'_, DbConn>,
    id: String,
    data: UpdateEleveInput,
) -> Result<serde_json::Value, AppError> {
    let response;
    {
        let conn = db.lock()?;
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

        let row_data: (String, String, String, String, Option<String>, Option<String>, String, String, Option<String>, String) =
            conn.query_row(
                "SELECT matricule, nom, prenom, sexe, date_naissance, lieu_naissance, statut,
                        etablissement_id, annee_scolaire_id, created_at
                 FROM Eleve WHERE id = ?",
                params![id],
                |row| Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, String>(9)?,
                )),
            ).map_err(|_| AppError::NotFound("Élève introuvable".into()))?;

        let (matricule, nom_old, prenom_old, sexe_old, date_naissance_old, lieu_naissance_old, statut_old,
             etablissement_id, annee_scolaire_id, created_at) = row_data;

        let mut sets = vec!["updated_at = ?".to_string()];
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now.clone())];

        if let Some(ref v) = data.nom { sets.push("nom = ?".into()); params.push(Box::new(v.clone())); }
        if let Some(ref v) = data.prenom { sets.push("prenom = ?".into()); params.push(Box::new(v.clone())); }
        if let Some(ref v) = data.sexe { sets.push("sexe = ?".into()); params.push(Box::new(v.clone())); }
        if let Some(ref v) = data.date_naissance { sets.push("date_naissance = ?".into()); params.push(Box::new(v.clone())); }
        if let Some(ref v) = data.lieu_naissance { sets.push("lieu_naissance = ?".into()); params.push(Box::new(v.clone())); }

        if sets.len() > 1 {
            params.push(Box::new(id.clone()));
            let sql = format!("UPDATE Eleve SET {} WHERE id = ?", sets.join(", "));
            let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
            conn.execute(&sql, refs.as_slice())?;
        }

       // Changement de classe (uniquement si la classe est différente de l'actuelle et existe)
        if let Some(new_classe) = &data.classe_id {
            if !new_classe.trim().is_empty() && new_classe != "undefined" && new_classe != "null" {
                let classe_exists: bool = conn.query_row(
                    "SELECT COUNT(*) > 0 FROM Classe WHERE id = ?",
                    params![new_classe],
                    |row| row.get(0),
                ).unwrap_or(false);

                if classe_exists {
                    // Mettre également à jour annee_scolaire_id sur la fiche élève d'après la classe
                    if let Ok(new_annee_id) = conn.query_row("SELECT annee_scolaire_id FROM Classe WHERE id = ?", params![new_classe], |r| r.get::<_, String>(0)) {
                        let _ = conn.execute("UPDATE Eleve SET annee_scolaire_id = ?, updated_at = ? WHERE id = ?", params![new_annee_id, now, id]);
                    }

                    let already_in_class: bool = conn.query_row(
                        "SELECT COUNT(*) > 0 FROM EleveClasse WHERE eleve_id = ? AND classe_id = ? AND statut = 'ACTIF'",
                        params![id, new_classe],
                        |row| row.get(0),
                    ).unwrap_or(false);

                    if !already_in_class {
                        conn.execute(
                            "UPDATE EleveClasse SET statut = 'TRANSFERE', date_sortie = ? WHERE eleve_id = ? AND statut = 'ACTIF'",
                            params![now, id],
                        )?;
                        conn.execute(
                            "INSERT INTO EleveClasse (eleve_id, classe_id, statut, date_inscription, date_sortie) VALUES (?1, ?2, 'ACTIF', ?3, NULL) \
                             ON CONFLICT(eleve_id, classe_id) DO UPDATE SET statut = 'ACTIF', date_inscription = ?3, date_sortie = NULL",
                            params![id, new_classe, now],
                        )?;
                    }
                }
            }
        }

        if let Some(tuteurs) = &data.tuteurs {
            reconcile_tuteurs_for_eleve(&conn, &id, tuteurs, &now)?;
        }

        let new_nom = data.nom.unwrap_or(nom_old);
        let new_prenom = data.prenom.unwrap_or(prenom_old);
        let new_sexe = data.sexe.unwrap_or(sexe_old);
        let new_dn = data.date_naissance.or(date_naissance_old);
        let new_ln = data.lieu_naissance.or(lieu_naissance_old);

        response = build_eleve_response(&conn, &id, &matricule, &new_nom, &new_prenom, &new_sexe,
            &new_dn, &new_ln, &statut_old, &etablissement_id, &annee_scolaire_id, &created_at)?;
    }

    log_audit(&db, None, "UPDATE", "eleve", Some(&id), None);
    Ok(api_response(Ok(response)))
}

#[tauri::command]
pub fn delete_eleve(db: State<'_, DbConn>, id: String) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE Eleve SET statut='TRANSFERE', updated_at=? WHERE id=?",
        params![now, id],
    )?;
    drop(conn);
    log_audit(&db, None, "DELETE", "eleve", Some(&id), None);
    Ok(api_response(Ok(serde_json::json!({"deleted": true}))))
}

#[tauri::command]
pub fn get_eleve_stats(
    db: State<'_, DbConn>,
    etablissement_id: Option<String>,
    annee_scolaire_id: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;
    let mut base_cond = "statut != 'TRANSFERE'".to_string();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

    if let Some(ref v) = etablissement_id {
        base_cond.push_str(" AND etablissement_id = ?");
        params.push(Box::new(v.clone()));
    }
    if let Some(ref v) = annee_scolaire_id {
        base_cond.push_str(" AND annee_scolaire_id = ?");
        params.push(Box::new(v.clone()));
    }

    let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let total: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM Eleve WHERE {}", base_cond), refs.as_slice(), |r| r.get(0))?;
    let actifs: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM Eleve WHERE {} AND statut='ACTIF'", base_cond), refs.as_slice(), |r| r.get(0))?;

    let mut new_params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];
    if let Some(ref v) = etablissement_id {
        new_params.push(Box::new(v.clone()));
    }
    if let Some(ref v) = annee_scolaire_id {
        new_params.push(Box::new(v.clone()));
    }
    let debut = chrono::Local::now().format("%Y-%m-01").to_string();
    new_params.push(Box::new(debut));
    let new_refs: Vec<&dyn rusqlite::types::ToSql> = new_params.iter().map(|p| p.as_ref()).collect();
    let nouveaux: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM Eleve WHERE {} AND created_at >= ?", base_cond),
        new_refs.as_slice(), |r| r.get(0))?;

    Ok(serde_json::json!({
        "success": true,
        "total": total,
        "actifs": actifs,
        "retard": 0,
        "nouveaux": nouveaux,
    }))
}

#[tauri::command]
pub fn pull_students_by_matricules(
    db: State<'_, DbConn>,
    matricules: Vec<String>,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    // Charger la configuration Supabase
    let supabase_url = std::env::var("SUPABASE_URL").map_err(|_| AppError::Internal("SUPABASE_URL non défini".into()))?;
    let supabase_key = std::env::var("SUPABASE_KEY").map_err(|_| AppError::Internal("SUPABASE_KEY non défini".into()))?;

    let client = reqwest::blocking::Client::new();
    let mut pulled_count = 0;
    let mut errors: Vec<String> = vec![];

    // Récupérer les élèves par lots de 50 matricules
    for chunk in matricules.chunks(50) {
        let matricule_filter = chunk.iter()
            .map(|m| format!("matricule.eq.{}", m))
            .collect::<Vec<_>>()
            .join(",");

        let url = format!("{}/rest/v1/Eleve?{}", supabase_url, matricule_filter);

        match client.get(&url)
            .header("apikey", &supabase_key)
            .header("Authorization", &format!("Bearer {}", supabase_key))
            .send()
        {
            Ok(resp) => {
                if resp.status().is_success() {
                    if let Ok(students) = resp.json::<Vec<serde_json::Value>>() {
                        for student in students {
                            if let Some(obj) = student.as_object() {
                                let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
                                let matricule = obj.get("matricule").and_then(|v| v.as_str()).unwrap_or("");
                                let nom = obj.get("nom").and_then(|v| v.as_str()).unwrap_or("");
                                let prenom = obj.get("prenom").and_then(|v| v.as_str()).unwrap_or("");
                                let sexe = obj.get("sexe").and_then(|v| v.as_str()).unwrap_or("M");
                                let date_naissance = obj.get("date_naissance").and_then(|v| v.as_str());
                                let lieu_naissance = obj.get("lieu_naissance").and_then(|v| v.as_str());
                                let statut = obj.get("statut").and_then(|v| v.as_str()).unwrap_or("INSCRIT");
                                let etablissement_id = obj.get("etablissement_id").and_then(|v| v.as_str());
                                let annee_scolaire_id = obj.get("annee_scolaire_id").and_then(|v| v.as_str());
                                let created_at = obj.get("created_at").and_then(|v| v.as_str());
                                let updated_at = obj.get("updated_at").and_then(|v| v.as_str());

                                // Vérifier si l'élève existe déjà
                                let exists: bool = conn.query_row(
                                    "SELECT COUNT(*) > 0 FROM Eleve WHERE matricule = ?",
                                    params![matricule],
                                    |r| r.get(0),
                                ).unwrap_or(false);

                                if !exists {
                                    if let (Some(etab_id), Some(annee_id)) = (etablissement_id, annee_scolaire_id) {
                                        match conn.execute(
                                            "INSERT INTO Eleve (id, matricule, nom, prenom, sexe, date_naissance, lieu_naissance, statut, etablissement_id, annee_scolaire_id, created_at, updated_at)
                                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                                            params![id, matricule, nom, prenom, sexe, date_naissance, lieu_naissance, statut, etab_id, annee_id, created_at, updated_at],
                                        ) {
                                            Ok(_) => pulled_count += 1,
                                            Err(e) => errors.push(format!("{}: {}", matricule, e)),
                                        }
                                    } else {
                                        errors.push(format!("{}: etablissement_id ou annee_scolaire_id manquant", matricule));
                                    }
                                }
                            }
                        }
                    }
                } else {
                    errors.push(format!("Erreur HTTP: {}", resp.status()));
                }
            }
            Err(e) => errors.push(format!("Erreur réseau: {}", e)),
        }
    }

    drop(conn);

    Ok(serde_json::json!({
        "success": true,
        "pulled": pulled_count,
        "errors": errors
    }))
}