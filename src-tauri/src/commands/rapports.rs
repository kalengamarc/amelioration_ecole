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
const EXCLURE_TRANSFERES: &str = "e.statut NOT IN ('TRANSFÉRÉ', 'TRANSFERE')";

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
             WHERE p.etablissement_id = ?1 AND p.annee_scolaire_id = ?2 \
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
             WHERE d.etablissement_id = ?1 AND d.annee_scolaire_id = ?2 \
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
        let mut stmt = conn.prepare(
            "SELECT COALESCE(NULLIF(TRIM(e.statut), ''), '—') AS s, COUNT(*) \
             FROM Eleve e \
             WHERE e.etablissement_id = ?1 AND e.annee_scolaire_id = ?2 \
             GROUP BY s ORDER BY 2 DESC",
        )?;
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
             WHERE e.etablissement_id = ?1 AND e.annee_scolaire_id = ?2 \
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
             WHERE e.etablissement_id = ?1 AND e.annee_scolaire_id = ?2 \
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
             WHERE e.etablissement_id = ?1 AND e.annee_scolaire_id = ?2 \
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
