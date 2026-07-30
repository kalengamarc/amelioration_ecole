use rusqlite::types::ToSql;
use serde::Serialize;
use tauri::State;

use crate::db::DbConn;
use crate::error::AppError;

/* ────────────────────────────────────────────────────────────────────────────
 * Ligne renvoyée au frontend (1 ligne = 1 élève, échéances agrégées)
 * ──────────────────────────────────────────────────────────────────────────*/

/// Totaux d'un élève dans une devise donnée. Jamais de somme inter-devises.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TotalDevise {
    pub devise: String,
    pub total_du: f64,
    pub total_paye: f64,
    pub reste: f64,
}

/// Détail d'un frais pour un élève, avec imputation des paiements globaux.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LigneFrais {
    pub libelle: String,
    /// Devise du frais lui-même : deux lignes peuvent différer.
    pub devise: String,
    pub montant_du: f64,
    /// Inclut la part du paiement global imputée sur cette ligne.
    pub montant_paye: f64,
    pub reste: f64,
    pub date_echeance: Option<String>,
    /// PAYE | PARTIEL | DU
    pub etat: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EcheanceRow {
    pub eleve_id: String,
    pub eleve_nom: String,
    pub eleve_prenom: String,
    pub eleve_matricule: String,
    pub classe_nom: String,
    pub total_du: f64,
    pub total_paye: f64,
    pub reste: f64,
    pub statut: String,
    pub date_echeance: Option<String>,
    pub retard_jours: i64,
    /// Devise de l'établissement (CDF par défaut).
    pub devise: String,
    /// Libellés des frais concernés, ex. « Minerval T1, Inscription ».
    pub motif: Option<String>,
    /// Nombre d'échéances agrégées pour cet élève.
    pub nb_echeances: i64,
    /// Détail frais par frais, pour un message de relance explicite.
    pub lignes: Vec<LigneFrais>,
    /// Dû / payé / reste par devise. `totalDu` & co restent valables
    /// uniquement quand l'élève n'a qu'une seule devise.
    pub totaux: Vec<TotalDevise>,
    /// Tuteur principal — table `TuteurEleve` (is_principal) → `Tuteur`.
    pub tuteur_nom: Option<String>,
    pub tuteur_telephone: Option<String>,
    /// Colonne `Tuteur.relation` (Père, Mère, Oncle…).
    pub tuteur_lien: Option<String>,
}

/* ────────────────────────────────────────────────────────────────────────────
 * CTE commune
 *
 * Le schéma possède une table `Echeance` matérialisée : on l'agrège
 * directement par élève, plutôt que de recalculer depuis FraisScolaire
 * (qui stocke ses classes dans un champ JSON `classe_ids`, non joignable).
 *
 * Statut recalculé à la volée : le champ `Echeance.statut` peut être obsolète
 * si `montant_paye` a été mis à jour sans repasser par update_echeance.
 * ──────────────────────────────────────────────────────────────────────────*/

