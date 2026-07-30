// src/commands/eleves.rs
use crate::db::DbConn;
use crate::error::{AppError, api_response};
use crate::utils::audit_logger::log_audit;
use crate::utils::id::generate_id;
use rusqlite::params;
use serde::{Deserialize, Serialize};
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

fn generate_matricule(conn: &rusqlite::Connection, etablissement_id: &str) -> Result<String, AppError> {
    let year = chrono::Utc::now().format("%Y").to_string();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM Eleve WHERE etablissement_id = ? AND matricule LIKE ?",
        params![etablissement_id, format!("ELV-{}-%", year)],
        |row| row.get(0),
    )?;
    Ok(format!("ELV-{}-{:04}", year, count + 1))
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
            COALESCE(SUM(p.montant_affecte), 0) as montant_paye,
            CASE
                WHEN COALESCE(SUM(p.montant_affecte), 0) >= fa.montant THEN 'PAYE'
                WHEN COALESCE(SUM(p.montant_affecte), 0) = 0 THEN 'EN_ATTENTE'
                ELSE 'PARTIELLEMENT_PAYE'
            END as statut,
            fa.date_echeance,
            fa.libelle,
            fa.devise
        FROM frais_applicables fa
        LEFT JOIN Paiement p ON p.eleve_id = ?1
            AND p.motif = fa.libelle
            AND p.annule = 0
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
        matricule = generate_matricule(&conn, &data.etablissement_id)?;

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
            for t in tuteurs {
                let tid = generate_id();
                conn.execute(
                    "INSERT INTO Tuteur (id, nom, prenom, telephone, telephone2, relation, adresse, profession, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![tid, t.nom, t.prenom, t.telephone, t.telephone2,
                            t.relation, t.adresse, t.profession, now, now],
                )?;
                conn.execute(
                    "INSERT INTO TuteurEleve (eleve_id, tuteur_id, is_principal, created_at) VALUES (?1, ?2, ?3, ?4)",
                    params![id, tid, t.is_principal.unwrap_or(false) as i32, now],
                )?;
            }
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

       // Changement de classe (uniquement si la classe est différente de l'actuelle)
        if let Some(new_classe) = &data.classe_id {
            let already_in_class: bool = conn.query_row(
                "SELECT COUNT(*) > 0 FROM EleveClasse WHERE eleve_id = ? AND classe_id = ? AND statut = 'ACTIF'",
                params![id, new_classe],
                |row| row.get(0),
            )?;

            if !already_in_class {
                conn.execute(
                    "UPDATE EleveClasse SET statut = 'TRANSFERE', date_sortie = ? WHERE eleve_id = ? AND statut = 'ACTIF'",
                    params![now, id],
                )?;
                conn.execute(
                    "INSERT INTO EleveClasse (eleve_id, classe_id, statut, date_inscription) VALUES (?1, ?2, 'ACTIF', ?3)",
                    params![id, new_classe, now],
                )?;
            }
        }

        if let Some(tuteurs) = &data.tuteurs {
            for t in tuteurs {
                let tid = generate_id();
                conn.execute(
                    "INSERT INTO Tuteur (id, nom, prenom, telephone, telephone2, relation, adresse, profession, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![tid, t.nom, t.prenom, t.telephone, t.telephone2,
                            t.relation, t.adresse, t.profession, now, now],
                )?;
                conn.execute(
                    "INSERT INTO TuteurEleve (eleve_id, tuteur_id, is_principal, created_at) VALUES (?1, ?2, ?3, ?4)",
                    params![id, tid, t.is_principal.unwrap_or(false) as i32, now],
                )?;
            }
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
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;
    let mut base_cond = "statut != 'TRANSFERE'".to_string();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

    if let Some(ref v) = etablissement_id {
        base_cond.push_str(" AND etablissement_id = ?");
        params.push(Box::new(v.clone()));
    }

    let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let total: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM Eleve WHERE {}", base_cond), refs.as_slice(), |r| r.get(0))?;
    let actifs: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM Eleve WHERE {} AND statut='ACTIF'", base_cond), refs.as_slice(), |r| r.get(0))?;

    let mut new_params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];
    if let Some(ref v) = etablissement_id {
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