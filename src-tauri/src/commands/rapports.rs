use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::db::DbConn;
use crate::error::{api_response, AppError};

/* ────────────────────────────────────────────────────────────────────────────
 * PRINCIPE : AUCUNE CONVERSION
 *
 * `SUM(montant)` sans `GROUP BY devise` additionne 20 000 CDF et 180 USD en
 * « 20 180 », affiché ensuite dans une devise arbitraire. Chaque agrégat est
 * donc ventilé par devise ; les comptages d'élèves restent des scalaires.
 * ──────────────────────────────────────────────────────────────────────────*/

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoisDeviseMontant {
    pub mois: String,
    pub devise: String,
    pub total: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoldeDevise {
    pub devise: String,
    pub encaissements: f64,
    pub depenses: f64,
    pub solde: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RapportFinancier {
    /// Encaissements par mois ET par devise.
    pub encaissements: Vec<MoisDeviseMontant>,
    /// Dépenses par mois ET par devise.
    pub depenses: Vec<MoisDeviseMontant>,
    /// Totaux et solde, une entrée par devise.
    pub soldes: Vec<SoldeDevise>,
    /// Devises rencontrées, pour piloter l'affichage.
    pub devises: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatutCount {
    pub statut: String,
    pub count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SexeCount {
    pub sexe: String,
    pub count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClasseCount {
    pub classe_nom: String,
    pub count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RapportEleves {
    pub par_statut: Vec<StatutCount>,
    pub par_sexe: Vec<SexeCount>,
    pub par_classe: Vec<ClasseCount>,
    pub total: i64,
}

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────────*/

/// Normalise le code devise : `NULL` / vide → `CDF`.
fn dev(col: &str) -> String {
    format!("UPPER(COALESCE(NULLIF(TRIM({col}), ''), 'CDF'))")
}

fn column_exists(conn: &rusqlite::Connection, table: &str, column: &str) -> bool {
    let Ok(mut stmt) = conn.prepare(&format!("PRAGMA table_info({table})")) else {
        return false;
    };
    let Ok(mut rows) = stmt.query([]) else {
        return false;
    };
    while let Ok(Some(row)) = rows.next() {
        if let Ok(name) = row.get::<_, String>(1) {
            if name.eq_ignore_ascii_case(column) {
                return true;
            }
        }
    }
    false
}

/// `Eleve.statut` est accentué dans le schéma ; un import a pu produire
/// l'autre graphie. On exclut les deux.
const EXCLURE_TRANSFERES: &str = "e.statut IN ('ACTIF', 'INSCRIT') AND EXISTS (SELECT 1 FROM Etablissement ea WHERE ea.id = e.etablissement_id AND ea.actif = 1)";

/* ────────────────────────────────────────────────────────────────────────────
 * Rapport financier
 * ──────────────────────────────────────────────────────────────────────────*/

#[tauri::command]
pub fn get_rapport_financier(
    db: State<'_, DbConn>,
    etablissement_id: String,
    annee_scolaire_id: String,
) -> Result<serde_json::Value, AppError> {
    use std::collections::{BTreeMap, BTreeSet};

    let conn = db.lock()?;

    let d_pai = dev("p.devise");
    let d_dep = dev("d.devise");
    let mut devises: BTreeSet<String> = BTreeSet::new();

    // Colonne de date : `date_depense` sur Depense, `created_at` sur Paiement.
    let col_date_dep = if column_exists(&conn, "Depense", "date_depense") {
        "d.date_depense"
    } else {
        "d.created_at"
    };

    /* ── Encaissements par mois et devise ──────────────────────────────── */
    let encaissements = {
        let mut stmt = conn.prepare(&format!(
            "SELECT strftime('%Y-%m', p.created_at) AS mois, {d_pai} AS devise, \
                    COALESCE(SUM(p.montant), 0) \
             FROM Paiement p \
             LEFT JOIN AnneeScolaire ans ON ans.id = p.annee_scolaire_id \
             WHERE (?1 = 'ALL' OR p.etablissement_id = ?1) \
               AND (p.annee_scolaire_id = ?2 OR ans.libelle = ?2) \
               AND COALESCE(p.annule, 0) = 0 \
             GROUP BY mois, devise ORDER BY mois, devise"
        ))?;
        let rows = stmt.query_map(params![etablissement_id, annee_scolaire_id], |r| {
            Ok(MoisDeviseMontant {
                mois: r.get(0)?,
                devise: r.get(1)?,
                total: r.get(2)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().unwrap_or_default()
    };
    for m in &encaissements {
        devises.insert(m.devise.clone());
    }

    /* ── Dépenses par mois et devise ───────────────────────────────────── */
    let depenses = {
        let mut stmt = conn.prepare(&format!(
            "SELECT strftime('%Y-%m', {col_date_dep}) AS mois, {d_dep} AS devise, \
                    COALESCE(SUM(d.montant), 0) \
             FROM Depense d \
             LEFT JOIN AnneeScolaire ans ON ans.id = d.annee_scolaire_id \
             WHERE (?1 = 'ALL' OR d.etablissement_id = ?1) \
               AND (d.annee_scolaire_id = ?2 OR ans.libelle = ?2) \
             GROUP BY mois, devise ORDER BY mois, devise"
        ))?;
        let rows = stmt.query_map(params![etablissement_id, annee_scolaire_id], |r| {
            Ok(MoisDeviseMontant {
                mois: r.get(0)?,
                devise: r.get(1)?,
                total: r.get(2)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().unwrap_or_default()
    };
    for m in &depenses {
        devises.insert(m.devise.clone());
    }

    /* ── Soldes : soustraction faite DANS chaque devise ────────────────── */
    let soldes = {
        let mut acc: BTreeMap<String, (f64, f64)> = BTreeMap::new();
        for m in &encaissements {
            acc.entry(m.devise.clone()).or_insert((0.0, 0.0)).0 += m.total;
        }
        for m in &depenses {
            acc.entry(m.devise.clone()).or_insert((0.0, 0.0)).1 += m.total;
        }
        acc.into_iter()
            .map(|(devise, (enc, dep))| SoldeDevise {
                devise,
                encaissements: enc,
                depenses: dep,
                solde: enc - dep,
            })
            .collect::<Vec<_>>()
    };

    let data = RapportFinancier {
        encaissements,
        depenses,
        soldes,
        devises: devises.into_iter().collect(),
    };

    Ok(api_response(Ok(data)))
}

/* ────────────────────────────────────────────────────────────────────────────
 * Rapport élèves — que des comptages, aucune devise
 * ──────────────────────────────────────────────────────────────────────────*/

#[tauri::command]
pub fn get_rapport_eleves(
    db: State<'_, DbConn>,
    etablissement_id: String,
    annee_scolaire_id: String,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let par_statut = {
        let mut stmt = conn.prepare(&format!(
            "SELECT COALESCE(NULLIF(TRIM(e.statut), ''), '—') AS s, COUNT(*) \
             FROM Eleve e \
             LEFT JOIN AnneeScolaire ans ON ans.id = e.annee_scolaire_id \
             WHERE (?1 = 'ALL' OR e.etablissement_id = ?1) AND (e.annee_scolaire_id = ?2 OR ans.libelle = ?2) \
               AND {EXCLURE_TRANSFERES} \
             GROUP BY s ORDER BY 2 DESC"
        ))?;
        let rows = stmt.query_map(params![etablissement_id, annee_scolaire_id], |r| {
            Ok(StatutCount {
                statut: r.get(0)?,
                count: r.get(1)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().unwrap_or_default()
    };

    let par_sexe = {
        let mut stmt = conn.prepare(&format!(
            "SELECT COALESCE(NULLIF(TRIM(e.sexe), ''), '—') AS s, COUNT(*) \
             FROM Eleve e \
             LEFT JOIN AnneeScolaire ans ON ans.id = e.annee_scolaire_id \
             WHERE (?1 = 'ALL' OR e.etablissement_id = ?1) AND (e.annee_scolaire_id = ?2 OR ans.libelle = ?2) \
               AND {EXCLURE_TRANSFERES} \
             GROUP BY s ORDER BY 2 DESC"
        ))?;
        let rows = stmt.query_map(params![etablissement_id, annee_scolaire_id], |r| {
            Ok(SexeCount {
                sexe: r.get(0)?,
                count: r.get(1)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().unwrap_or_default()
    };

    let par_classe = {
        let mut stmt = conn.prepare(&format!(
            "SELECT COALESCE(c.nom, '— Sans classe —') AS cl, COUNT(DISTINCT e.id) \
             FROM Eleve e \
             LEFT JOIN EleveClasse ecl ON ecl.eleve_id = e.id AND ecl.statut = 'ACTIF' \
             LEFT JOIN Classe c ON c.id = ecl.classe_id \
             LEFT JOIN AnneeScolaire ans ON ans.id = e.annee_scolaire_id \
             WHERE (?1 = 'ALL' OR e.etablissement_id = ?1) AND (e.annee_scolaire_id = ?2 OR ans.libelle = ?2) \
               AND {EXCLURE_TRANSFERES} \
             GROUP BY cl ORDER BY cl"
        ))?;
        let rows = stmt.query_map(params![etablissement_id, annee_scolaire_id], |r| {
            Ok(ClasseCount {
                classe_nom: r.get(0)?,
                count: r.get(1)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().unwrap_or_default()
    };

    let total: i64 = conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM Eleve e \
             LEFT JOIN AnneeScolaire ans ON ans.id = e.annee_scolaire_id \
             WHERE (?1 = 'ALL' OR e.etablissement_id = ?1) AND (e.annee_scolaire_id = ?2 OR ans.libelle = ?2) \
               AND {EXCLURE_TRANSFERES}"
        ),
        params![etablissement_id, annee_scolaire_id],
        |r| r.get(0),
    )?;

    let data = RapportEleves {
        par_statut,
        par_sexe,
        par_classe,
        total,
    };

    Ok(api_response(Ok(data)))
}


/// Rapport de caisse pour une journée, détaillé et prêt à être imprimé.
#[tauri::command]
pub fn get_rapport_journalier(
    db: State<'_, DbConn>,
    etablissement_id: String,
    annee_scolaire_id: Option<String>,
    date: String,
) -> Result<serde_json::Value, AppError> {
    use std::collections::BTreeMap;
    let conn = db.lock()?;
    let annee = annee_scolaire_id.clone();
    let mut recus = Vec::new();
    let mut totaux: BTreeMap<String, (f64, f64)> = BTreeMap::new();
    let mut modes: BTreeMap<(String, String), (i64, f64)> = BTreeMap::new();

    let sql = "SELECT p.numero_recu, p.created_at, TRIM(COALESCE(el.nom,'') || ' ' || COALESCE(el.prenom,'')), \
                      COALESCE(el.matricule,''), COALESCE(c.nom,'—'), COALESCE(p.motif,''), p.montant, \
                      UPPER(COALESCE(NULLIF(TRIM(p.devise),''),'CDF')), COALESCE(p.mode_paiement,''), p.reference_paiement, \
                      CASE WHEN COALESCE(p.annule,0)=1 THEN 'ANNULE' ELSE 'PAYE' END, u.nom_complet, \
                      COALESCE(et.nom, '—') \
               FROM Paiement p \
               LEFT JOIN Eleve el ON el.id=p.eleve_id \
               LEFT JOIN (SELECT eleve_id, MIN(classe_id) AS classe_id FROM EleveClasse WHERE statut='ACTIF' GROUP BY eleve_id) ec ON ec.eleve_id=el.id \
               LEFT JOIN Classe c ON c.id=ec.classe_id \
               LEFT JOIN User u ON u.id=p.user_id \
               LEFT JOIN Etablissement et ON et.id=p.etablissement_id \
               LEFT JOIN AnneeScolaire ans ON ans.id=p.annee_scolaire_id \
               WHERE (?1 = 'ALL' OR p.etablissement_id=?1) \
                 AND substr(p.created_at,1,10)=?2 \
                 AND (?3 IS NULL OR p.annee_scolaire_id=?3 OR ans.libelle=?3) \
               ORDER BY p.created_at ASC, p.numero_recu ASC";
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![etablissement_id, date, annee], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?, r.get::<_, f64>(6)?, r.get::<_, String>(7)?, r.get::<_, String>(8)?, r.get::<_, Option<String>>(9)?, r.get::<_, String>(10)?, r.get::<_, Option<String>>(11)?, r.get::<_, String>(12)?))
    })?;
    for row in rows {
        let (numero, created, eleve, matricule, classe, motif, montant, devise, mode, reference, statut, caissier, etab_nom) = row?;
        let heure = created.get(11..19).unwrap_or("").to_string();
        let entry = modes.entry((mode.clone(), devise.clone())).or_insert((0, 0.0));
        entry.0 += 1;
        if statut == "PAYE" { entry.1 += montant; totaux.entry(devise.clone()).or_insert((0.0, 0.0)).0 += montant; }
        recus.push(serde_json::json!({ "numeroRecu": numero, "heure": heure, "eleve": eleve, "matricule": matricule, "classe": classe, "motif": motif, "montant": montant, "devise": devise, "modePaiement": mode, "reference": reference, "statut": statut, "caissier": caissier, "etablissementNom": etab_nom }));
    }

    let col_date = if column_exists(&conn, "Depense", "date_depense") { "d.date_depense" } else { "d.created_at" };
    let expense_sql = format!(
        "SELECT {col_date}, d.categorie, d.libelle, d.beneficiaire, d.montant, \
                UPPER(COALESCE(NULLIF(TRIM(d.devise),''),'CDF')), d.reference_piece, d.statut, \
                COALESCE(et.nom, '—') \
         FROM Depense d \
         LEFT JOIN Etablissement et ON et.id=d.etablissement_id \
         LEFT JOIN AnneeScolaire ans ON ans.id=d.annee_scolaire_id \
         WHERE (?1 = 'ALL' OR d.etablissement_id=?1) \
           AND substr({col_date},1,10)=?2 \
           AND (?3 IS NULL OR d.annee_scolaire_id=?3 OR ans.libelle=?3) \
         ORDER BY {col_date} ASC"
    );
    let mut stmt = conn.prepare(&expense_sql)?;
    let rows = stmt.query_map(params![etablissement_id, date, annee_scolaire_id], |r| {
        Ok(serde_json::json!({ "heure": r.get::<_, String>(0)?.get(11..19).unwrap_or("").to_string(), "categorie": r.get::<_, String>(1)?, "libelle": r.get::<_, String>(2)?, "beneficiaire": r.get::<_, Option<String>>(3)?, "montant": r.get::<_, f64>(4)?, "devise": r.get::<_, String>(5)?, "reference": r.get::<_, Option<String>>(6)?, "statut": r.get::<_, String>(7)?, "etablissementNom": r.get::<_, String>(8)? }))
    })?;
    let mut depenses = Vec::new();
    for row in rows {
        let dep = row?;
        if dep["statut"].as_str().unwrap_or("").to_uppercase() != "ANNULE" {
            let devise = dep["devise"].as_str().unwrap_or("CDF").to_string();
            let montant = dep["montant"].as_f64().unwrap_or(0.0);
            totaux.entry(devise).or_insert((0.0, 0.0)).1 += montant;
        }
        depenses.push(dep);
    }

    let total_reçus = recus.len() as i64;
    let total_annules = recus.iter().filter(|r| r["statut"] == "ANNULE").count() as i64;
    let total_valides = total_reçus - total_annules;
    let total_depenses = depenses.iter().filter(|d| d["statut"].as_str().unwrap_or("").to_uppercase() != "ANNULE").count() as i64;
    let totaux_json: Vec<_> = totaux.into_iter().map(|(devise, (encaissements, depenses))| serde_json::json!({ "devise": devise, "encaissements": encaissements, "depenses": depenses, "solde": encaissements - depenses })).collect();
    let modes_json: Vec<_> = modes.into_iter().map(|((mode, devise), (nombre, total))| serde_json::json!({ "mode": mode, "devise": devise, "nombre": nombre, "total": total })).collect();

    Ok(api_response(Ok(serde_json::json!({ "date": date, "recus": recus, "depenses": depenses, "totaux": totaux_json, "parMode": modes_json, "totalRecus": total_reçus, "totalValides": total_valides, "totalAnnules": total_annules, "totalDepenses": total_depenses }))))
}

#[allow(dead_code)]
fn _rapport_journalier_marker() {}