/* ────────────────────────────────────────────────────────────────────────────
 * Introspection du schéma
 *
 * La base installée peut diverger du DDL de référence (migration non jouée,
 * ancienne version…). On interroge donc `PRAGMA table_info` au lieu de
 * supposer qu'une colonne existe : une colonne absente ne doit pas faire
 * planter la requête, seulement désactiver la fonctionnalité associée.
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
    let sql = format!("PRAGMA table_info({table})");
    let Ok(mut stmt) = conn.prepare(&sql) else {
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

/// Colonnes optionnelles détectées au moment de l'appel.
#[derive(Debug, Clone, Copy)]
struct SchemaCaps {
    /// `FraisScolaire.classe_ids` (JSON ou CSV) présent ?
    frais_classe_ids: bool,
    /// Table de liaison `FraisClasse` présente ?
    frais_classe_table: bool,
    /// Table `Echeance` présente ?
    echeance: bool,
    /// Table `Paiement` présente ?
    paiement: bool,
    /// `Paiement.annule` présent ?
    paiement_annule: bool,
    /// `Paiement.echeance_id` présent ? Permet l'affectation exacte.
    paiement_echeance_id: bool,
    /// `Paiement.devise` présent ?
    paiement_devise: bool,
    /// Tuteurs disponibles (`TuteurEleve` + `Tuteur`) ?
    tuteurs: bool,
    /// `Tuteur.relation` présent ?
    tuteur_relation: bool,
    /// `Tuteur.telephone2` présent ?
    tuteur_tel2: bool,
    /// `TuteurEleve.is_principal` présent ?
    tuteur_principal: bool,
    /// `TuteurEleve.created_at` présent ?
    tuteur_created: bool,
    /// `Etablissement.devise` présent ?
    etab_devise: bool,
    /// `EleveClasse.date_inscription` présent ?
    eleve_classe_date: bool,
}

impl SchemaCaps {
    fn detect(conn: &rusqlite::Connection) -> Self {
        Self {
            frais_classe_ids: column_exists(conn, "FraisScolaire", "classe_ids"),
            frais_classe_table: table_exists(conn, "FraisClasse"),
            echeance: table_exists(conn, "Echeance"),
            paiement: table_exists(conn, "Paiement"),
            paiement_annule: column_exists(conn, "Paiement", "annule"),
            paiement_echeance_id: column_exists(conn, "Paiement", "echeance_id"),
            paiement_devise: column_exists(conn, "Paiement", "devise"),
            tuteurs: table_exists(conn, "TuteurEleve") && table_exists(conn, "Tuteur"),
            tuteur_relation: column_exists(conn, "Tuteur", "relation"),
            tuteur_tel2: column_exists(conn, "Tuteur", "telephone2"),
            tuteur_principal: column_exists(conn, "TuteurEleve", "is_principal"),
            tuteur_created: column_exists(conn, "TuteurEleve", "created_at"),
            etab_devise: column_exists(conn, "Etablissement", "devise"),
            eleve_classe_date: column_exists(conn, "EleveClasse", "date_inscription"),
        }
    }

    /// Condition SQL décidant si un frais s'applique à un élève `e`.
    fn frais_match_clause(&self) -> String {
        if self.frais_classe_ids {
            // Champ JSON ("all" | ["c1","c2"]) ou liste CSV de secours.
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
        } else if self.frais_classe_table {
            // Table de liaison : le frais vaut pour tous s'il n'y a aucune ligne.
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
            // Aucun ciblage possible : le frais s'applique à tout l'établissement.
            "1 = 1".to_string()
        }
    }

    /// Expression du téléphone du tuteur.
    fn tuteur_phone_expr(&self) -> &'static str {
        if self.tuteur_tel2 {
            "COALESCE(NULLIF(TRIM(t.telephone), ''), NULLIF(TRIM(t.telephone2), ''))"
        } else {
            "NULLIF(TRIM(t.telephone), '')"
        }
    }

    /// Tri déterminant le tuteur « principal ».
    ///
    /// À égalité de `is_principal` (deux principaux, ou aucun), on retient le
    /// plus RÉCEMMENT rattaché : c'est celui que l'utilisateur vient d'ajouter.
    /// `COALESCE(...,'')` place les dates nulles en fin de tri décroissant,
    /// `t.rowid DESC` sert d'ultime départage.
    fn tuteur_order(&self) -> String {
        match (self.tuteur_principal, self.tuteur_created) {
            (true, true) => {
                "te.is_principal DESC, COALESCE(te.created_at,'') DESC, t.rowid DESC".into()
            }
            (true, false) => "te.is_principal DESC, t.rowid DESC".into(),
            (false, true) => "COALESCE(te.created_at,'') DESC, t.rowid DESC".into(),
            (false, false) => "t.rowid DESC".into(),
        }
    }
}

fn base_cte(where_clause: &str, caps: &SchemaCaps) -> String {
    // ── Sources conditionnelles ───────────────────────────────────────────
    let agg_cte = if caps.echeance {
        r#"agg AS (
    SELECT
        ech.eleve_id                       AS eleve_id,
        SUM(ech.montant_du)                AS total_du,
        SUM(COALESCE(ech.montant_paye, 0)) AS paye_echeance,
        COUNT(*)                           AS nb_echeances,
        MIN(CASE WHEN COALESCE(ech.montant_paye, 0) < ech.montant_du
                 THEN ech.date_echeance END) AS prochaine_echeance,
        -- Libellés réellement dus.
        -- Recalculé simplement ici ; le détail exact (avec imputation des
        -- paiements ciblés) est fourni par `lignes` via load_lignes().
        NULL                               AS motif
    FROM Echeance ech
    GROUP BY ech.eleve_id
)"#
        .to_string()
    } else {
        // Table absente : CTE vide, typée, pour garder les LEFT JOIN valides.
        "agg AS (SELECT NULL AS eleve_id, 0 AS total_du, 0 AS paye_echeance, \
         0 AS nb_echeances, NULL AS prochaine_echeance, NULL AS motif WHERE 0)"
            .to_string()
    };

    // Repli : montants déduits de FraisScolaire quand aucune échéance n'existe.
    let not_exists_echeance = if caps.echeance {
        "WHERE NOT EXISTS (SELECT 1 FROM Echeance ech3 WHERE ech3.eleve_id = e.id)"
    } else {
        ""
    };
    let fallback_cte = format!(
        r#"frais_applicables AS (
    SELECT e.id AS eleve_id, fs.libelle AS libelle, fs.montant AS montant,
           fs.date_echeance AS date_echeance
    FROM Eleve e
    JOIN FraisScolaire fs
      ON fs.etablissement_id  = e.etablissement_id
     AND fs.annee_scolaire_id = e.annee_scolaire_id
     AND COALESCE(fs.actif, 1) = 1
     AND {frais_match}
    {not_exists}
),
fallback AS (
    SELECT eleve_id,
           SUM(montant)       AS total_du,
           COUNT(*)           AS nb_frais,
           MIN(date_echeance) AS prochaine_echeance,
           (SELECT GROUP_CONCAT(y.libelle, ', ') FROM (
                SELECT DISTINCT fa2.libelle AS libelle
                FROM frais_applicables fa2
                WHERE fa2.eleve_id = fa.eleve_id
                ORDER BY COALESCE(fa2.date_echeance, '9999'), fa2.libelle
                LIMIT 4
           ) y)               AS motif
    FROM frais_applicables fa
    GROUP BY eleve_id
)"#,
        frais_match = caps.frais_match_clause(),
        not_exists = not_exists_echeance
    );

    let pay_cte = if caps.paiement {
        let annule = if caps.paiement_annule {
            "WHERE COALESCE(p.annule, 0) = 0"
        } else {
            ""
        };
        format!(
            "pay AS (SELECT p.eleve_id AS eleve_id, SUM(p.montant) AS total \
             FROM Paiement p {annule} GROUP BY p.eleve_id)"
        )
    } else {
        "pay AS (SELECT NULL AS eleve_id, 0 AS total WHERE 0)".to_string()
    };

    // ── Sous-requêtes tuteur (ou NULL si le schéma ne les a pas) ──────────
    let (tuteur_nom, tuteur_tel, tuteur_lien) = if caps.tuteurs {
        let order = caps.tuteur_order();
        let phone = caps.tuteur_phone_expr();
        let lien = if caps.tuteur_relation {
            format!(
                "(SELECT t.relation FROM TuteurEleve te JOIN Tuteur t ON t.id = te.tuteur_id \
                  WHERE te.eleve_id = e.id ORDER BY {order} LIMIT 1)"
            )
        } else {
            "NULL".to_string()
        };
        (
            format!(
                "(SELECT TRIM(COALESCE(t.prenom,'') || ' ' || COALESCE(t.nom,'')) \
                  FROM TuteurEleve te JOIN Tuteur t ON t.id = te.tuteur_id \
                  WHERE te.eleve_id = e.id ORDER BY {order} LIMIT 1)"
            ),
            format!(
                "(SELECT {phone} FROM TuteurEleve te JOIN Tuteur t ON t.id = te.tuteur_id \
                  WHERE te.eleve_id = e.id ORDER BY {order} LIMIT 1)"
            ),
            lien,
        )
    } else {
        ("NULL".into(), "NULL".into(), "NULL".into())
    };

    let devise_expr = if caps.etab_devise {
        "COALESCE(etab.devise, 'CDF')"
    } else {
        "'CDF'"
    };
    let classe_order = if caps.eleve_classe_date {
        "ORDER BY ecl.date_inscription DESC"
    } else {
        ""
    };

    format!(
        r#"
WITH {agg_cte},
{fallback_cte},
{pay_cte},
merged AS (
    SELECT
        e.id AS eleve_id,
        COALESCE(agg.total_du, fb.total_du, 0)                      AS total_du,
        CASE WHEN COALESCE(agg.paye_echeance, 0) > COALESCE(pay.total, 0)
             THEN COALESCE(agg.paye_echeance, 0)
             ELSE COALESCE(pay.total, 0) END AS total_paye,
        COALESCE(agg.nb_echeances, 0)                               AS nb_echeances,
        COALESCE(agg.prochaine_echeance, fb.prochaine_echeance)     AS date_echeance,
        -- Le motif ne doit décrire QUE ce qui reste dû. Si les paiements
        -- couvrent le total (y compris via Paiement quand Echeance.montant_paye
        -- est désynchronisé), il n'y a plus rien à réclamer.
        CASE
            WHEN COALESCE(agg.total_du, fb.total_du, 0)
                 - (CASE WHEN COALESCE(agg.paye_echeance, 0) > COALESCE(pay.total, 0)
                         THEN COALESCE(agg.paye_echeance, 0)
                         ELSE COALESCE(pay.total, 0) END) <= 0
            THEN NULL
            ELSE COALESCE(agg.motif, fb.motif)
        END                                                         AS motif,
        (agg.eleve_id IS NOT NULL OR fb.eleve_id IS NOT NULL
         OR pay.eleve_id IS NOT NULL)                               AS a_donnees
    FROM Eleve e
    LEFT JOIN agg         ON agg.eleve_id = e.id
    LEFT JOIN fallback fb ON fb.eleve_id  = e.id
    LEFT JOIN pay         ON pay.eleve_id = e.id
),
base AS (
    SELECT
        e.id                       AS eleve_id,
        e.nom                      AS eleve_nom,
        e.prenom                   AS eleve_prenom,
        COALESCE(e.matricule, '')  AS eleve_matricule,
        COALESCE(
            (SELECT c.nom FROM EleveClasse ecl
             JOIN Classe c ON c.id = ecl.classe_id
             WHERE ecl.eleve_id = e.id AND ecl.statut = 'ACTIF'
             {classe_order} LIMIT 1),
            '—'
        )                          AS classe_nom,
        m.total_du                 AS total_du,
        m.total_paye               AS total_paye,
        CASE WHEN m.total_du - m.total_paye > 0
             THEN m.total_du - m.total_paye ELSE 0 END AS reste,
        m.date_echeance            AS date_echeance,
        m.nb_echeances             AS nb_echeances,
        m.motif                    AS motif,
        {devise_expr}              AS devise,
        CASE
            WHEN m.total_du <= 0            THEN 'PAYE'
            WHEN m.total_paye >= m.total_du THEN 'PAYE'
            WHEN m.date_echeance IS NOT NULL
                 AND date(m.date_echeance) < date('now') THEN 'EN_RETARD'
            WHEN m.total_paye <= 0          THEN 'EN_ATTENTE'
            ELSE 'PARTIELLEMENT_PAYE'
        END AS statut,
        CASE
            WHEN m.date_echeance IS NOT NULL
                 AND m.total_paye < m.total_du
                 AND date(m.date_echeance) < date('now')
            THEN CAST(julianday('now') - julianday(m.date_echeance) AS INTEGER)
            ELSE 0
        END AS retard_jours,
        {tuteur_nom}  AS tuteur_nom,
        {tuteur_tel}  AS tuteur_telephone,
        {tuteur_lien} AS tuteur_lien
    FROM Eleve e
    JOIN merged m ON m.eleve_id = e.id
    LEFT JOIN Etablissement etab ON etab.id = e.etablissement_id
    WHERE {where_clause}
      AND m.a_donnees = 1
)"#
    )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Détail des frais par élève
 *
 * Le surplus non ventilé (Paiement encaissé mais non reporté sur
 * Echeance.montant_paye) est imputé en FIFO par date d'échéance. Chaque
 * ligne connaît donc son vrai reste, ce qui permet un message de relance
 * précis : « Minerval réglé, Bulletin encore dû ».
 * ──────────────────────────────────────────────────────────────────────────*/

