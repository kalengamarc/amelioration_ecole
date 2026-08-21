use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::db::DbConn;
use crate::error::{api_response, AppError};
use crate::utils::audit_logger::log_audit;

/* ────────────────────────────────────────────────────────────────────────────
 * PRINCIPE : AUCUNE CONVERSION
 *
 * Tous les montants restent dans leur devise d'origine. Additionner des CDF
 * et des USD via un taux qui varie donne un chiffre qui ne correspond à
 * aucune réalité comptable : la caisse détient des CDF *et* des USD, pas un
 * total hybride.
 *
 * Chaque agrégat est donc groupé par devise. Les comptages (élèves, jours de
 * retard) restent des scalaires : ils n'ont pas de devise.
 * ──────────────────────────────────────────────────────────────────────────*/

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    /* ── Montants, toujours ventilés par devise ─────────────────────── */
    pub encaissements_par_devise: Vec<DeviseMontant>,
    pub depenses_par_devise: Vec<DeviseMontant>,
    /// Encaissements − dépenses, devise par devise.
    pub benefice_par_devise: Vec<DeviseMontant>,
    /// Exigible / réglé / reste, avec taux de recouvrement propre.
    pub dette_par_devise: Vec<DetteDevise>,

    /* ── Séries, également ventilées ────────────────────────────────── */
    pub encaissements_par_mois: Vec<MoisDeviseMontant>,
    pub repartition_par_motif: Vec<MotifDeviseMontant>,
    pub repartition_par_mode: Vec<ModeDeviseMontant>,
    pub comparaison_ecoles: Vec<EcoleDeviseMontant>,

    /* ── Comptages : sans devise ────────────────────────────────────── */
    pub nombre_eleves: NombreEleves,
    pub eleves_en_ordre: i64,
    pub eleves_en_retard: i64,
    pub marge_retard_moyenne: f64,

    /* ── Listes ─────────────────────────────────────────────────────── */
    pub top_eleves_en_retard: Vec<EleveRetard>,
    pub bons_payeurs: Vec<BonPayeur>,

    /// Devises rencontrées, pour piloter l'affichage côté client.
    pub devises: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviseMontant {
    pub devise: String,
    pub montant: f64,
    /// Nombre d'opérations agrégées.
    pub nombre: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetteDevise {
    pub devise: String,
    pub total_du: f64,
    pub total_paye: f64,
    pub reste: f64,
    /// Élèves ayant un impayé dans cette devise.
    pub nombre_eleves: i64,
    /// Part réglée, 0 à 100.
    pub taux_recouvrement: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoisDeviseMontant {
    pub mois: String,
    pub devise: String,
    pub montant: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotifDeviseMontant {
    pub motif: String,
    pub devise: String,
    pub montant: f64,
    pub nombre: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeDeviseMontant {
    pub mode: String,
    pub devise: String,
    pub montant: f64,
    pub nombre: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EcoleDeviseMontant {
    pub nom: String,
    pub devise: String,
    pub encaissements: f64,
    pub depenses: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NombreEleves {
    pub total: i64,
    pub par_ecole: Vec<EcoleCount>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EcoleCount {
    pub nom: String,
    pub count: i64,
}

/// Un élève peut devoir dans plusieurs devises : `dettes` les liste toutes.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EleveRetard {
    pub eleve: EleveNom,
    pub matricule: Option<String>,
    pub dettes: Vec<DeviseMontant>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BonPayeur {
    pub eleve: EleveNom,
    pub matricule: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EleveNom {
    pub nom: String,
    pub prenom: String,
}

/* ────────────────────────────────────────────────────────────────────────────
 * Introspection
 *
 * Le schéma installé peut diverger du DDL de référence : on teste plutôt que
 * de supposer. Une table absente désactive sa fonctionnalité sans planter.
 * ──────────────────────────────────────────────────────────────────────────*/

fn table_exists(conn: &rusqlite::Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
        [table],
        |_| Ok(()),
    )
    .is_ok()
}

fn column_exists(conn: &rusqlite::Connection, table: &str, column: &str) -> bool {
    if !table_exists(conn, table) {
        return false;
    }
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

/// Le frais `fs` s'applique-t-il à l'élève `e` ?
///
/// Le schéma cible les classes via `FraisScolaire.classe_ids` (JSON `["c1"]`
/// ou `"all"`). Certaines installations utilisent une table `FraisClasse`.
fn frais_match_clause(conn: &rusqlite::Connection) -> String {
    if column_exists(conn, "FraisScolaire", "classe_ids") {
        r#"(
      TRIM(LOWER(COALESCE(fs.classe_ids, ''))) IN ('all', '"all"', '[]', '')
   OR EXISTS (
        SELECT 1 FROM EleveClasse ecl
        WHERE ecl.eleve_id = e.id AND ecl.statut = 'ACTIF'
          AND (CASE
                 WHEN json_valid(fs.classe_ids)
                 THEN EXISTS (SELECT 1 FROM json_each(fs.classe_ids) je
                              WHERE je.value = ecl.classe_id)
                 ELSE ',' || REPLACE(fs.classe_ids, ' ', '') || ','
                      LIKE '%,' || ecl.classe_id || ',%'
               END)
      )
 )"#
        .to_string()
    } else if table_exists(conn, "FraisClasse") {
        r#"(
      NOT EXISTS (SELECT 1 FROM FraisClasse fc WHERE fc.frais_scolaire_id = fs.id)
   OR EXISTS (
        SELECT 1 FROM FraisClasse fc
        JOIN EleveClasse ecl ON ecl.classe_id = fc.classe_id
        WHERE fc.frais_scolaire_id = fs.id
          AND ecl.eleve_id = e.id AND ecl.statut = 'ACTIF'
      )
 )"#
        .to_string()
    } else {
        "1 = 1".to_string()
    }
}

/// `Eleve.statut` est accentué dans le schéma (`TRANSFÉRÉ`) ; un import a pu
/// produire l'autre graphie. On exclut les deux.
const EXCLURE_TRANSFERES: &str = "e.statut NOT IN ('TRANSFÉRÉ', 'TRANSFERE')";

/// Normalise le code devise : `null` / vide → `CDF`.
const DEV: &str = "UPPER(COALESCE(NULLIF(TRIM({col}), ''), 'CDF'))";

fn dev_expr(col: &str) -> String {
    DEV.replace("{col}", col)
}

/* ────────────────────────────────────────────────────────────────────────────
 * Commande
 * ──────────────────────────────────────────────────────────────────────────*/

#[tauri::command]
pub fn get_dashboard_stats(
    db: State<'_, DbConn>,
    etablissement_id: String,
    annee_scolaire_id: String,
) -> Result<serde_json::Value, AppError> {
    use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

    let conn = db.lock()?;

    let frais_match = frais_match_clause(&conn);
    let has_echeance = table_exists(&conn, "Echeance");
    let d_pai = dev_expr("p.devise");
    let d_dep = dev_expr("d.devise");
    let d_fs = dev_expr("fs.devise");

    // Toutes les devises rencontrées, pour l'affichage.
    let mut devises_vues: BTreeSet<String> = BTreeSet::new();

    /* ── Encaissements par devise ──────────────────────────────────── */
    let encaissements_par_devise = {
        let mut stmt = conn.prepare(&format!(
            "SELECT {d_pai} AS dev, COALESCE(SUM(p.montant), 0), COUNT(*) \
             FROM Paiement p \
             WHERE p.etablissement_id = ?1 AND p.annee_scolaire_id = ?2 \
               AND COALESCE(p.annule, 0) = 0 \
             GROUP BY dev ORDER BY 2 DESC"
        ))?;
        let rows = stmt.query_map(params![etablissement_id, annee_scolaire_id], |r| {
            Ok(DeviseMontant {
                devise: r.get(0)?,
                montant: r.get(1)?,
                nombre: r.get(2)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().unwrap_or_default()
    };
    for d in &encaissements_par_devise {
        devises_vues.insert(d.devise.clone());
    }

    /* ── Dépenses par devise ───────────────────────────────────────── */
    let depenses_par_devise = {
        let mut stmt = conn.prepare(&format!(
            "SELECT {d_dep} AS dev, COALESCE(SUM(d.montant), 0), COUNT(*) \
             FROM Depense d \
             WHERE d.etablissement_id = ?1 AND d.annee_scolaire_id = ?2 \
             GROUP BY dev ORDER BY 2 DESC"
        ))?;
        let rows = stmt.query_map(params![etablissement_id, annee_scolaire_id], |r| {
            Ok(DeviseMontant {
                devise: r.get(0)?,
                montant: r.get(1)?,
                nombre: r.get(2)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().unwrap_or_default()
    };
    for d in &depenses_par_devise {
        devises_vues.insert(d.devise.clone());
    }

    /* ── Bénéfice par devise ────────────────────────────────────────
     * Soustraction faite devise par devise : jamais entre devises.
     * ─────────────────────────────────────────────────────────────*/
    let benefice_par_devise = {
        let mut acc: BTreeMap<String, (f64, i64)> = BTreeMap::new();
        for e in &encaissements_par_devise {
            let x = acc.entry(e.devise.clone()).or_insert((0.0, 0));
            x.0 += e.montant;
            x.1 += e.nombre;
        }
        for d in &depenses_par_devise {
            let x = acc.entry(d.devise.clone()).or_insert((0.0, 0));
            x.0 -= d.montant;
            x.1 += d.nombre;
        }
        acc.into_iter()
            .map(|(devise, (montant, nombre))| DeviseMontant {
                devise,
                montant,
                nombre,
            })
            .collect::<Vec<_>>()
    };

    /* ── Effectifs ─────────────────────────────────────────────────── */
    let total_eleves: i64 = conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM Eleve e \
             WHERE e.etablissement_id = ?1 AND e.annee_scolaire_id = ?2 \
               AND {EXCLURE_TRANSFERES}"
        ),
        params![etablissement_id, annee_scolaire_id],
        |r| r.get(0),
    )?;

    let par_ecole = {
        let mut stmt = conn.prepare(&format!(
            "SELECT etab.nom, COUNT(*) \
             FROM Eleve e \
             JOIN Etablissement etab ON e.etablissement_id = etab.id \
             WHERE e.annee_scolaire_id = ?1 AND {EXCLURE_TRANSFERES} \
             GROUP BY e.etablissement_id, etab.nom ORDER BY 2 DESC"
        ))?;
        let rows = stmt.query_map(params![annee_scolaire_id], |r| {
            Ok(EcoleCount {
                nom: r.get(0)?,
                count: r.get(1)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().unwrap_or_default()
    };

    let nombre_eleves = NombreEleves {
        total: total_eleves,
        par_ecole,
    };

    /* ── Dette par devise ───────────────────────────────────────────
     * Agrégation en trois passes :
     *   A. échéances matérialisées, devise du frais
     *   B. repli FraisScolaire pour les élèves sans échéance
     *   C. correction si Paiement montre plus que Echeance.montant_paye
     * ─────────────────────────────────────────────────────────────*/
    // devise -> (dû, payé, reste, élèves en dette)
    let mut dette: BTreeMap<String, (f64, f64, f64, HashSet<String>)> = BTreeMap::new();
    // (eleve, devise) -> reste, pour le top des retardataires
    let mut reste_par_eleve: HashMap<(String, String), f64> = HashMap::new();

    if has_echeance {
        let mut stmt = conn.prepare(&format!(
            "SELECT {d_fs} AS dev, ech.eleve_id, ech.montant_du, COALESCE(ech.montant_paye, 0) \
             FROM Echeance ech \
             JOIN Eleve e ON e.id = ech.eleve_id \
             LEFT JOIN FraisScolaire fs ON fs.id = ech.frais_scolaire_id \
             WHERE e.etablissement_id = ?1 AND ech.annee_scolaire_id = ?2 \
               AND {EXCLURE_TRANSFERES}"
        ))?;
        let mut rows = stmt.query(params![etablissement_id, annee_scolaire_id])?;
        while let Some(row) = rows.next()? {
            let dev: String = row.get(0)?;
            let eleve: String = row.get(1)?;
            let du: f64 = row.get::<_, Option<f64>>(2)?.unwrap_or(0.0);
            let paye: f64 = row.get::<_, Option<f64>>(3)?.unwrap_or(0.0);
            let reste = (du - paye).max(0.0);

            let e = dette
                .entry(dev.clone())
                .or_insert((0.0, 0.0, 0.0, HashSet::new()));
            e.0 += du;
            e.1 += paye;
            e.2 += reste;
            if reste > 0.009 {
                e.3.insert(eleve.clone());
                *reste_par_eleve.entry((eleve, dev)).or_insert(0.0) += reste;
            }
        }
    }

    {
        let not_exists = if has_echeance {
            "AND NOT EXISTS (SELECT 1 FROM Echeance x WHERE x.eleve_id = e.id)"
        } else {
            ""
        };
        let mut stmt = conn.prepare(&format!(
            "SELECT {d_fs} AS dev, e.id, fs.montant \
             FROM Eleve e \
             JOIN FraisScolaire fs \
               ON fs.etablissement_id  = e.etablissement_id \
              AND fs.annee_scolaire_id = e.annee_scolaire_id \
              AND COALESCE(fs.actif, 1) = 1 \
              AND {frais_match} \
             WHERE e.etablissement_id = ?1 AND e.annee_scolaire_id = ?2 \
               AND {EXCLURE_TRANSFERES} {not_exists}"
        ))?;
        let mut rows = stmt.query(params![etablissement_id, annee_scolaire_id])?;
        while let Some(row) = rows.next()? {
            let dev: String = row.get(0)?;
            let eleve: String = row.get(1)?;
            let du: f64 = row.get::<_, Option<f64>>(2)?.unwrap_or(0.0);
            let e = dette
                .entry(dev.clone())
                .or_insert((0.0, 0.0, 0.0, HashSet::new()));
            e.0 += du;
            e.2 += du; // rien de matérialisé : tout reste dû
            if du > 0.009 {
                e.3.insert(eleve.clone());
                *reste_par_eleve.entry((eleve, dev)).or_insert(0.0) += du;
            }
        }
    }

    // Paiements réellement encaissés, par devise : `Echeance.montant_paye`
    // peut ne pas avoir été resynchronisé après un règlement.
    let paiements_par_devise: HashMap<String, f64> = {
        let mut m = HashMap::new();
        let mut stmt = conn.prepare(&format!(
            "SELECT {d_pai} AS dev, COALESCE(SUM(p.montant), 0) \
             FROM Paiement p \
             WHERE p.etablissement_id = ?1 AND p.annee_scolaire_id = ?2 \
               AND COALESCE(p.annule, 0) = 0 \
             GROUP BY dev"
        ))?;
        let mut rows = stmt.query(params![etablissement_id, annee_scolaire_id])?;
        while let Some(row) = rows.next()? {
            m.insert(row.get::<_, String>(0)?, row.get::<_, f64>(1)?);
        }
        m
    };

    for (dev, paye) in &paiements_par_devise {
        if let Some(e) = dette.get_mut(dev) {
            if *paye > e.1 {
                let delta = *paye - e.1;
                e.1 = *paye;
                e.2 = (e.2 - delta).max(0.0);
            }
        }
    }

    /* ── Même correction, élève par élève ──────────────────────────────
     * Sans cela, « Top élèves en retard » affiche la dette brute des
     * échéances alors que la carte devise, elle, tient compte des
     * paiements réels : les deux chiffres se contredisaient.
     * ────────────────────────────────────────────────────────────────*/
    {
        // (élève, devise) -> encaissé
        let mut paye_eleve: HashMap<(String, String), f64> = HashMap::new();
        let mut stmt = conn.prepare(&format!(
            "SELECT p.eleve_id, {d_pai} AS dev, COALESCE(SUM(p.montant), 0) \
             FROM Paiement p \
             WHERE p.etablissement_id = ?1 AND p.annee_scolaire_id = ?2 \
               AND COALESCE(p.annule, 0) = 0 \
             GROUP BY p.eleve_id, dev"
        ))?;
        let mut rows = stmt.query(params![etablissement_id, annee_scolaire_id])?;
        while let Some(row) = rows.next()? {
            paye_eleve.insert(
                (row.get::<_, String>(0)?, row.get::<_, String>(1)?),
                row.get::<_, f64>(2)?,
            );
        }

        // Part déjà imputée sur les échéances, pour ne pas déduire deux fois
        let mut deja_impute: HashMap<(String, String), f64> = HashMap::new();
        if has_echeance {
            let mut stmt = conn.prepare(&format!(
                "SELECT ech.eleve_id, {d_fs} AS dev, COALESCE(SUM(ech.montant_paye), 0) \
                 FROM Echeance ech \
                 JOIN Eleve e ON e.id = ech.eleve_id \
                 LEFT JOIN FraisScolaire fs ON fs.id = ech.frais_scolaire_id \
                 WHERE e.etablissement_id = ?1 AND ech.annee_scolaire_id = ?2 \
                   AND {EXCLURE_TRANSFERES} \
                 GROUP BY ech.eleve_id, dev"
            ))?;
            let mut rows = stmt.query(params![etablissement_id, annee_scolaire_id])?;
            while let Some(row) = rows.next()? {
                deja_impute.insert(
                    (row.get::<_, String>(0)?, row.get::<_, String>(1)?),
                    row.get::<_, f64>(2)?,
                );
            }
        }

        for (cle, reste) in reste_par_eleve.iter_mut() {
            let encaisse = paye_eleve.get(cle).copied().unwrap_or(0.0);
            let impute = deja_impute.get(cle).copied().unwrap_or(0.0);
            let surplus = (encaisse - impute).max(0.0);
            if surplus > 0.0 {
                *reste = (*reste - surplus).max(0.0);
            }
        }
        reste_par_eleve.retain(|_, r| *r > 0.009);
    }

    let dette_par_devise: Vec<DetteDevise> = {
        let mut v: Vec<DetteDevise> = dette
            .into_iter()
            .filter(|(_, (du, paye, _, _))| *du > 0.009 || *paye > 0.009)
            .map(|(devise, (du, paye, reste, eleves))| DetteDevise {
                devise,
                total_du: du,
                total_paye: paye,
                reste,
                nombre_eleves: eleves.len() as i64,
                taux_recouvrement: if du > 0.0 {
                    ((paye / du) * 100.0).clamp(0.0, 100.0)
                } else {
                    0.0
                },
            })
            .collect();
        v.sort_by(|a, b| {
            b.reste
                .partial_cmp(&a.reste)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        v
    };
    for d in &dette_par_devise {
        devises_vues.insert(d.devise.clone());
    }

    /* ── Élèves en ordre / en retard ────────────────────────────────
     * Un élève est en retard si son statut dans Echeance est 'EN_RETARD'
     * (date_echeance dépassée ET montant impayé).
     * ─────────────────────────────────────────────────────────────*/
    let eleves_en_retard_set: HashSet<String> = if has_echeance {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT ech.eleve_id \
             FROM Echeance ech \
             JOIN Eleve e ON e.id = ech.eleve_id \
             WHERE e.etablissement_id = ?1 AND ech.annee_scolaire_id = ?2 \
               AND COALESCE(ech.montant_paye, 0) < COALESCE(ech.montant_du, 0) \
               AND ech.date_echeance IS NOT NULL \
               AND date(ech.date_echeance) < date('now') \
               AND e.statut NOT IN ('TRANSFÉRÉ', 'TRANSFERE')"
        )?;
        let rows = stmt.query_map(params![etablissement_id, annee_scolaire_id], |r| {
            Ok(r.get::<_, String>(0)?)
        })?;
        rows.collect::<Result<HashSet<_>, _>>().unwrap_or_default()
    } else {
        HashSet::new()
    };
    
    let eleves_en_retard = eleves_en_retard_set.len() as i64;
    let eleves_en_ordre = (total_eleves - eleves_en_retard).max(0);

    /* ── Retard moyen, en jours ─────────────────────────────────────── */
    let marge_retard_moyenne: f64 = if has_echeance {
        conn.query_row(
            &format!(
                "SELECT COALESCE(AVG(julianday('now') - julianday(ech.date_echeance)), 0) \
                 FROM Echeance ech \
                 JOIN Eleve e ON e.id = ech.eleve_id \
                 WHERE e.etablissement_id = ?1 AND ech.annee_scolaire_id = ?2 \
                   AND {EXCLURE_TRANSFERES} \
                   AND ech.date_echeance IS NOT NULL \
                   AND date(ech.date_echeance) < date('now') \
                   AND COALESCE(ech.montant_paye, 0) < ech.montant_du"
            ),
            params![etablissement_id, annee_scolaire_id],
            |r| r.get::<_, f64>(0),
        )
        .unwrap_or(0.0)
    } else {
        0.0
    };

    /* ── Encaissements par mois ET par devise ───────────────────────── */
    let encaissements_par_mois = {
        let mut stmt = conn.prepare(&format!(
            "SELECT strftime('%Y-%m', p.created_at) AS mois, {d_pai} AS dev, \
                    COALESCE(SUM(p.montant), 0) \
             FROM Paiement p \
             WHERE p.etablissement_id = ?1 AND p.annee_scolaire_id = ?2 \
               AND COALESCE(p.annule, 0) = 0 \
             GROUP BY mois, dev ORDER BY mois, dev"
        ))?;
        let rows = stmt.query_map(params![etablissement_id, annee_scolaire_id], |r| {
            Ok(MoisDeviseMontant {
                mois: r.get(0)?,
                devise: r.get(1)?,
                montant: r.get(2)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().unwrap_or_default()
    };

    /* ── Par motif et devise ────────────────────────────────────────── */
    let repartition_par_motif = {
        let mut stmt = conn.prepare(&format!(
            "SELECT COALESCE(NULLIF(TRIM(p.motif), ''), '—') AS motif, {d_pai} AS dev, \
                    COALESCE(SUM(p.montant), 0) AS total, COUNT(*) \
             FROM Paiement p \
             WHERE p.etablissement_id = ?1 AND p.annee_scolaire_id = ?2 \
               AND COALESCE(p.annule, 0) = 0 \
             GROUP BY motif, dev ORDER BY motif, total DESC"
        ))?;
        let rows = stmt.query_map(params![etablissement_id, annee_scolaire_id], |r| {
            Ok(MotifDeviseMontant {
                motif: r.get(0)?,
                devise: r.get(1)?,
                montant: r.get(2)?,
                nombre: r.get(3)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().unwrap_or_default()
    };

    /* ── Par mode et devise ─────────────────────────────────────────── */
    let repartition_par_mode = {
        let mut stmt = conn.prepare(&format!(
            "SELECT COALESCE(NULLIF(TRIM(p.mode_paiement), ''), '—') AS mode, {d_pai} AS dev, \
                    COALESCE(SUM(p.montant), 0) AS total, COUNT(*) \
             FROM Paiement p \
             WHERE p.etablissement_id = ?1 AND p.annee_scolaire_id = ?2 \
               AND COALESCE(p.annule, 0) = 0 \
             GROUP BY mode, dev ORDER BY total DESC"
        ))?;
        let rows = stmt.query_map(params![etablissement_id, annee_scolaire_id], |r| {
            Ok(ModeDeviseMontant {
                mode: r.get(0)?,
                devise: r.get(1)?,
                montant: r.get(2)?,
                nombre: r.get(3)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().unwrap_or_default()
    };

    /* ── Comparaison entre écoles, par devise ───────────────────────── */
    let comparaison_ecoles = {
        // (école, devise) -> (encaissements, dépenses)
        let mut acc: BTreeMap<(String, String), (f64, f64)> = BTreeMap::new();

        {
            let mut stmt = conn.prepare(&format!(
                "SELECT etab.nom, {d_pai} AS dev, COALESCE(SUM(p.montant), 0) \
                 FROM Paiement p \
                 JOIN Etablissement etab ON etab.id = p.etablissement_id \
                 WHERE p.annee_scolaire_id = ?1 AND COALESCE(p.annule, 0) = 0 \
                 GROUP BY etab.nom, dev"
            ))?;
            let mut rows = stmt.query(params![annee_scolaire_id])?;
            while let Some(row) = rows.next()? {
                let key = (row.get::<_, String>(0)?, row.get::<_, String>(1)?);
                acc.entry(key).or_insert((0.0, 0.0)).0 += row.get::<_, f64>(2)?;
            }
        }
        {
            let mut stmt = conn.prepare(&format!(
                "SELECT etab.nom, {d_dep} AS dev, COALESCE(SUM(d.montant), 0) \
                 FROM Depense d \
                 JOIN Etablissement etab ON etab.id = d.etablissement_id \
                 WHERE d.annee_scolaire_id = ?1 \
                 GROUP BY etab.nom, dev"
            ))?;
            let mut rows = stmt.query(params![annee_scolaire_id])?;
            while let Some(row) = rows.next()? {
                let key = (row.get::<_, String>(0)?, row.get::<_, String>(1)?);
                acc.entry(key).or_insert((0.0, 0.0)).1 += row.get::<_, f64>(2)?;
            }
        }

        acc.into_iter()
            .map(|((nom, devise), (enc, dep))| EcoleDeviseMontant {
                nom,
                devise,
                encaissements: enc,
                depenses: dep,
            })
            .collect::<Vec<_>>()
    };

    /* ── Top élèves en retard, toutes devises ───────────────────────── */
    let top_eleves_en_retard = {
        // élève -> liste (devise, reste)
        let mut par_eleve: HashMap<String, Vec<(String, f64)>> = HashMap::new();
        for ((eleve, devise), reste) in &reste_par_eleve {
            if *reste > 0.009 && eleves_en_retard_set.contains(eleve) {
                par_eleve
                    .entry(eleve.clone())
                    .or_default()
                    .push((devise.clone(), *reste));
            }
        }

        // Tri par nombre de devises impayées, puis par montant le plus élevé :
        // sans conversion, on ne peut pas comparer des CDF à des USD.
        let mut ids: Vec<(String, Vec<(String, f64)>)> = par_eleve.into_iter().collect();
        ids.sort_by(|a, b| {
            b.1.len().cmp(&a.1.len()).then_with(|| {
                let ma = a.1.iter().map(|x| x.1).fold(0.0_f64, f64::max);
                let mb = b.1.iter().map(|x| x.1).fold(0.0_f64, f64::max);
                mb.partial_cmp(&ma).unwrap_or(std::cmp::Ordering::Equal)
            })
        });
        ids.truncate(10);

        let mut out = Vec::with_capacity(ids.len());
        for (eleve_id, mut dettes) in ids {
            dettes.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
            let info = conn.query_row(
                "SELECT nom, prenom, matricule FROM Eleve WHERE id = ?1",
                params![eleve_id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<String>>(2)?,
                    ))
                },
            );
            if let Ok((nom, prenom, matricule)) = info {
                out.push(EleveRetard {
                    eleve: EleveNom { nom, prenom },
                    matricule,
                    dettes: dettes
                        .into_iter()
                        .map(|(devise, montant)| DeviseMontant {
                            devise,
                            montant,
                            nombre: 1,
                        })
                        .collect(),
                });
            }
        }
        out
    };

    /* ── Bons payeurs : aucun retard détecté, quelle que soit la devise ─────── */
    let bons_payeurs = {
        let mut stmt = conn.prepare(&format!(
            "SELECT e.id, e.nom, e.prenom, e.matricule \
             FROM Eleve e \
             WHERE e.etablissement_id = ?1 AND e.annee_scolaire_id = ?2 \
               AND {EXCLURE_TRANSFERES} \
             ORDER BY e.nom, e.prenom"
        ))?;
        let mut rows = stmt.query(params![etablissement_id, annee_scolaire_id])?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            if out.len() >= 10 {
                break;
            }
            let id: String = row.get(0)?;
            // Pas en retard (statut EN_RETARD) ET a payé quelque chose
            let en_retard = eleves_en_retard_set.contains(&id);
            let a_paye = reste_par_eleve.keys().any(|(e, _)| e == &id)
                || paiements_par_devise.values().any(|v| *v > 0.0);
            if !en_retard && a_paye {
                out.push(BonPayeur {
                    eleve: EleveNom {
                        nom: row.get(1)?,
                        prenom: row.get(2)?,
                    },
                    matricule: row.get(3)?,
                });
            }
        }
        out
    };

    drop(conn);

    log_audit(
        &db,
        None,
        "VIEW",
        "Dashboard",
        None,
        Some("Consulted dashboard stats"),
    );

    let data = DashboardData {
        encaissements_par_devise,
        depenses_par_devise,
        benefice_par_devise,
        dette_par_devise,
        encaissements_par_mois,
        repartition_par_motif,
        repartition_par_mode,
        comparaison_ecoles,
        nombre_eleves,
        eleves_en_ordre,
        eleves_en_retard,
        marge_retard_moyenne,
        top_eleves_en_retard,
        bons_payeurs,
        devises: devises_vues.into_iter().collect(),
    };

    Ok(api_response(Ok(data)))
}