/// Une échéance brute lue en base, avant imputation.
struct RawLigne {
    eleve_id: String,
    libelle: String,
    /// Devise propre au frais : l'imputation se fait devise par devise.
    devise: String,
    montant_du: f64,
    deja_paye: f64,
    date_echeance: Option<String>,
    /// Montant d'un paiement explicitement rattaché (echeance_id ou motif).
    direct: f64,
}

/// Devise normalisée : `null` / vide → CDF.
fn norm_devise(v: Option<String>) -> String {
    v.map(|d| d.trim().to_uppercase())
        .filter(|d| !d.is_empty())
        .unwrap_or_else(|| "CDF".to_string())
}

/// Normalise un libellé pour comparer motif de paiement et libellé de frais.
fn norm_libelle(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

/// Détail des frais, avec imputation des paiements.
///
/// ⚠️ Les requêtes ci-dessous sont volontairement PLATES : pas de CTE, pas de
/// window function, pas de MIN/MAX à deux arguments. Certaines versions de
/// SQLite embarquées rejettent ces constructions (« near "," : syntax error »).
/// Toute l'arithmétique d'imputation est faite en Rust.
fn load_lignes(
    conn: &rusqlite::Connection,
    eleve_ids: &[String],
    caps: &SchemaCaps,
) -> Result<std::collections::HashMap<String, Vec<LigneFrais>>, AppError> {
    use std::collections::HashMap;

    let mut map: HashMap<String, Vec<LigneFrais>> = HashMap::new();
    if eleve_ids.is_empty() {
        return Ok(map);
    }

    let placeholders = std::iter::repeat("?")
        .take(eleve_ids.len())
        .collect::<Vec<_>>()
        .join(",");
    let binds: Vec<&dyn ToSql> = eleve_ids.iter().map(|s| s as &dyn ToSql).collect();

    // ── 1. Encaissé par (élève, devise) ───────────────────────────────────
    // Indexé par devise : un versement en USD ne rembourse pas une dette CDF.
    let mut encaisse: HashMap<(String, String), f64> = HashMap::new();
    if caps.paiement {
        let annule = if caps.paiement_annule {
            "AND COALESCE(p.annule, 0) = 0"
        } else {
            ""
        };
        let col_dev = if caps.paiement_devise {
            "p.devise"
        } else {
            "'CDF'"
        };
        let sql = format!(
            "SELECT p.eleve_id, {col_dev}, SUM(p.montant) FROM Paiement p \
             WHERE p.eleve_id IN ({placeholders}) {annule} \
             GROUP BY p.eleve_id, {col_dev}"
        );
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query(binds.as_slice())?;
        while let Some(row) = rows.next()? {
            let eleve: String = row.get(0)?;
            let dev = norm_devise(row.get::<_, Option<String>>(1)?);
            encaisse.insert(
                (eleve, dev),
                row.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
            );
        }
    }

    // ── 2. Paiements ciblés : (eleve, echeance_id | motif) -> montant ─────
    let mut par_echeance: HashMap<String, f64> = HashMap::new();
    let mut par_motif: HashMap<(String, String), f64> = HashMap::new();
    if caps.paiement {
        let annule = if caps.paiement_annule {
            "AND COALESCE(p.annule, 0) = 0"
        } else {
            ""
        };
        let col_ech = if caps.paiement_echeance_id {
            "p.echeance_id"
        } else {
            "NULL"
        };
        let sql = format!(
            "SELECT p.eleve_id, {col_ech}, p.motif, p.montant FROM Paiement p \
             WHERE p.eleve_id IN ({placeholders}) {annule}"
        );
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query(binds.as_slice())?;
        while let Some(row) = rows.next()? {
            let eleve: String = row.get(0)?;
            let ech: Option<String> = row.get(1)?;
            let motif: Option<String> = row.get(2)?;
            let montant: f64 = row.get::<_, Option<f64>>(3)?.unwrap_or(0.0);
            if let Some(id) = ech.filter(|v| !v.trim().is_empty()) {
                *par_echeance.entry(id).or_insert(0.0) += montant;
            } else if let Some(m) = motif.filter(|v| !v.trim().is_empty()) {
                let key = (eleve, norm_libelle(&m));
                *par_motif.entry(key).or_insert(0.0) += montant;
            }
        }
    }

    // ── 3. Échéances matérialisées ────────────────────────────────────────
    let mut brutes: Vec<RawLigne> = Vec::new();
    let mut avec_echeance: std::collections::HashSet<String> = Default::default();

    if caps.echeance {
        let sql = format!(
            "SELECT e.id, e.eleve_id, fs.libelle, e.montant_du, \
                    COALESCE(e.montant_paye, 0), \
                    COALESCE(e.date_echeance, fs.date_echeance), \
                    fs.devise \
             FROM Echeance e \
             JOIN FraisScolaire fs ON fs.id = e.frais_scolaire_id \
             WHERE e.eleve_id IN ({placeholders})"
        );
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query(binds.as_slice())?;
        while let Some(row) = rows.next()? {
            let ech_id: String = row.get(0)?;
            let eleve_id: String = row.get(1)?;
            let libelle: String = row.get(2)?;
            avec_echeance.insert(eleve_id.clone());

            // Paiement rattaché : par echeance_id, sinon par motif
            let mut direct = par_echeance.get(&ech_id).copied().unwrap_or(0.0);
            if direct == 0.0 {
                let nl = norm_libelle(&libelle);
                for ((el, nm), montant) in par_motif.iter() {
                    if el == &eleve_id && (nm == &nl || nm.contains(&nl) || nl.contains(nm)) {
                        direct += montant;
                    }
                }
            }

            brutes.push(RawLigne {
                eleve_id,
                libelle,
                devise: norm_devise(row.get::<_, Option<String>>(6)?),
                montant_du: row.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
                deja_paye: row.get::<_, Option<f64>>(4)?.unwrap_or(0.0),
                date_echeance: row
                    .get::<_, Option<String>>(5)?
                    .filter(|v| !v.trim().is_empty()),
                direct,
            });
        }
    }

    // ── 4. Repli FraisScolaire pour les élèves sans échéance ──────────────
    let manquants: Vec<&String> = eleve_ids
        .iter()
        .filter(|id| !avec_echeance.contains(*id))
        .collect();

    if !manquants.is_empty() {
        let ph = std::iter::repeat("?")
            .take(manquants.len())
            .collect::<Vec<_>>()
            .join(",");
        let b2: Vec<&dyn ToSql> = manquants.iter().map(|s| *s as &dyn ToSql).collect();
        let sql = format!(
            "SELECT e.id, fs.libelle, fs.montant, fs.date_echeance, fs.devise \
             FROM Eleve e \
             JOIN FraisScolaire fs \
               ON fs.etablissement_id  = e.etablissement_id \
              AND fs.annee_scolaire_id = e.annee_scolaire_id \
              AND COALESCE(fs.actif, 1) = 1 \
              AND {frais_match} \
             WHERE e.id IN ({ph})",
            frais_match = caps.frais_match_clause()
        );
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query(b2.as_slice())?;
        while let Some(row) = rows.next()? {
            let eleve_id: String = row.get(0)?;
            let libelle: String = row.get(1)?;
            let nl = norm_libelle(&libelle);
            let mut direct = 0.0;
            for ((el, nm), montant) in par_motif.iter() {
                if el == &eleve_id && (nm == &nl || nm.contains(&nl) || nl.contains(&nm[..])) {
                    direct += montant;
                }
            }
            brutes.push(RawLigne {
                eleve_id,
                libelle,
                devise: norm_devise(row.get::<_, Option<String>>(4)?),
                montant_du: row.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
                deja_paye: 0.0,
                date_echeance: row
                    .get::<_, Option<String>>(3)?
                    .filter(|v| !v.trim().is_empty()),
                direct,
            });
        }
    }

    // ── 5. Imputation, en Rust ────────────────────────────────────────────
    //
    // ⚠️ Cloisonnée PAR DEVISE : un versement en USD ne peut pas solder une
    // ligne libellée en CDF. Chaque devise a son propre reliquat FIFO.
    let mut par_eleve: HashMap<String, Vec<RawLigne>> = HashMap::new();
    for l in brutes {
        par_eleve.entry(l.eleve_id.clone()).or_default().push(l);
    }

    for (eleve_id, lignes) in par_eleve {
        // Regroupement par devise, puis traitement indépendant
        let mut par_devise: HashMap<String, Vec<RawLigne>> = HashMap::new();
        for l in lignes {
            par_devise.entry(l.devise.clone()).or_default().push(l);
        }

        let mut out: Vec<LigneFrais> = Vec::new();

        for (devise, mut grp) in par_devise {
            grp.sort_by(|a, b| {
                let da = a.date_echeance.as_deref().unwrap_or("9999");
                let db = b.date_echeance.as_deref().unwrap_or("9999");
                da.cmp(db).then_with(|| a.libelle.cmp(&b.libelle))
            });

            // a) Paiements ciblés : la vérité comptable d'abord
            let mut restes: Vec<f64> = Vec::with_capacity(grp.len());
            let mut payes: Vec<f64> = Vec::with_capacity(grp.len());
            let mut total_affecte = 0.0;
            let mut total_sur_lignes = 0.0;

            for l in &grp {
                let reste_brut = (l.montant_du - l.deja_paye).max(0.0);
                let pris = l.direct.min(reste_brut);
                total_affecte += pris;
                total_sur_lignes += l.deja_paye;
                payes.push(l.deja_paye + pris);
                restes.push(reste_brut - pris);
            }

            // b) Reliquat non affecté DE CETTE DEVISE, imputé en FIFO
            let encaisse_dev = encaisse
                .get(&(eleve_id.clone(), devise.clone()))
                .copied()
                .unwrap_or(0.0);
            let mut libre = (encaisse_dev - total_sur_lignes - total_affecte).max(0.0);

            for i in 0..grp.len() {
                if libre <= 0.0 {
                    break;
                }
                let pris = libre.min(restes[i]);
                payes[i] += pris;
                restes[i] -= pris;
                libre -= pris;
            }

            for (i, l) in grp.into_iter().enumerate() {
                // Tolérance d'un centime : évite un « Dû 0 » dû aux flottants
                let etat = if restes[i] <= 0.009 {
                    "PAYE"
                } else if payes[i] > 0.009 {
                    "PARTIEL"
                } else {
                    "DU"
                };
                out.push(LigneFrais {
                    libelle: l.libelle,
                    devise: l.devise,
                    montant_du: l.montant_du,
                    montant_paye: payes[i],
                    reste: restes[i],
                    date_echeance: l.date_echeance,
                    etat: etat.to_string(),
                });
            }
        }

        // Ordre d'affichage stable : échéance, puis libellé
        out.sort_by(|a, b| {
            let da = a.date_echeance.as_deref().unwrap_or("9999");
            let db = b.date_echeance.as_deref().unwrap_or("9999");
            da.cmp(db).then_with(|| a.libelle.cmp(&b.libelle))
        });

        map.insert(eleve_id, out);
    }

    Ok(map)
}

/* ────────────────────────────────────────────────────────────────────────────
 * Commande Tauri
 * ──────────────────────────────────────────────────────────────────────────*/

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn list_echeances(
    db: State<'_, DbConn>,
    eleve_id: Option<String>,
    etablissement_id: Option<String>,
    annee_scolaire_id: Option<String>,
    classe_id: Option<String>,
    statut: Option<String>,
    search: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;
    // Le schéma réel peut diverger du DDL de référence : on l'inspecte.
    let caps = SchemaCaps::detect(&conn);

    let page = page.unwrap_or(1).max(1);
    let limit = page_size.unwrap_or(20).clamp(1, 200);
    let offset = (page - 1) * limit;

    // ── WHERE partagé par les 3 requêtes ──────────────────────────────────
    // NB : le statut élève est stocké accentué ('TRANSFÉRÉ') dans le schéma ;
    // on exclut les deux graphies par sécurité.
    let mut conditions: Vec<String> =
        vec!["e.statut NOT IN ('TRANSFÉRÉ', 'TRANSFERE')".to_string()];
    let mut where_params: Vec<Box<dyn ToSql>> = Vec::new();

    if let Some(v) = eleve_id.as_ref().filter(|s| !s.is_empty()) {
        conditions.push("e.id = ?".into());
        where_params.push(Box::new(v.clone()));
    }
    if let Some(v) = etablissement_id.as_ref().filter(|s| !s.is_empty()) {
        conditions.push("e.etablissement_id = ?".into());
        where_params.push(Box::new(v.clone()));
    }
    if let Some(v) = annee_scolaire_id.as_ref().filter(|s| !s.is_empty()) {
        // L'année est portée par l'échéance (l'élève peut en changer).
        // L'année peut venir de l'échéance, du paiement, ou de la fiche élève.
        // Chaque terme n'est ajouté que si la table correspondante existe.
        let mut parts: Vec<&str> = Vec::new();
        if caps.echeance {
            parts.push(
                "EXISTS (SELECT 1 FROM Echeance ech2 \
                 WHERE ech2.eleve_id = e.id AND ech2.annee_scolaire_id = ?)",
            );
        }
        if caps.paiement {
            parts.push(if caps.paiement_annule {
                "EXISTS (SELECT 1 FROM Paiement p2 \
                 WHERE p2.eleve_id = e.id AND COALESCE(p2.annule,0) = 0 \
                   AND p2.annee_scolaire_id = ?)"
            } else {
                "EXISTS (SELECT 1 FROM Paiement p2 \
                 WHERE p2.eleve_id = e.id AND p2.annee_scolaire_id = ?)"
            });
        }
        parts.push("e.annee_scolaire_id = ?");
        let n = parts.len();
        conditions.push(format!("({})", parts.join(" OR ")));
        for _ in 0..n {
            where_params.push(Box::new(v.clone()));
        }
    }
    if let Some(v) = classe_id.as_ref().filter(|s| !s.is_empty()) {
        conditions.push(
            "EXISTS (SELECT 1 FROM EleveClasse ecl \
             WHERE ecl.eleve_id = e.id AND ecl.classe_id = ? AND ecl.statut = 'ACTIF')"
                .into(),
        );
        where_params.push(Box::new(v.clone()));
    }
    if let Some(v) = search.as_ref().filter(|s| !s.trim().is_empty()) {
        conditions.push(
            "(e.nom LIKE ? ESCAPE '\\' OR e.prenom LIKE ? ESCAPE '\\' \
              OR e.matricule LIKE ? ESCAPE '\\' \
              OR (e.prenom || ' ' || e.nom) LIKE ? ESCAPE '\\')"
                .into(),
        );
        let pattern = format!(
            "%{}%",
            v.trim()
                .replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        );
        for _ in 0..4 {
            where_params.push(Box::new(pattern.clone()));
        }
    }

    let where_clause = conditions.join(" AND ");
    let cte = base_cte(&where_clause, &caps);

    // ── 1. Statistiques (avant le filtre statut) ──────────────────────────
    let mut stats = serde_json::Map::new();
    for key in ["PAYE", "PARTIELLEMENT_PAYE", "EN_RETARD", "EN_ATTENTE"] {
        stats.insert(key.to_string(), serde_json::json!(0));
    }
    {
        let sql = format!("{cte} SELECT statut, COUNT(*) FROM base GROUP BY statut");
        let refs: Vec<&dyn ToSql> = where_params.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query(refs.as_slice())?;
        while let Some(row) = rows.next()? {
            let k: String = row.get(0)?;
            let n: i64 = row.get(1)?;
            stats.insert(k, serde_json::json!(n));
        }
    }

    // Filtre statut appliqué en SQL → la pagination reste cohérente.
    let statut_filter = statut.as_ref().filter(|s| !s.is_empty());
    let statut_sql = if statut_filter.is_some() {
        " WHERE statut = ?"
    } else {
        ""
    };

    // ── 2. Total + reste global ───────────────────────────────────────────
    let (total, reste_global): (i64, f64) = {
        let sql = format!(
            "{cte} SELECT COUNT(*), COALESCE(SUM(reste), 0) FROM base{statut_sql}"
        );
        let mut p: Vec<&dyn ToSql> = where_params.iter().map(|x| x.as_ref()).collect();
        if let Some(s) = statut_filter {
            p.push(s);
        }
        conn.query_row(&sql, p.as_slice(), |r| Ok((r.get(0)?, r.get(1)?)))?
    };

    /* ── Reste global VENTILÉ par devise ───────────────────────────────
     * `reste_global` ci-dessus additionne les devises : il ne vaut que
     * si l'établissement n'en utilise qu'une. Ici chaque devise garde
     * son montant propre, sur tout le périmètre filtré (pas la page).
     * ────────────────────────────────────────────────────────────────*/
    let reste_global_par_devise: Vec<TotalDevise> = {
        use std::collections::BTreeMap;
        let mut acc: BTreeMap<String, (f64, f64, f64)> = BTreeMap::new();

        // a) Échéances matérialisées
        if caps.echeance {
            let sql = format!(
                "{cte} SELECT COALESCE(NULLIF(TRIM(fs.devise), ''), 'CDF') AS dev, \
                        COALESCE(SUM(ech.montant_du), 0), \
                        COALESCE(SUM(COALESCE(ech.montant_paye, 0)), 0) \
                 FROM base b \
                 JOIN Echeance ech ON ech.eleve_id = b.eleve_id \
                 LEFT JOIN FraisScolaire fs ON fs.id = ech.frais_scolaire_id \
                 GROUP BY dev"
            );
            let p: Vec<&dyn ToSql> = where_params.iter().map(|x| x.as_ref()).collect();
            if let Ok(mut stmt) = conn.prepare(&sql) {
                if let Ok(mut rows) = stmt.query(p.as_slice()) {
                    while let Ok(Some(row)) = rows.next() {
                        let dev: String = row.get::<_, String>(0)?.to_uppercase();
                        let du: f64 = row.get(1)?;
                        let paye: f64 = row.get(2)?;
                        let e = acc.entry(dev).or_insert((0.0, 0.0, 0.0));
                        e.0 += du;
                        e.1 += paye;
                    }
                }
            }
        }

        // b) Repli : élèves sans échéance matérialisée
        {
            let not_exists = if caps.echeance {
                "AND NOT EXISTS (SELECT 1 FROM Echeance x WHERE x.eleve_id = e.id)"
            } else {
                ""
            };
            let sql = format!(
                "{cte} SELECT COALESCE(NULLIF(TRIM(fs.devise), ''), 'CDF') AS dev, \
                        COALESCE(SUM(fs.montant), 0) \
                 FROM base b \
                 JOIN Eleve e ON e.id = b.eleve_id \
                 JOIN FraisScolaire fs \
                   ON fs.etablissement_id  = e.etablissement_id \
                  AND fs.annee_scolaire_id = e.annee_scolaire_id \
                  AND COALESCE(fs.actif, 1) = 1 \
                  AND {frais} \
                 WHERE 1 = 1 {not_exists} \
                 GROUP BY dev",
                frais = caps.frais_match_clause()
            );
            let p: Vec<&dyn ToSql> = where_params.iter().map(|x| x.as_ref()).collect();
            if let Ok(mut stmt) = conn.prepare(&sql) {
                if let Ok(mut rows) = stmt.query(p.as_slice()) {
                    while let Ok(Some(row)) = rows.next() {
                        let dev: String = row.get::<_, String>(0)?.to_uppercase();
                        let du: f64 = row.get(1)?;
                        acc.entry(dev).or_insert((0.0, 0.0, 0.0)).0 += du;
                    }
                }
            }
        }

        // c) Encaissements réels : `montant_paye` peut ne pas être à jour
        if caps.paiement {
            let annule = if caps.paiement_annule {
                "AND COALESCE(p.annule, 0) = 0"
            } else {
                ""
            };
            let col_dev = if caps.paiement_devise { "p.devise" } else { "'CDF'" };
            let sql = format!(
                "{cte} SELECT COALESCE(NULLIF(TRIM({col_dev}), ''), 'CDF') AS dev, \
                        COALESCE(SUM(p.montant), 0) \
                 FROM base b \
                 JOIN Paiement p ON p.eleve_id = b.eleve_id {annule} \
                 GROUP BY dev"
            );
            let pp: Vec<&dyn ToSql> = where_params.iter().map(|x| x.as_ref()).collect();
            if let Ok(mut stmt) = conn.prepare(&sql) {
                if let Ok(mut rows) = stmt.query(pp.as_slice()) {
                    while let Ok(Some(row)) = rows.next() {
                        let dev: String = row.get::<_, String>(0)?.to_uppercase();
                        let encaisse: f64 = row.get(1)?;
                        if let Some(e) = acc.get_mut(&dev) {
                            if encaisse > e.1 {
                                e.1 = encaisse;
                            }
                        }
                    }
                }
            }
        }

        acc.into_iter()
            .map(|(devise, (du, paye, _))| TotalDevise {
                devise,
                total_du: du,
                total_paye: paye,
                reste: (du - paye).max(0.0),
            })
            .filter(|t| t.total_du > 0.009 || t.total_paye > 0.009)
            .collect()
    };

    // ── 3. Page de résultats ──────────────────────────────────────────────
    let echeances: Vec<EcheanceRow> = {
        let sql = format!(
            "{cte} SELECT eleve_id, eleve_nom, eleve_prenom, eleve_matricule, classe_nom, \
             total_du, total_paye, reste, statut, date_echeance, retard_jours, \
             devise, motif, nb_echeances, tuteur_nom, tuteur_telephone, tuteur_lien \
             FROM base{statut_sql} \
             ORDER BY reste DESC, eleve_nom, eleve_prenom LIMIT ? OFFSET ?"
        );
        let mut p: Vec<&dyn ToSql> = where_params.iter().map(|x| x.as_ref()).collect();
        if let Some(s) = statut_filter {
            p.push(s);
        }
        p.push(&limit);
        p.push(&offset);

        let clean = |v: Option<String>| v.filter(|s| !s.trim().is_empty());

        let mut stmt = conn.prepare(&sql)?;
        let iter = stmt.query_map(p.as_slice(), |row| {
            Ok(EcheanceRow {
                eleve_id: row.get(0)?,
                eleve_nom: row.get(1)?,
                eleve_prenom: row.get(2)?,
                eleve_matricule: row.get(3)?,
                classe_nom: row.get(4)?,
                total_du: row.get(5)?,
                total_paye: row.get(6)?,
                reste: row.get(7)?,
                statut: row.get(8)?,
                date_echeance: clean(row.get(9)?),
                retard_jours: row.get(10)?,
                devise: row.get(11)?,
                motif: clean(row.get(12)?),
                nb_echeances: row.get(13)?,
                lignes: Vec::new(), // renseigné juste après, en une requête
                totaux: Vec::new(),
                tuteur_nom: clean(row.get(14)?),
                tuteur_telephone: clean(row.get(15)?),
                tuteur_lien: clean(row.get(16)?),
            })
        })?;
        iter.collect::<Result<Vec<_>, _>>()?
    };

    // Détail frais par frais pour les élèves de la page uniquement.
    let mut echeances = echeances;
    {
        let ids: Vec<String> = echeances.iter().map(|e| e.eleve_id.clone()).collect();
        let mut lignes = load_lignes(&conn, &ids, &caps)?;
        for e in echeances.iter_mut() {
            e.lignes = lignes.remove(&e.eleve_id).unwrap_or_default();

            // `motif` est dérivé des lignes : une seule source de vérité,
            // donc jamais en contradiction avec le détail affiché.
            if !e.lignes.is_empty() {
                let dus: Vec<&str> = e
                    .lignes
                    .iter()
                    .filter(|l| l.etat != "PAYE")
                    .take(4)
                    .map(|l| l.libelle.as_str())
                    .collect();
                e.motif = if dus.is_empty() {
                    None
                } else {
                    Some(dus.join(", "))
                };

                // Totaux ventilés par devise : jamais de somme hybride.
                let mut acc: std::collections::BTreeMap<String, (f64, f64, f64)> =
                    Default::default();
                for l in &e.lignes {
                    let t = acc.entry(l.devise.clone()).or_insert((0.0, 0.0, 0.0));
                    t.0 += l.montant_du;
                    t.1 += l.montant_paye;
                    t.2 += l.reste;
                }
                e.totaux = acc
                    .into_iter()
                    .map(|(devise, (du, paye, reste))| TotalDevise {
                        devise,
                        total_du: du,
                        total_paye: paye,
                        reste,
                    })
                    .collect();

                /* ── Scalaires : NE JAMAIS additionner des devises ──────
                 * `SUM(montant_du)` en SQL agrège toutes les échéances sans
                 * distinction : 20 000 CDF + 180 USD donnait « 20 180 »,
                 * affiché ensuite dans la devise de l'établissement.
                 *
                 * Une seule devise  → les scalaires sont exacts.
                 * Plusieurs devises → on expose celle où le reste est le plus
                 * élevé, avec SES montants. Tout consommateur qui ignore
                 * `totaux` affiche alors un chiffre partiel, jamais un
                 * total hybride faux.
                 * ────────────────────────────────────────────────────────*/
                if let Some(principal) = e.totaux.iter().max_by(|a, b| {
                    a.reste
                        .partial_cmp(&b.reste)
                        .unwrap_or(std::cmp::Ordering::Equal)
                }) {
                    e.devise = principal.devise.clone();
                    e.total_du = principal.total_du;
                    e.total_paye = principal.total_paye;
                    e.reste = principal.reste;
                }
            }
        }
    }

    let total_pages = if total == 0 {
        1
    } else {
        (total + limit - 1) / limit
    };

    Ok(serde_json::json!({
        "success": true,
        "data": echeances,
        "stats": stats,
        "resteGlobal": reste_global,
        "resteGlobalParDevise": reste_global_par_devise,
        // Diagnostic : permet à l'UI de signaler une donnée dégradée.
        "schema": {
            "hasEcheances": caps.echeance,
            "hasClasseTargeting": caps.frais_classe_ids || caps.frais_classe_table,
            "hasTuteurs": caps.tuteurs,
        },
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "totalPages": total_pages,
        }
    }))
}
