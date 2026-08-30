use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use crate::error::AppError;
use crate::db::now_iso;

/// Verrou global anti-concurrence : empêche deux synchronisations de s'exécuter
/// en parallèle (synchro auto toutes les 5 min + clic manuel) et de s'interférer
/// (double push, LAST_SYNC écrasé, pull partiel appliqué deux fois).
static SYNC_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Serialize, Deserialize)]
pub struct TableSyncStats {
    pub table_name: String,
    pub pushed: usize,
    pub pulled: usize,
    pub skipped_orphans: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncSummary {
    pub success: bool,
    pub start_time: String,
    pub end_time: String,
    pub stats: Vec<TableSyncStats>,
    pub message: String,
}

struct TableConfig {
    name: &'static str,
    pk_cols: Vec<&'static str>,
    unique_cols: Vec<&'static str>,
    /// (colonne FK locale, table parente référencée)
    fk_deps: Vec<(&'static str, &'static str)>,
}

fn encode_param(s: &str) -> String {
    s.replace('+', "%2B").replace(' ', "%20")
}

/// Normalise un horodatage distant (TIMESTAMPTZ PostgREST, ex. `2026-08-30T16:00:00+00:00`)
/// au format UTC local (`2026-08-30T16:00:00Z`) afin que les comparaisons lexicographiques
/// SQLite (`created_at > ?`) restent correctes. Les chaînes non datées sont laissées intactes.
fn normalize_remote_timestamp(s: &str) -> String {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        dt.with_timezone(&chrono::Utc).format("%Y-%m-%dT%H:%M:%SZ").to_string()
    } else {
        s.to_string()
    }
}

/// Décode un identifiant composite stocké dans le journal d'audit.
/// Accepte les deux formats : `"X,Y"` et `"eleve_id=X,tuteur_id=Y"`.
/// Retourne la liste des valeurs (sans les noms de colonnes).
fn parse_composite_entite_id(entite_id: &str) -> Vec<String> {
    if entite_id.contains('=') {
        entite_id.split(',').map(|p| {
            let mut kv = p.splitn(2, '=');
            let _col = kv.next().unwrap_or("");
            kv.next().unwrap_or("").trim().to_string()
        }).collect()
    } else {
        entite_id.split(',').map(|v| v.trim().to_string()).collect()
    }
}

/// Sauvegarde de sécurité de la base locale avant toute opération destructive
/// de la synchronisation (applications de suppressions distantes, upserts de masse).
/// Non bloquant : si la sauvegarde échoue, la synchro continue (on loggue).
fn backup_local_db() {
    let path = crate::db::get_db_path();
    let ts = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let backup_path = format!("{}.bak-{}", path, ts);

    // VACUUM INTO produit un instantané cohérent (y compris données WAL),
    // sans interrompre l'application.
    let result = (|| -> Result<(), rusqlite::Error> {
        let conn = Connection::open(&path)?;
        conn.busy_timeout(Duration::from_secs(5))?;
        conn.execute_batch(&format!("VACUUM INTO '{}';", backup_path.replace('\'', "''")))?;
        Ok(())
    })();

    if let Err(e) = result {
        eprintln!("[SYNC] Sauvegarde locale impossible (non bloquant) : {}", e);
        return;
    }

    // Ne conserver que les 3 sauvegardes les plus récentes.
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if let Ok(entries) = std::fs::read_dir(parent) {
            let mut backups: Vec<(std::time::SystemTime, std::path::PathBuf)> = entries
                .filter_map(|e| e.ok())
                .map(|e| {
                    let mtime = e.metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .unwrap_or(std::time::UNIX_EPOCH);
                    (mtime, e.path())
                })
                .filter(|(_, p)| {
                    p.file_name()
                        .map(|n| n.to_string_lossy().contains(".bak-"))
                        .unwrap_or(false)
                })
                .collect();
            backups.sort_by(|a, b| b.0.cmp(&a.0));
            for (_, p) in backups.into_iter().skip(3) {
                let _ = std::fs::remove_file(p);
            }
        }
    }
}

fn map_entity_to_table(entity: &str) -> Option<&'static str> {
    match entity.to_lowercase().as_str() {
        "etablissement" => Some("Etablissement"),
        "anneescolaire" | "annee_scolaire" => Some("AnneeScolaire"),
        "classe" => Some("Classe"),
        "user" => Some("User"),
        "eleve" => Some("Eleve"),
        "tuteur" => Some("Tuteur"),
        "tuteureleve" | "tuteur_eleve" => Some("TuteurEleve"),
        "eleveclasse" | "eleve_classe" => Some("EleveClasse"),
        "fraisscolaire" | "frais_scolaire" => Some("FraisScolaire"),
        "fraisclasse" | "frais_classe" => Some("FraisClasse"),
        "echeance" => Some("Echeance"),
        "paiement" => Some("Paiement"),
        "annulationrecu" | "annulation_recu" => Some("AnnulationRecu"),
        "depense" => Some("Depense"),
        "parametre" | "parametre_etablissement" | "parametreetablissement" => Some("ParametreEtablissement"),
        "auditlog" | "audit_log" => Some("AuditLog"),
        _ => None,
    }
}

fn http_get_with_retry(
    client: &reqwest::blocking::Client,
    url: &str,
    apikey: &str,
    auth: &str,
    range_header: Option<&str>,
) -> Result<reqwest::blocking::Response, reqwest::Error> {
    let max_attempts = 3;
    let mut last_err = None;
    for attempt in 0..max_attempts {
        let mut req = client.get(url)
            .header("apikey", apikey)
            .header("Authorization", auth)
            // Les pages de données (élèves, paiements…) peuvent être volumineuses
            // et lentes à générer : timeout allongé pour éviter les body tronqués
            // (« réponse illisible ») sur connexion lente.
            .timeout(Duration::from_secs(180));
        if let Some(range) = range_header {
            req = req.header("Range", range);
        }
        match req.send() {
            Ok(resp) => {
                if resp.status().is_success() {
                    return Ok(resp);
                }
                let status_code = resp.status().as_u16();
                if status_code == 429 || status_code >= 500 {
                    let wait = Duration::from_millis(300 * (attempt as u64 + 1));
                    thread::sleep(wait);
                    last_err = None;
                    continue;
                }
                if status_code == 416 || status_code == 206 {
                    return Ok(resp);
                }
                return Ok(resp);
            }
            Err(e) => {
                last_err = Some(e);
                let wait = Duration::from_millis(300 * (attempt as u64 + 1));
                thread::sleep(wait);
            }
        }
    }

    let mut req = client.get(url)
        .header("apikey", apikey)
        .header("Authorization", auth)
        .timeout(Duration::from_secs(180));
    if let Some(range) = range_header {
        req = req.header("Range", range);
    }
    req.send().or_else(|e| last_err.map(Err).unwrap_or(Err(e)))
}

fn http_post_with_retry(
    client: &reqwest::blocking::Client,
    url: &str,
    apikey: &str,
    auth: &str,
    body: &Value,
) -> Result<reqwest::blocking::Response, reqwest::Error> {
    const MAX_ATTEMPTS: usize = 4;
    let mut last_err = None;

    for attempt in 0..MAX_ATTEMPTS {
        // NOTE IMPORTANTE (PostgREST) : `on_conflict=<pk>` dans l'URL ne prend
        // effet QUE si l'en-tête `Prefer: resolution=...` est présent. Sans lui,
        // PostgREST fait un simple INSERT et toute ligne déjà existante échoue
        // en 23505 (c'est ce qui s'est produit sur User/Eleve/Paiement).
        //
        // La sécurité contre l'écrasement ne vient PAS de l'absence de cet
        // en-tête, mais du paramètre `on_conflict=<pk>` toujours présent dans
        // l'URL : la cible de conflit est explicitement la clé primaire, donc
        // les autres contraintes uniques (username, matricule, numero_recu)
        // ne déclenchent pas de fusion — elles remontent en erreur.
        let req = client
            .post(url)
            .header("apikey", apikey)
            .header("Authorization", auth)
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates");
        match req.json(body).send()
        {
            Ok(resp) => {
                let retryable = resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS
                    || resp.status().is_server_error();
                if !retryable || attempt + 1 == MAX_ATTEMPTS {
                    return Ok(resp);
                }
                let wait_ms = 500_u64 * 2_u64.pow(attempt as u32);
                thread::sleep(Duration::from_millis(wait_ms));
            }
            Err(e) => {
                last_err = Some(e);
                if attempt + 1 < MAX_ATTEMPTS {
                    let wait_ms = 500_u64 * 2_u64.pow(attempt as u32);
                    thread::sleep(Duration::from_millis(wait_ms));
                }
            }
        }
    }

    Err(last_err.expect("HTTP retry loop must record a network error"))
}

pub fn run_bidirectional_sync(conn: &Connection) -> Result<SyncSummary, AppError> {
    let start_time = now_iso();

    // 1) Verrou global : sérialise les synchronisations.
    let _sync_guard = match SYNC_LOCK.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };

    // 2) Sauvegarde locale de sécurité avant toute opération destructive
    //    (applications de suppressions distantes, upserts de masse).
    backup_local_db();

    let _ = conn.execute_batch("PRAGMA foreign_keys=OFF;");

    let audit_fix = conn.execute(
        "UPDATE \"AuditLog\" SET user_id = NULL \
         WHERE user_id IS NOT NULL \
           AND user_id NOT IN (SELECT id FROM \"User\");",
        [],
    );
    if let Ok(count) = audit_fix {
        if count > 0 {
            eprintln!("[SYNC] Corrigé {} AuditLog avec user_id invalide", count);
        }
    }

    let supabase_url: String = match conn.query_row(
        "SELECT valeur FROM ConfigSysteme WHERE cle = 'SUPABASE_URL'",
        [],
        |r| r.get(0)
    ) {
        Ok(val) => val,
        Err(_) => return Err(AppError::Internal("Supabase URL non configurée dans les paramètres".to_string())),
    };

    let supabase_key: String = match conn.query_row(
        "SELECT valeur FROM ConfigSysteme WHERE cle = 'SUPABASE_KEY'",
        [],
        |r| r.get(0)
    ) {
        Ok(val) => val,
        Err(_) => return Err(AppError::Internal("Supabase Key non configurée dans les paramètres".to_string())),
    };

    if supabase_url.is_empty() || supabase_key.is_empty() {
        return Err(AppError::Internal("URL ou clé Supabase vide".to_string()));
    }

    let mut supabase_url = supabase_url.trim_end_matches('/').to_string();
    if !supabase_url.starts_with("http://") && !supabase_url.starts_with("https://") {
        supabase_url = format!("https://{}", supabase_url);
    }

    let last_sync: String = conn.query_row(
        "SELECT valeur FROM ConfigSysteme WHERE cle = 'LAST_SYNC'",
        [],
        |r| r.get(0)
    ).unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());

    let tables = vec![
        TableConfig { name: "Etablissement", pk_cols: vec!["id"], unique_cols: vec![], fk_deps: vec![] },
        TableConfig { name: "User", pk_cols: vec!["id"], unique_cols: vec!["username"], fk_deps: vec![("etablissement_id", "Etablissement")] },
        TableConfig { name: "AnneeScolaire", pk_cols: vec!["id"], unique_cols: vec!["etablissement_id", "libelle"], fk_deps: vec![("etablissement_id", "Etablissement")] },
        TableConfig { name: "Classe", pk_cols: vec!["id"], unique_cols: vec!["nom", "etablissement_id", "annee_scolaire_id"], fk_deps: vec![("etablissement_id", "Etablissement"), ("annee_scolaire_id", "AnneeScolaire")] },
        TableConfig { name: "Eleve", pk_cols: vec!["id"], unique_cols: vec!["matricule"], fk_deps: vec![("etablissement_id", "Etablissement"), ("annee_scolaire_id", "AnneeScolaire")] },
        TableConfig { name: "Tuteur", pk_cols: vec!["id"], unique_cols: vec![], fk_deps: vec![] },
        TableConfig { name: "TuteurEleve", pk_cols: vec!["eleve_id", "tuteur_id"], unique_cols: vec![], fk_deps: vec![("eleve_id", "Eleve"), ("tuteur_id", "Tuteur")] },
        TableConfig { name: "EleveClasse", pk_cols: vec!["eleve_id", "classe_id"], unique_cols: vec![], fk_deps: vec![("eleve_id", "Eleve"), ("classe_id", "Classe")] },
        TableConfig { name: "FraisScolaire", pk_cols: vec!["id"], unique_cols: vec![], fk_deps: vec![("etablissement_id", "Etablissement"), ("annee_scolaire_id", "AnneeScolaire")] },
        TableConfig { name: "FraisClasse", pk_cols: vec!["frais_scolaire_id", "classe_id"], unique_cols: vec![], fk_deps: vec![("frais_scolaire_id", "FraisScolaire"), ("classe_id", "Classe")] },
        TableConfig { name: "Echeance", pk_cols: vec!["id"], unique_cols: vec!["eleve_id", "frais_scolaire_id"], fk_deps: vec![("eleve_id", "Eleve"), ("frais_scolaire_id", "FraisScolaire"), ("annee_scolaire_id", "AnneeScolaire")] },
        TableConfig { name: "Paiement", pk_cols: vec!["id"], unique_cols: vec!["numero_recu"], fk_deps: vec![("eleve_id", "Eleve"), ("echeance_id", "Echeance"), ("etablissement_id", "Etablissement"), ("annee_scolaire_id", "AnneeScolaire"), ("user_id", "User")] },
        TableConfig { name: "AnnulationRecu", pk_cols: vec!["id"], unique_cols: vec!["paiement_id"], fk_deps: vec![("paiement_id", "Paiement")] },
        TableConfig { name: "Depense", pk_cols: vec!["id"], unique_cols: vec![], fk_deps: vec![("etablissement_id", "Etablissement"), ("annee_scolaire_id", "AnneeScolaire"), ("created_by_id", "User")] },
        TableConfig { name: "ParametreEtablissement", pk_cols: vec!["id"], unique_cols: vec!["etablissement_id"], fk_deps: vec![("etablissement_id", "Etablissement"), ("annee_scolaire_id", "AnneeScolaire")] },
        TableConfig { name: "AuditLog", pk_cols: vec!["id"], unique_cols: vec![], fk_deps: vec![("user_id", "User")] },
    ];

    let client = reqwest::blocking::Client::builder()
        .user_agent("SGFS-ME/1.0")
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::Internal(format!("Impossible d'initialiser le client HTTP : {}", e)))?;

    let mut stats = HashMap::new();
    let mut push_errors: Vec<String> = Vec::new();
    let mut push_error_counts: HashMap<String, usize> = HashMap::new();
    let mut push_had_error = false;
    let mut pull_errors: Vec<String> = Vec::new();
    let mut pull_had_error = false;
    let mut pull_warnings: Vec<String> = Vec::new();
    // Ids supprimés à distance (par table), lus depuis l'AuditLog distant :
    // sert à n'appliquer une "dégradation" (statut TRANSFERE / actif=0) que
    // lorsqu'elle est réellement documentée par une suppression journalisée.
    let mut remote_deleted_ids: HashMap<String, HashSet<String>> = HashMap::new();
    let mut failed_tables: HashSet<&str> = HashSet::new();
    let mut orphan_log: Vec<String> = Vec::new();

    for t in &tables {
        stats.insert(t.name.to_string(), TableSyncStats {
            table_name: t.name.to_string(),
            pushed: 0,
            pulled: 0,
            skipped_orphans: 0,
        });
    }

    // ==========================================
    // PHASE 1 : PULL (Remote -> Local)
    // On rapatrie TOUTES les lignes, sans filtre temporel.
    // ==========================================

    // Les suppressions distantes sont toujours traitées de manière incrémentale
    // via l'AuditLog (on ne peut pas deviner quelles lignes ont été supprimées
    // en faisant un simple SELECT * sur les données restantes).
    let url_del = format!("{}/rest/v1/AuditLog?action=eq.DELETE&created_at=gt.{}", supabase_url, encode_param(&last_sync));
    match http_get_with_retry(&client, &url_del, &supabase_key, &format!("Bearer {}", supabase_key), None) {
        Ok(resp) => {
            if resp.status().is_success() {
                match resp.json::<Vec<Value>>() {
                    Ok(remote_deletes) => {
                        for del in remote_deletes {
                            if let (Some(entite), Some(entite_id)) = (
                                del.get("entite").and_then(|v| v.as_str()),
                                del.get("entite_id").and_then(|v| v.as_str())
                            ) {
                                if let Some(table_name) = map_entity_to_table(entite) {
                                    if let Err(e) = apply_remote_delete(conn, table_name, entite_id, &mut remote_deleted_ids) {
                                        eprintln!("[SYNC] Échec suppression locale {} {} : {}", table_name, entite_id, e);
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        // Une lecture illisible du journal des suppressions ne doit PAS
                        // être considérée comme une réussite : sans elle, les suppressions
                        // distantes ne sont jamais appliquées localement.
                        pull_had_error = true;
                        pull_errors.push(format!("AuditLog (suppressions) : réponse illisible : {}", e));
                    }
                }
            } else {
                pull_had_error = true;
                pull_errors.push(format!("AuditLog (suppressions) : HTTP {}", resp.status().as_u16()));
            }
        }
        Err(e) => {
            pull_had_error = true;
            pull_errors.push(format!("AuditLog (suppressions) : {}", e));
        }
    }

    // AUTO-RÉPARATION des « TRANSFERE fantômes » : restaure les élèves marqués
    // TRANSFERE sans AUCUNE suppression documentée (ni audit local ni audit
    // distant). Ces marquages provenaient de l'ancien bug (pull qui appliquait
    // un hard delete puis ré-importait la ligne avec son statut TRANSFERE) —
    // ils font disparaître des élèves actifs des listes et des compteurs.
    repair_ghost_transferes(
        &conn,
        &client,
        &supabase_url,
        &supabase_key,
        &mut pull_warnings,
    );

    for t in &tables {
        // AuditLog : on ne rapatrie PAS le journal distant dans la table locale.
        // Les suppressions distantes sont déjà traitées par la requête incrémentale
        // dédiée ci-dessus ; copier tout le journal mélangerait l'audit local avec
        // celui des autres machines et ferait grossir la table à chaque run.
        if t.name == "AuditLog" {
            continue;
        }

        // Aucun filtre temporel : on récupère l'intégralité de la table distante,
        // par pages de 500 lignes (pages plus petites = réponses moins volumineuses,
        // moins de risque de body tronqué / timeout).
        let mut offset = 0;
        let page_size = 500;
        let mut total_pulled = 0;

        loop {
            let range_header = format!("{}-{}", offset, offset + page_size - 1);
            let url = format!("{}/rest/v1/{}", supabase_url, t.name);
            let res = http_get_with_retry(
                &client,
                &url,
                &supabase_key,
                &format!("Bearer {}", supabase_key),
                Some(&range_header),
            );

            match res {
                Ok(resp) => {
                    let status_code = resp.status().as_u16();
                    if status_code == 416 {
                        // Fin normale de la table : plus aucune ligne à distance.
                        break;
                    }
                    if status_code == 200 || status_code == 206 {
                        // Métadonnées avant consommation du body (resp.json() consomme la réponse).
                        let content_range = resp
                            .headers()
                            .get("content-range")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("?")
                            .to_string();

                        // Retry de décodage : un body tronqué par une coupure réseau peut
                        // faire échouer serde_json. La réponse déjà reçue est décodée une
                        // seule fois ; si le décodage échoue, on RE-TÉLÉCHARGE la page
                        // (resp.json() consomme le body) jusqu'à 2 nouvelles tentatives.
                        let mut decode_error: Option<String> = None;
                        let mut remote_rows: Option<Vec<Value>> = None;
                        match resp.json::<Vec<Value>>() {
                            Ok(rows) => remote_rows = Some(rows),
                            Err(first_err) => {
                                let mut last_err = format!("{}", first_err);
                                for attempt in 1..3u32 {
                                    thread::sleep(Duration::from_millis(800 * attempt as u64));
                                    match http_get_with_retry(
                                        &client,
                                        &url,
                                        &supabase_key,
                                        &format!("Bearer {}", supabase_key),
                                        Some(&range_header),
                                    ) {
                                        Ok(r) if r.status().is_success() => match r.json::<Vec<Value>>() {
                                            Ok(rows) => {
                                                remote_rows = Some(rows);
                                                break;
                                            }
                                            Err(e) => last_err = format!("{}", e),
                                        },
                                        Ok(r) => last_err = format!("HTTP {}", r.status().as_u16()),
                                        Err(e) => last_err = format!("{}", e),
                                    }
                                }
                                decode_error = Some(last_err);
                            }
                        }

                        match remote_rows {
                            Some(rows) => {
                                let count = rows.len();

                                for row in &rows {
                                    if let Some(row_obj) = row.as_object() {
                                        let mut row_map = row_obj.clone();
                                        // Écriture intelligente : résout les conflits de clé
                                        // unique secondaire (matricule / numero_recu en double)
                                        // et protège les élèves ACTIFS d'une rétrogradation
                                        // TRANSFERE non documentée.
                                        let result = pull_insert_row(
                                            conn,
                                            t.name,
                                            &t.pk_cols,
                                            &mut row_map,
                                            &mut pull_warnings,
                                            &remote_deleted_ids,
                                        );
                                        if let Err(e) = result {
                                            // Ne bloque pas le reste de la table, mais interdit
                                            // d'avancer LAST_SYNC : la table sera relue au prochain run.
                                            pull_had_error = true;
                                            pull_errors.push(format!("{} : échec d'écriture locale : {}", t.name, e));
                                        }
                                    }
                                }

                                total_pulled += count;
                                // Continuer tant qu'on reçoit une page complète (count == page_size)
                                if count < page_size {
                                    break;
                                }
                                offset += page_size;
                            }
                            None => {
                                pull_had_error = true;
                                pull_errors.push(format!(
                                    "{} : réponse illisible (page {}, Content-Range: {}) : {}",
                                    t.name,
                                    offset / page_size + 1,
                                    content_range,
                                    decode_error.unwrap_or_default()
                                ));
                                break;
                            }
                        }
                    } else {
                        let body = resp.text().unwrap_or_default();
                        let snippet: String = body.chars().take(300).collect();
                        pull_had_error = true;
                        pull_errors.push(format!("{} : HTTP {} — {}", t.name, status_code, snippet));
                        break;
                    }
                }
                Err(e) => {
                    pull_had_error = true;
                    pull_errors.push(format!("{} : {}", t.name, e));
                    break;
                }
            }
        }

        if let Some(stat) = stats.get_mut(t.name) {
            stat.pulled = total_pulled;
        }
        // Log spécifique pour TuteurEleve, Eleve et EleveClasse
        if t.name == "TuteurEleve" && total_pulled > 0 {
            eprintln!("[SYNC] Récupéré {} relations TuteurEleve depuis le serveur", total_pulled);
        }
        if t.name == "Eleve" && total_pulled > 0 {
            eprintln!("[SYNC] Récupéré {} élèves depuis le serveur", total_pulled);
        }
        if t.name == "EleveClasse" && total_pulled > 0 {
            eprintln!("[SYNC] Récupéré {} inscriptions EleveClasse depuis le serveur", total_pulled);
        }
    }

    // ==========================================
    // PHASE 2 : PUSH (Local -> Remote)
    // On pousse TOUTES les lignes locales, sans filtre temporel.
    // ==========================================

    // Après le pull, un élève ACTIF/INSCRIT sans AUCUNE inscription ACTIF
    // (bug « TRANSFERE fantôme » hérité) reste invisible des effectifs de
    // classe, du dashboard et de la classe des paiements. On réactive son
    // inscription la plus récente ; le push ci-dessous propage la correction
    // au cloud. Une seule ACTIF par élève est garantie (règle applicative).
    if let Err(e) = repair_missing_active_enrollments(conn, &mut pull_warnings) {
        pull_errors.push(format!("réparation des inscriptions manquantes : {}", e));
        pull_had_error = true;
    }

    // Après le pull, les paiements reçus du cloud peuvent rendre obsolètes les
    // montant_paye locaux des échéances. On les recalcule depuis les paiements
    // valides réels AVANT de pousser, pour ne pas écraser le cloud avec des
    // valeurs périmées (convergence inter-machines).
    let _ = conn.execute(
        "UPDATE Echeance SET montant_paye = COALESCE(\
            (SELECT SUM(COALESCE(p.montant_affecte, p.montant)) FROM Paiement p \
             WHERE p.echeance_id = Echeance.id AND COALESCE(p.annule, 0) = 0), 0), \
         updated_at = ?1 \
         WHERE EXISTS (SELECT 1 FROM Paiement p WHERE p.echeance_id = Echeance.id)",
        params![now_iso()],
    );

    let mut stmt_del = conn.prepare(
        "SELECT entite, entite_id FROM \"AuditLog\" WHERE action = 'DELETE' AND created_at > ?"
    )?;
    let mut rows_del = stmt_del.query(params![last_sync])?;
    let mut deletions_by_table: HashMap<String, Vec<String>> = HashMap::new();
    while let Some(row) = rows_del.next()? {
        let entite: String = row.get(0)?;
        let entite_id: String = row.get(1)?;
        if let Some(table_name) = map_entity_to_table(&entite) {
            deletions_by_table.entry(table_name.to_string()).or_default().push(entite_id);
        }
    }
    drop(rows_del);
    drop(stmt_del);

    for (table_name, ids) in deletions_by_table {
        if ids.is_empty() { continue; }
        if table_name == "Eleve" || table_name == "User" || table_name == "Etablissement" || table_name == "AnneeScolaire" || table_name == "Paiement" {
            continue;
        }
        if table_name == "TuteurEleve" || table_name == "EleveClasse" || table_name == "FraisClasse" {
            let (col1, col2) = match table_name.as_str() {
                "TuteurEleve" => ("eleve_id", "tuteur_id"),
                "EleveClasse" => ("eleve_id", "classe_id"),
                "FraisClasse" => ("frais_scolaire_id", "classe_id"),
                _ => continue,
            };
            for id_pair in &ids {
                let parts = parse_composite_entite_id(id_pair);
                if parts.len() == 2 {
                    // Filtre correct : col1=eq.v1&col2=eq.v2 (l'ancien code utilisait
                    // parts[0] pour les deux colonnes, la suppression ne matchetait jamais).
                    let filter = format!(
                        "{}=eq.{}&{}=eq.{}",
                        col1,
                        encode_param(&parts[0]),
                        col2,
                        encode_param(&parts[1])
                    );
                    let url = format!("{}/rest/v1/{}?{}", supabase_url, table_name, filter);
                    let _ = client.delete(&url)
                        .header("apikey", &supabase_key)
                        .header("Authorization", format!("Bearer {}", supabase_key))
                        .send();
                }
            }
            continue;
        }
        let ids_filter = ids.join(",");
        let url = format!("{}/rest/v1/{}?id=in.({})", supabase_url, table_name, ids_filter);
        let _ = client.delete(&url)
            .header("apikey", &supabase_key)
            .header("Authorization", format!("Bearer {}", supabase_key))
            .send();
    }

    // Lots plus petits pour éviter les timeouts et isoler les erreurs par groupe.
    let push_batch_size = 25;
    for t in &tables {
        let blocked_parent = t.fk_deps.iter()
            .map(|(_, parent)| *parent)
            .find(|parent| failed_tables.contains(parent));
        if let Some(parent) = blocked_parent {
            push_errors.push(format!(
                "{}: ignoré, la table parente {} a échoué lors de ce run",
                t.name, parent
            ));
            push_had_error = true;
            failed_tables.insert(t.name);
            continue;
        }

        // Push complet et idempotent : on envoie l'intégralité du contenu local.
        let mut local_rows = query_table_all(conn, t.name).unwrap_or_default();
        if local_rows.is_empty() { continue; }

        sanitize_rows_for_push(conn, t.name, &mut local_rows);

        // --- AUTO-RÉPARATION CIBLÉE ---
        let mut repair_log: Vec<String> = Vec::new();
        if !local_rows.is_empty() && !t.fk_deps.is_empty() {
            repair_missing_remote_parents(
                conn,
                &client,
                &supabase_url,
                &supabase_key,
                &local_rows,
                &t.fk_deps,
                &mut repair_log,
            );
        }
        if !repair_log.is_empty() {
            let repair_successes = repair_log.iter().filter(|log| log.contains("Succès") || log.contains("déjà présent") || log.contains("absents localement")).count();
            if repair_successes != repair_log.len() {
                for log in repair_log {
                    if log.contains("Succès") || log.contains("déjà présent") || log.contains("absents localement") {
                        continue;
                    }
                    push_errors.push(format!("[AUTO-REPAIR] {}", log));
                    push_had_error = true;
                }
            }
        }
        // --- FIN AUTO-RÉPARATION ---

        // --- Filtrage des orphelins locaux (Filet de sécurité) ---
        let mut skipped_orphans = 0usize;
        for (fk_col, parent_table) in &t.fk_deps {
            let removed = filter_orphan_rows(conn, t.name, &mut local_rows, fk_col, parent_table);
            for (row_id, fk_val) in removed {
                skipped_orphans += 1;
                orphan_log.push(format!(
                    "{} id={} : {}={} absent de {}",
                    t.name, row_id, fk_col, fk_val, parent_table
                ));
            }
        }
        if let Some(stat) = stats.get_mut(t.name) {
            stat.skipped_orphans = skipped_orphans;
        }
        if local_rows.is_empty() { continue; }

        // --- COMPTE ADMIN SYSTÈME (table User) ---
        // Chaque machine crée son admin avec un id aléatoire → le pousser par
        // id (on_conflict=id) produit un 23505 sur username quand le cloud en a
        // déjà un. L'admin étant le MÊME compte partout, on le fusionne par
        // username (on_conflict=username) : créé s'il manque, mis à jour sinon.
        // Les AUTRES utilisateurs restent protégés (pas de fusion par username).
        if t.name == "User" {
            let mut table_had_error = false;
            let mut admins: Vec<Value> = Vec::new();
            let mut others: Vec<Value> = Vec::new();
            for row in local_rows {
                if row.get("username").and_then(|v| v.as_str()) == Some("admin") {
                    admins.push(row);
                } else {
                    others.push(row);
                }
            }
            local_rows = others;
            for admin_row in admins {
                let url = format!("{}/rest/v1/User?on_conflict=username", supabase_url);
                match http_post_with_retry(
                    &client,
                    &url,
                    &supabase_key,
                    &format!("Bearer {}", supabase_key),
                    &Value::Array(vec![admin_row.clone()]),
                ) {
                    Ok(resp) if resp.status().is_success() => {
                        if let Some(stat) = stats.get_mut("User") {
                            stat.pushed += 1;
                        }
                    }
                    Ok(resp) => {
                        let err_text = resp.text().unwrap_or_default();
                        push_errors.push(format!("User (admin) : {}", err_text));
                        push_had_error = true;
                        table_had_error = true;
                    }
                    Err(e) => {
                        push_errors.push(format!("User (admin) : {}", e));
                        push_had_error = true;
                        table_had_error = true;
                    }
                }
            }
            if local_rows.is_empty() {
                if table_had_error {
                    failed_tables.insert("User");
                }
                continue;
            }
        }

        let mut table_had_error = false;
        if t.name == "EleveClasse" {
            if let Err(e) = clear_remote_active_enrollment_conflicts(
                &client,
                &supabase_url,
                &supabase_key,
                &local_rows,
            ) {
                push_errors.push(format!("EleveClasse: préparation des classes actives impossible : {}", e));
                push_had_error = true;
                table_had_error = true;
            }
        }

        // Tables dont la clé unique secondaire peut être utilisée comme cible de
        // fusion SANS perte de données (deux lignes portant la même clé unique
        // désignent logiquement la même donnée).
        // Pour les autres (Eleve.matricule, User.username, Paiement.numero_recu),
        // une fusion silencieuse ÉCRASERAIT une donnée : on préfère signaler l'erreur.
        const SAFE_UNIQUE_MERGE: &[&str] = &[
            "AnneeScolaire",
            "Classe",
            "Echeance",
            "AnnulationRecu",
            "ParametreEtablissement",
        ];
        let can_merge_on_unique = !t.unique_cols.is_empty() && SAFE_UNIQUE_MERGE.contains(&t.name);

        let batches: Vec<Vec<Value>> = local_rows.chunks(push_batch_size).map(|chunk| chunk.to_vec()).collect();

        // Enregistre une erreur de push avec limitation par table (5 détaillées
        // + compte global) pour ne pas noyer le résumé.
        let mut record_push_error = |table: &str, msg: String| {
            let count = push_error_counts.entry(table.to_string()).or_insert(0);
            *count += 1;
            if *count <= 5 {
                push_errors.push(format!("{}: {}", table, msg));
            } else if *count == 6 {
                push_errors.push(format!("{}: … et d'autres erreurs ({} déjà comptées)", table, *count - 1));
            }
        };

        for batch in &batches {
            let on_conflict = format!("on_conflict={}", t.pk_cols.join(","));
            let url = format!("{}/rest/v1/{}?{}", supabase_url, t.name, on_conflict);
            let res = http_post_with_retry(&client, &url, &supabase_key, &format!("Bearer {}", supabase_key), &Value::Array(batch.clone()));

            match res {
                Ok(resp) => {
                    if resp.status().is_success() {
                        if let Some(stat) = stats.get_mut(t.name) {
                            stat.pushed += batch.len();
                        }
                        continue;
                    } else {
                        let err_text = resp.text().unwrap_or_default();

                        if can_merge_on_unique {
                            let alt_on_conflict = format!("on_conflict={}", t.unique_cols.join(","));
                            let alt_url = format!("{}/rest/v1/{}?{}", supabase_url, t.name, alt_on_conflict);
                            let alt_res = http_post_with_retry(&client, &alt_url, &supabase_key, &format!("Bearer {}", supabase_key), &Value::Array(batch.clone()));

                            if let Ok(alt_resp) = alt_res {
                                if alt_resp.status().is_success() {
                                    if let Some(stat) = stats.get_mut(t.name) {
                                        stat.pushed += batch.len();
                                    }
                                    continue;
                                }
                            }
                        }

                        // Eleve / Paiement : un conflit de clé unique secondaire
                        // (matricule / numero_recu déjà pris par une AUTRE ligne
                        // côté cloud) rejette TOUT le lot. On réessaie ligne par
                        // ligne ; les lignes en conflit sont renommées localement
                        // (code dérivé de l'id, déterministe) puis repoussées.
                        if t.name == "Eleve" || t.name == "Paiement" {
                            let mut pushed_in_batch = 0usize;
                            let mut batch_failed = false;
                            for row in batch {
                                match push_row_with_unique_fallback(
                                    conn,
                                    &client,
                                    &supabase_url,
                                    &supabase_key,
                                    t.name,
                                    &t.pk_cols,
                                    row,
                                ) {
                                    Ok(()) => pushed_in_batch += 1,
                                    Err(msg) => {
                                        batch_failed = true;
                                        record_push_error(t.name, msg);
                                    }
                                }
                            }
                            if pushed_in_batch > 0 {
                                if let Some(stat) = stats.get_mut(t.name) {
                                    stat.pushed += pushed_in_batch;
                                }
                            }
                            if batch_failed {
                                push_had_error = true;
                                table_had_error = true;
                            }
                            continue;
                        }

                        if t.name != "AuditLog" {
                            record_push_error(t.name, err_text);
                        } else {
                            println!("Note AuditLog (non critique) : {}", err_text);
                        }
                        push_had_error = true;
                        table_had_error = true;
                    }
                }
                Err(e) => {
                    if t.name != "AuditLog" {
                        record_push_error(t.name, e.to_string());
                    }
                    push_had_error = true;
                    table_had_error = true;
                }
            }
        }

        if table_had_error && t.name != "AuditLog" {
            failed_tables.insert(t.name);
        }
    }

    let end_time = now_iso();
    // LAST_SYNC n'avance QUE si PUSH et PULL se sont terminés sans erreur.
    // Si le pull a échoué (ex. coupure réseau pendant le téléchargement), ne pas
    // avancer LAST_SYNC garantit que les suppressions distantes et les données
    // manquées seront re-téléchargées au prochain run au lieu d'être oubliées.
    let sync_clean = !push_had_error && !pull_had_error;
    if sync_clean {
        let uuid_str = uuid::Uuid::new_v4().to_string();
        let _ = conn.execute(
            "INSERT INTO ConfigSysteme (id, cle, valeur, created_at, updated_at) \
             VALUES (?1, 'LAST_SYNC', ?2, ?3, ?3) \
             ON CONFLICT(cle) DO UPDATE SET valeur = ?2, updated_at = ?3",
            params![uuid_str, end_time, end_time],
        )?;
    }

    for (_, stat) in &stats {
        if stat.pushed > 0 || stat.pulled > 0 || stat.skipped_orphans > 0 {
            let log_id = uuid::Uuid::new_v4().to_string();
            let details = serde_json::json!({
                "pushed": stat.pushed,
                "pulled": stat.pulled,
                "skipped_orphans": stat.skipped_orphans
            }).to_string();

            let sync_status = if sync_clean { "SUCCESS" } else { "WARNING" };
            let _ = conn.execute(
                "INSERT INTO SyncLog (id, table_name, last_sync_at, direction, status, details, created_at) \
                 VALUES (?1, ?2, ?3, 'BIDIRECTIONAL', ?4, ?5, ?3)",
                params![log_id, stat.table_name, end_time, sync_status, details],
            );
        }
    }

    if !orphan_log.is_empty() {
        let log_id = uuid::Uuid::new_v4().to_string();
        let details = serde_json::json!({ "orphans": orphan_log }).to_string();
        let _ = conn.execute(
            "INSERT INTO SyncLog (id, table_name, last_sync_at, direction, status, details, created_at) \
             VALUES (?1, 'ORPHANS', ?2, 'PUSH', 'WARNING', ?3, ?2)",
            params![log_id, end_time, details],
        );
    }

    if !pull_errors.is_empty() {
        let log_id = uuid::Uuid::new_v4().to_string();
        let details = serde_json::json!({ "pull_errors": pull_errors }).to_string();
        let _ = conn.execute(
            "INSERT INTO SyncLog (id, table_name, last_sync_at, direction, status, details, created_at) \
             VALUES (?1, 'PULL', ?2, 'PULL', 'WARNING', ?3, ?2)",
            params![log_id, end_time, details],
        );
    }

    // Renommages automatiques (matricules / numéros de reçu en double résolus)
    // et comptes User en double ignorés : visibles dans le journal + le résumé,
    // mais ne font PAS échouer la synchro.
    if !pull_warnings.is_empty() {
        let log_id = uuid::Uuid::new_v4().to_string();
        let details = serde_json::json!({ "resolved": pull_warnings }).to_string();
        let _ = conn.execute(
            "INSERT INTO SyncLog (id, table_name, last_sync_at, direction, status, details, created_at) \
             VALUES (?1, 'CONFLICTS', ?2, 'PULL', 'WARNING', ?3, ?2)",
            params![log_id, end_time, details],
        );
    }

    // Nettoyage du journal d'audit : on ne supprime JAMAIS les entrées DELETE
    // plus récentes que la dernière synchro réussie — ce sont des suppressions
    // locales pas encore poussées vers le cloud. Les supprimer ferait perdre
    // définitivement la suppression au niveau du serveur (données fantômes).
    let _ = conn.execute(
        "DELETE FROM \"AuditLog\" \
         WHERE id NOT IN (SELECT id FROM \"AuditLog\" ORDER BY created_at DESC LIMIT 200) \
           AND NOT (action = 'DELETE' AND created_at > COALESCE(\
                (SELECT valeur FROM ConfigSysteme WHERE cle = 'LAST_SYNC'), '1970-01-01T00:00:00Z'))",
        [],
    );

    let _ = conn.execute_batch("PRAGMA foreign_keys=ON;");

    let mut stats_vec: Vec<TableSyncStats> = stats.into_values().collect();
    stats_vec.sort_by(|a, b| a.table_name.cmp(&b.table_name));

    let mut all_warnings: Vec<String> = Vec::new();
    all_warnings.extend(pull_errors.iter().cloned());
    all_warnings.extend(push_errors.iter().cloned());
    let resolved_count = pull_warnings.len();

    let message = if all_warnings.is_empty() {
        if resolved_count > 0 {
            format!(
                "Synchronisation réussie avec {} conflit(s) résolu(s) automatiquement (matricules / numéros de reçu renommés) — voir SyncLog.",
                resolved_count
            )
        } else {
            "Synchronisation réussie avec succès !".to_string()
        }
    } else {
        format!("Synchronisation effectuée avec des avertissements : {}", all_warnings.join(" | "))
    };

    Ok(SyncSummary {
        success: all_warnings.is_empty(),
        start_time,
        end_time,
        stats: stats_vec,
        message,
    })
}

// =====================================================================
// FONCTIONS D'AUTO-RÉPARATION
// =====================================================================

fn query_local_rows_by_ids(
    conn: &Connection,
    table_name: &str,
    ids: &[String],
) -> Result<Vec<Value>, AppError> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    // SQLite et les URL Supabase ont des limites pratiques sur la taille des lots.
    // Découper plutôt que d'abandonner lorsque beaucoup de parents sont requis.
    if ids.len() > 500 {
        let mut all_rows = Vec::new();
        for chunk in ids.chunks(500) {
            all_rows.extend(query_local_rows_by_ids(conn, table_name, &chunk.to_vec())?);
        }
        return Ok(all_rows);
    }

    let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let query = format!(
        "SELECT * FROM \"{}\" WHERE \"id\" IN ({})",
        table_name,
        placeholders.join(", ")
    );

    let mut stmt = conn.prepare(&query)?;
    let col_count = stmt.column_count();
    let col_names: Vec<String> = (0..col_count)
        .map(|i| stmt.column_name(i).unwrap_or_default().to_string())
        .collect();

    let params: Vec<&dyn rusqlite::types::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
    let mut rows = stmt.query(params.as_slice())?;
    
    let mut results = Vec::new();
    while let Some(row) = rows.next()? {
        let mut map = serde_json::Map::new();
        for i in 0..col_count {
            let col_name = &col_names[i];
            let val = match row.get_ref(i)? {
                rusqlite::types::ValueRef::Null => Value::Null,
                rusqlite::types::ValueRef::Integer(n) => Value::Number(n.into()),
                rusqlite::types::ValueRef::Real(f) => {
                    if let Some(num) = serde_json::Number::from_f64(f) { Value::Number(num) } else { Value::Null }
                }
                rusqlite::types::ValueRef::Text(t) => Value::String(std::str::from_utf8(t).unwrap_or_default().to_string()),
                rusqlite::types::ValueRef::Blob(b) => Value::String(std::str::from_utf8(b).unwrap_or_default().to_string()),
            };
            map.insert(col_name.clone(), val);
        }
        results.push(Value::Object(map));
    }

    Ok(results)
}

fn repair_missing_remote_parents(
    conn: &Connection,
    client: &reqwest::blocking::Client,
    supabase_url: &str,
    supabase_key: &str,
    child_rows: &[Value],
    fk_deps: &[(&'static str, &'static str)],
    repair_log: &mut Vec<String>,
) {
    for (fk_col, parent_table) in fk_deps {
        let mut required_ids: HashSet<String> = HashSet::new();
        for row in child_rows {
            if let Some(id) = row.get(fk_col).and_then(|v| v.as_str()) {
                if !id.is_empty() {
                    required_ids.insert(id.to_string());
                }
            }
        }
        if required_ids.is_empty() { continue; }

        let ids_filter = required_ids.iter().cloned().collect::<Vec<_>>().join(",");
        let check_url = format!("{}/rest/v1/{}?id=in.({})&select=id", supabase_url, parent_table, ids_filter);

        let mut existing_ids: HashSet<String> = HashSet::new();
        if let Ok(resp) = http_get_with_retry(client, &check_url, supabase_key, &format!("Bearer {}", supabase_key), None) {
            if resp.status().is_success() {
                if let Ok(remote_rows) = resp.json::<Vec<Value>>() {
                    for r in remote_rows {
                        if let Some(id) = r.get("id").and_then(|v| v.as_str()) {
                            existing_ids.insert(id.to_string());
                        }
                    }
                }
            }
        }

        let missing_ids: Vec<String> = required_ids.difference(&existing_ids).cloned().collect();
        if missing_ids.is_empty() {
            continue;
        }

        let local_missing_rows = match query_local_rows_by_ids(conn, parent_table, &missing_ids) {
            Ok(r) => r,
            Err(e) => {
                repair_log.push(format!("Échec de la récupération locale des parents manquants pour {} : {}", parent_table, e));
                continue;
            }
        };

        if local_missing_rows.is_empty() {
            repair_log.push(format!("Parents référencés absents localement pour {} : aucune donnée disponible pour rétablir le parent", parent_table));
            continue;
        }

        // L'utilisateur système admin est créé localement et existe déjà dans Supabase.
        // Il ne doit pas être recréé avec un autre UUID local.
        let local_missing_rows: Vec<Value> = if *parent_table == "User" {
            local_missing_rows
                .into_iter()
                .filter(|row| row.get("username").and_then(|v| v.as_str()) != Some("admin"))
                .collect()
        } else {
            local_missing_rows
        };
        if local_missing_rows.is_empty() {
            continue;
        }

        // Réparer récursivement toute la chaîne avant de pousser le parent.
        // Exemple : AnnulationRecu -> Paiement -> Eleve -> AnneeScolaire -> Etablissement.
        let mut repairing: HashSet<String> = HashSet::new();
        if !push_rows_with_dependencies(
            conn,
            client,
            supabase_url,
            supabase_key,
            parent_table,
            &local_missing_rows,
            repair_log,
            &mut repairing,
        ) {
            continue;
        }
    }
}

fn dependency_configs(table_name: &str) -> Vec<(&'static str, &'static str)> {
    match table_name {
        "User" => vec![("etablissement_id", "Etablissement")],
        "AnneeScolaire" => vec![("etablissement_id", "Etablissement")],
        "Classe" => vec![("etablissement_id", "Etablissement"), ("annee_scolaire_id", "AnneeScolaire")],
        "Eleve" => vec![("etablissement_id", "Etablissement"), ("annee_scolaire_id", "AnneeScolaire")],
        "TuteurEleve" => vec![("eleve_id", "Eleve"), ("tuteur_id", "Tuteur")],
        "EleveClasse" => vec![("eleve_id", "Eleve"), ("classe_id", "Classe")],
        "FraisScolaire" => vec![("etablissement_id", "Etablissement"), ("annee_scolaire_id", "AnneeScolaire")],
        "FraisClasse" => vec![("frais_scolaire_id", "FraisScolaire"), ("classe_id", "Classe")],
        "Echeance" => vec![("eleve_id", "Eleve"), ("frais_scolaire_id", "FraisScolaire"), ("annee_scolaire_id", "AnneeScolaire")],
        "Paiement" => vec![("eleve_id", "Eleve"), ("echeance_id", "Echeance"), ("etablissement_id", "Etablissement"), ("annee_scolaire_id", "AnneeScolaire"), ("user_id", "User")],
        "AnnulationRecu" => vec![("paiement_id", "Paiement"), ("user_id", "User")],
        "Depense" => vec![("etablissement_id", "Etablissement"), ("annee_scolaire_id", "AnneeScolaire"), ("created_by_id", "User")],
        "ParametreEtablissement" => vec![("etablissement_id", "Etablissement"), ("annee_scolaire_id", "AnneeScolaire")],
        "AuditLog" => vec![("user_id", "User")],
        _ => Vec::new(),
    }
}

fn push_rows_with_dependencies(
    conn: &Connection,
    client: &reqwest::blocking::Client,
    supabase_url: &str,
    supabase_key: &str,
    table_name: &str,
    rows: &[Value],
    repair_log: &mut Vec<String>,
    repairing: &mut HashSet<String>,
) -> bool {
    if rows.is_empty() {
        return true;
    }
    if !repairing.insert(table_name.to_string()) {
        repair_log.push(format!("Dépendance circulaire détectée vers '{}'", table_name));
        return false;
    }

    let mut ok = true;
    for (fk_col, parent_table) in dependency_configs(table_name) {
        let ids: Vec<String> = rows.iter()
            .filter_map(|row| row.get(fk_col).and_then(|v| v.as_str()))
            .filter(|id| !id.is_empty())
            .map(ToOwned::to_owned)
            .collect();
        if ids.is_empty() {
            continue;
        }
        let local_parent_rows = match query_local_rows_by_ids(conn, parent_table, &ids) {
            Ok(parent_rows) => parent_rows,
            Err(e) => {
                repair_log.push(format!("Échec de la récupération locale des parents pour {} : {}", parent_table, e));
                ok = false;
                continue;
            }
        };
        if local_parent_rows.len() != ids.iter().collect::<HashSet<_>>().len() {
            repair_log.push(format!("Parents référencés absents localement pour {}", parent_table));
            ok = false;
            continue;
        }
        if !push_rows_with_dependencies(conn, client, supabase_url, supabase_key, parent_table, &local_parent_rows, repair_log, repairing) {
            ok = false;
        }
    }

    if ok {
        let push_url = format!("{}/rest/v1/{}?on_conflict=id", supabase_url, table_name);
        // Merge volontairement désactivé : l'auto-réparation pousse des parents
        // par leur id. En cas de conflit de clé unique secondaire, on préfère
        // échouer (et logguer) plutôt que d'écraser une autre ligne.
        match http_post_with_retry(client, &push_url, supabase_key, &format!("Bearer {}", supabase_key), &Value::Array(rows.to_vec())) {
            Ok(resp) if resp.status().is_success() => {}
            Ok(resp) => {
                repair_log.push(format!("ÉCHEC du push vers '{}' : {}", table_name, resp.text().unwrap_or_default()));
                ok = false;
            }
            Err(e) => {
                repair_log.push(format!("Erreur réseau vers '{}' : {}", table_name, e));
                ok = false;
            }
        }
    }

    repairing.remove(table_name);
    ok
}

fn clear_remote_active_enrollment_conflicts(
    client: &reqwest::blocking::Client,
    supabase_url: &str,
    supabase_key: &str,
    rows: &[Value],
) -> Result<(), String> {
    let mut active_eleve_ids: HashSet<String> = HashSet::new();
    for row in rows {
        let is_active = row.get("statut").and_then(|v| v.as_str()) == Some("ACTIF");
        if is_active {
            if let Some(eleve_id) = row.get("eleve_id").and_then(|v| v.as_str()) {
                if !eleve_id.is_empty() {
                    active_eleve_ids.insert(eleve_id.to_string());
                }
            }
        }
    }

    for eleve_id in active_eleve_ids {
        let url = format!(
            "{}/rest/v1/EleveClasse?eleve_id=eq.{}&statut=eq.ACTIF",
            supabase_url,
            encode_param(&eleve_id),
        );
        let response = client
            .patch(&url)
            .header("apikey", supabase_key)
            .header("Authorization", format!("Bearer {}", supabase_key))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({"statut": "TRANSFERE"}))
            .send()
            .map_err(|e| format!("erreur réseau pour l'élève {} : {}", eleve_id, e))?;

        if !response.status().is_success() {
            return Err(format!(
                "échec de neutralisation de l'inscription active de l'élève {} : {}",
                eleve_id,
                response.text().unwrap_or_default()
            ));
        }
    }
    Ok(())
}

// =====================================================================
// FONCTIONS UTILITAIRES
// =====================================================================

/// Identifiant lisible d'une ligne pour les logs : `id` si la table en a une,
/// sinon la clé composite (eleve_id/classe_id/tuteur_id/…) pour les tables de
/// liaison (EleveClasse, TuteurEleve, FraisClasse n'ont pas de colonne `id`).
fn describe_row_id(row: &Value) -> String {
    if let Some(id) = row.get("id").and_then(|v| v.as_str()) {
        if !id.is_empty() {
            return id.to_string();
        }
    }
    let parts: Vec<String> = [
        "eleve_id", "classe_id", "tuteur_id", "frais_scolaire_id",
        "paiement_id", "echeance_id", "annee_scolaire_id", "etablissement_id",
    ]
    .iter()
    .filter_map(|col| {
        row.get(*col)
            .and_then(|v| v.as_str())
            .filter(|v| !v.is_empty())
            .map(|v| format!("{}={}", col, v))
    })
    .collect();
    if parts.is_empty() {
        "?".to_string()
    } else {
        parts.join(" ")
    }
}

/// Filet de sécurité (côté push) : retire des lignes locales dont un parent FK
/// est ABSENT de la base locale. Ces lignes sont orphelines (le cloud les
/// rejetterait avec une violation de FK) ; le détail complet de chaque ligne
/// est enregistré dans SyncLog/ORPHANS, et un résumé limité est affiché en
/// console pour éviter le spam (des centaines de lignes possibles).
fn filter_orphan_rows(
    conn: &Connection,
    table_name: &str,
    rows: &mut Vec<Value>,
    fk_col: &str,
    parent_table: &str,
) -> Vec<(String, String)> {
    let mut valid_parents: HashSet<String> = HashSet::new();
    if let Ok(mut stmt) = conn.prepare(&format!("SELECT id FROM \"{}\"", parent_table)) {
        if let Ok(mut r) = stmt.query([]) {
            while let Ok(Some(row)) = r.next() {
                if let Ok(id) = row.get::<_, String>(0) {
                    valid_parents.insert(id);
                }
            }
        }
    }

    let mut removed = Vec::new();
    let mut orphan_desc: Vec<String> = Vec::new();
    rows.retain(|row| {
        let fk_val = row.get(fk_col).and_then(|v| v.as_str());
        match fk_val {
            None => true,
            Some(fk) if fk.is_empty() => true,
            Some(fk) => {
                if valid_parents.contains(fk) {
                    true
                } else {
                    let row_id = describe_row_id(row);
                    orphan_desc.push(format!(
                        "{} ({}) : {}={} absent de {}",
                        table_name, row_id, fk_col, fk, parent_table
                    ));
                    removed.push((row_id, fk.to_string()));
                    false
                }
            }
        }
    });

    // Console : 10 détails max + résumé (le détail complet est dans SyncLog/ORPHANS).
    for line in orphan_desc.iter().take(10) {
        eprintln!("[SYNC] {} — ligne ignorée au push (orpheline)", line);
    }
    if orphan_desc.len() > 10 {
        eprintln!(
            "[SYNC] … et {} autres lignes orphelines ignorées au push (détail complet dans SyncLog/ORPHANS)",
            orphan_desc.len() - 10
        );
    }
    removed
}

fn delete_composite_row(conn: &Connection, table_name: &str, entite_id: &str) -> Result<(), AppError> {
    match table_name {
        "TuteurEleve" | "EleveClasse" | "FraisClasse" => {
            let (col1, col2) = match table_name {
                "TuteurEleve" => ("eleve_id", "tuteur_id"),
                "EleveClasse" => ("eleve_id", "classe_id"),
                "FraisClasse" => ("frais_scolaire_id", "classe_id"),
                _ => unreachable!(),
            };

            let parts = parse_composite_entite_id(entite_id);

            if parts.len() >= 2 {
                let sql = format!("DELETE FROM \"{}\" WHERE \"{}\" = ? AND \"{}\" = ?", table_name, col1, col2);
                conn.execute(&sql, params![parts[0], parts[1]])?;
            }
        }
        _ => {
            let sql = format!("DELETE FROM \"{}\" WHERE \"id\" = ?", table_name);
            conn.execute(&sql, params![entite_id])?;
        }
    }
    Ok(())
}

fn sanitize_rows_for_push(conn: &Connection, table_name: &str, rows: &mut Vec<Value>) {
    if table_name != "Paiement" && table_name != "AuditLog" && table_name != "AnnulationRecu" && table_name != "Depense" {
        return;
    }

    let mut valid_users: Vec<String> = Vec::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id FROM \"User\"") {
        if let Ok(mut rows_user) = stmt.query([]) {
            while let Ok(Some(row)) = rows_user.next() {
                if let Ok(uid) = row.get::<_, String>(0) {
                    valid_users.push(uid);
                }
            }
        }
    }

    let default_user_id = valid_users.first().cloned();

    for row in rows.iter_mut() {
        if let Some(map) = row.as_object_mut() {
            if table_name == "AuditLog" {
                if let Some(uid_val) = map.get("user_id").and_then(|v| v.as_str()) {
                    if !uid_val.is_empty() && !valid_users.contains(&uid_val.to_string()) {
                        map.insert("user_id".to_string(), Value::Null);
                    }
                }
            } else {
                let field = if table_name == "Depense" { "created_by_id" } else { "user_id" };
                if let Some(uid_val) = map.get(field).and_then(|v| v.as_str()) {
                    if !uid_val.is_empty() && !valid_users.contains(&uid_val.to_string()) {
                        if let Some(ref fallback) = default_user_id {
                            map.insert(field.to_string(), Value::String(fallback.clone()));
                        } else {
                            map.insert(field.to_string(), Value::Null);
                        }
                    }
                }
            }
        }
    }
}

fn query_table_all(
    conn: &Connection,
    table_name: &str,
) -> Result<Vec<Value>, AppError> {
    let query = format!("SELECT * FROM \"{}\"", table_name);
    let mut stmt = conn.prepare(&query)?;
    let col_count = stmt.column_count();

    let col_names: Vec<String> = (0..col_count)
        .map(|i| stmt.column_name(i).unwrap_or_default().to_string())
        .collect();

    let mut rows = stmt.query([])?;
    let mut results = Vec::new();

    while let Some(row) = rows.next()? {
        let mut map = serde_json::Map::new();
        for i in 0..col_count {
            let col_name = &col_names[i];
            let val = match row.get_ref(i)? {
                rusqlite::types::ValueRef::Null => Value::Null,
                rusqlite::types::ValueRef::Integer(n) => Value::Number(n.into()),
                rusqlite::types::ValueRef::Real(f) => {
                    if let Some(num) = serde_json::Number::from_f64(f) {
                        Value::Number(num)
                    } else {
                        Value::Null
                    }
                }
                rusqlite::types::ValueRef::Text(t) => {
                    let s = std::str::from_utf8(t).unwrap_or_default();
                    Value::String(s.to_string())
                }
                rusqlite::types::ValueRef::Blob(b) => {
                    let s = std::str::from_utf8(b).unwrap_or_default();
                    Value::String(s.to_string())
                }
            };
            map.insert(col_name.clone(), val);
        }
        results.push(Value::Object(map));
    }

    Ok(results)
}

/// Restaure en ACTIF les élèves localement TRANSFERE dont la suppression n'est
/// documentée nulle part (ni dans l'AuditLog local, ni dans l'AuditLog distant).
/// Une seule fois en pratique : une fois restaurés, ils repartent ACTIF vers le
/// cloud au push suivant et les deux côtés convergent.
fn repair_ghost_transferes(
    conn: &Connection,
    client: &reqwest::blocking::Client,
    supabase_url: &str,
    supabase_key: &str,
    pull_warnings: &mut Vec<String>,
) {
    // 1) Élèves localement TRANSFERE (sans lui, pas de travail à faire)
    let mut transferes: Vec<String> = Vec::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id FROM \"Eleve\" WHERE statut = 'TRANSFERE'") {
        if let Ok(mut rows) = stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let Ok(id) = row.get::<_, String>(0) {
                    transferes.push(id);
                }
            }
        }
    }
    if transferes.is_empty() {
        return;
    }

    // 2) Suppressions documentées localement
    let mut documented: HashSet<String> = HashSet::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT entite_id FROM \"AuditLog\" \
         WHERE action = 'DELETE' AND entite IN ('eleve', 'Eleve') AND entite_id IS NOT NULL",
    ) {
        if let Ok(mut rows) = stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let Ok(id) = row.get::<_, String>(0) {
                    documented.insert(id);
                }
            }
        }
    }

    // 3) Suppressions documentées dans l'AuditLog distant (historique complet,
    //    pas seulement depuis LAST_SYNC : un archivage ancien reste documenté).
    let mut offset = 0usize;
    let page_size = 1000usize;
    loop {
        let range_header = format!("{}-{}", offset, offset + page_size - 1);
        let url = format!(
            "{}/rest/v1/AuditLog?action=eq.DELETE&entite=in.(eleve,Eleve)&select=entite_id&entite_id=not.is.null",
            supabase_url
        );
        match http_get_with_retry(client, &url, supabase_key, &format!("Bearer {}", supabase_key), Some(&range_header)) {
            Ok(resp) => {
                let status = resp.status().as_u16();
                if status == 416 {
                    break;
                }
                if status != 200 && status != 206 {
                    break;
                }
                match resp.json::<Vec<Value>>() {
                    Ok(rows) => {
                        let count = rows.len();
                        for r in rows {
                            if let Some(id) = r.get("entite_id").and_then(|v| v.as_str()) {
                                if !id.is_empty() {
                                    documented.insert(id.to_string());
                                }
                            }
                        }
                        if count < page_size {
                            break;
                        }
                        offset += page_size;
                    }
                    Err(_) => break,
                }
            }
            Err(_) => break,
        }
    }

    // 4) Restaurer les élèves TRANSFERE non documentés
    let mut candidates: Vec<String> = Vec::new();
    for id in transferes {
        if !documented.contains(&id) {
            candidates.push(id);
        }
    }

    if candidates.is_empty() {
        return;
    }

    let now = now_iso();
    let mut restored = 0usize;
    for id in &candidates {
        let ok = conn.execute(
            "UPDATE \"Eleve\" SET statut = 'ACTIF', updated_at = ?1 WHERE id = ?2 AND statut = 'TRANSFERE'",
            params![now, id],
        );
        if let Ok(affected) = ok {
            restored += affected as usize;
        }
    }
    if restored > 0 {
        let msg = format!(
            "{} élève(s) restauré(s) ACTIF (TRANSFERE sans suppression documentée — ancien bug)",
            restored
        );
        eprintln!("[SYNC] {}", msg);
        pull_warnings.push(msg);
    }
}

/// Répare les élèves ACTIF/INSCRIT qui n'ont AUCUNE inscription ACTIF dans
/// EleveClasse (hérité du bug « TRANSFERE fantôme ») : ils sont invisibles des
/// effectifs de classe, du dashboard et de la classe affichée sur les paiements.
///
/// L'application ne connaît AUCUNE opération légitime qui laisse un élève
/// ACTIF/INSCRIT sans inscription ACTIF (création ⇒ ACTIF, changement de
/// classe ⇒ ancienne TRANSFERE + nouvelle ACTIF, archivage ⇒ Élève TRANSFERE) :
/// on réactive donc l'inscription la plus récente de l'élève. Le push suivant
/// propage la correction au cloud (upsert sur (eleve_id, classe_id)).
fn repair_missing_active_enrollments(
    conn: &Connection,
    pull_warnings: &mut Vec<String>,
) -> Result<(), AppError> {
    // Élèves ACTIF/INSCRIT sans aucune inscription ACTIF
    let mut candidates: Vec<String> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT DISTINCT e.id FROM \"Eleve\" e \
         WHERE e.statut IN ('ACTIF','INSCRIT') \
           AND NOT EXISTS (SELECT 1 FROM \"EleveClasse\" ec \
                           WHERE ec.eleve_id = e.id AND ec.statut = 'ACTIF')",
    ) {
        if let Ok(mut rows) = stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let Ok(id) = row.get::<_, String>(0) {
                    candidates.push(id);
                }
            }
        }
    }
    if candidates.is_empty() {
        return Ok(());
    }

    let mut restored = 0usize;
    for eleve_id in candidates {
        // Inscription la plus récente (date_sortie NULL = toujours en cours)
        let best: Option<String> = conn
            .query_row(
                "SELECT classe_id FROM \"EleveClasse\" \
                 WHERE eleve_id = ?1 AND statut != 'ACTIF' \
                 ORDER BY date_inscription DESC, date_sortie IS NULL DESC, classe_id \
                 LIMIT 1",
                [&eleve_id],
                |r| r.get(0),
            )
            .ok();
        if let Some(classe_id) = best {
            let affected = conn.execute(
                "UPDATE \"EleveClasse\" SET statut = 'ACTIF', date_sortie = NULL \
                 WHERE eleve_id = ?1 AND classe_id = ?2",
                params![eleve_id, classe_id],
            )?;
            if affected > 0 {
                restored += 1;
                if let Ok((nom, prenom, matricule, classe_nom)) = conn.query_row(
                    "SELECT e.nom, e.prenom, e.matricule, COALESCE(c.nom, '?') \
                     FROM \"Eleve\" e LEFT JOIN \"Classe\" c ON c.id = ?2 \
                     WHERE e.id = ?1",
                    params![eleve_id, classe_id],
                    |r| Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                    )),
                ) {
                    pull_warnings.push(format!(
                        "Élève {} {} ({}) : aucune classe active — inscription en {} réactivée (ACTIF)",
                        nom, prenom, matricule, classe_nom
                    ));
                }
            }
        }
    }
    if restored > 0 {
        let msg = format!(
            "{} élève(s) ACTIF/INSCRIT sans classe active — inscription la plus récente réactivée",
            restored
        );
        eprintln!("[SYNC] {}", msg);
    }
    Ok(())
}

/// Applique une suppression distante (issue de l'AuditLog) à la base locale.
///
/// Les tables que l'application gère en "archivage" (soft delete) sont traitées
/// comme telles — sinon on supprimerait physiquement l'élève puis le pull
/// complet le ré-importerait depuis le cloud avec son statut TRANSFERE, ce qui
/// faisait apparaître des élèves non archivés comme « Transféré ».
fn apply_remote_delete(
    conn: &Connection,
    table_name: &str,
    entite_id: &str,
    deleted_ids: &mut HashMap<String, HashSet<String>>,
) -> Result<(), AppError> {
    deleted_ids
        .entry(table_name.to_string())
        .or_default()
        .insert(entite_id.to_string());

    match table_name {
        // Soft delete (comme le bouton « Archiver » de l'application)
        "Eleve" => {
            conn.execute(
                "UPDATE \"Eleve\" SET statut = 'TRANSFERE', updated_at = ?1 WHERE id = ?2",
                params![now_iso(), entite_id],
            )?;
        }
        "User" => {
            conn.execute(
                "UPDATE \"User\" SET actif = 0, updated_at = ?1 WHERE id = ?2",
                params![now_iso(), entite_id],
            )?;
        }
        "Etablissement" => {
            conn.execute(
                "UPDATE \"Etablissement\" SET actif = 0, updated_at = ?1 WHERE id = ?2",
                params![now_iso(), entite_id],
            )?;
        }
        // Hard delete pour les tables réellement supprimées dans l'application
        _ => delete_composite_row(conn, table_name, entite_id)?,
    }
    Ok(())
}

/// Empêche qu'un élève localement actif soit rétrogradé TRANSFERE par une ligne
/// distante dont la suppression n'est PAS documentée dans le journal d'audit.
fn protect_eleve_statut(
    conn: &Connection,
    row_map: &mut serde_json::Map<String, Value>,
    pull_warnings: &mut Vec<String>,
    remote_deleted_ids: &HashMap<String, HashSet<String>>,
) {
    let remote_statut = match row_map.get("statut").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return,
    };
    if remote_statut != "TRANSFERE" {
        return;
    }
    let Some(id_ref) = row_map.get("id").and_then(|v| v.as_str()) else {
        return;
    };
    if id_ref.is_empty() {
        return;
    }
    // String possédée : `id` est utilisé APRÈS `row_map.insert(...)` plus bas,
    // une référence empruntée à row_map provoquerait E0502 (emprunt mutable
    // pendant qu'un emprunt immuable est encore vivant).
    let id = id_ref.to_string();

    // Statut local actuel de l'élève
    let local_statut: Option<String> = conn
        .query_row("SELECT statut FROM \"Eleve\" WHERE id = ?1", [&id], |r| r.get(0))
        .ok();
    let local_active = match local_statut.as_deref() {
        Some(s) => s != "TRANSFERE",
        // Élève inconnu localement : on insère tel quel (probable nouvel archivé distant).
        None => return,
    };
    if !local_active {
        return; // déjà archivé localement : rien à protéger
    }

    // La suppression est-elle documentée dans l'AuditLog distant (ce run) ?
    let audit_backed = remote_deleted_ids
        .get("Eleve")
        .map(|ids| ids.contains(&id))
        .unwrap_or(false);

    if !audit_backed {
        // Cloud périmé/pollué : on conserve l'état local ACTIF/INSCRIT.
        if let Some(local) = local_statut {
            row_map.insert("statut".to_string(), Value::String(local.clone()));
        }
        pull_warnings.push(format!(
            "Eleve (id {}) : marqué TRANSFERE côté cloud sans suppression journalisée — statut local conservé",
            id
        ));
    }
}

/// Insère ou réconcilie une ligne distante dans la base locale.
///
/// Résout les conflits de clé unique secondaire qui, sinon, feraient échouer
/// toute la synchro en boucle (cas des matricules / numéros de reçu en double
/// hérités de l'ancien générateur sans code machine) :
/// - `EleveClasse` : neutralise d'abord les inscriptions ACTIF concurrentes.
/// - `Eleve` / `Paiement` : si la clé unique (matricule / numero_recu) est déjà
///   prise par une AUTRE ligne locale, la ligne distante est renommée avec un
///   code DÉRIVÉ DE SON ID — déterministe, donc toutes les machines calculent
///   la même valeur et la synchro converge au lieu d'échouer.
/// - `User` : le compte système `admin` (créé sur chaque machine avec un id
///   aléatoire) est aligné sur l'id DISTANT reçu du cloud — ses références FK
///   locales (paiements, dépenses, annulations, audit) sont réécrites, puis la
///   ligne locale est renommée. Cela élimine le 23505 au push et débloque les
///   tables enfants (Paiement, AnnulationRecu, Depense, AuditLog). Un username
///   en double NON-admin est en revanche ignoré localement avec un avertissement.
///
/// Protection supplémentaire : un élève local ACTIF/INSCRIT n'est JAMAIS rétrogradé
/// en TRANSFERE par une ligne distante, sauf si la suppression est documentée dans
/// le journal d'audit distant (vraie propagation d'un archivage). Une ligne
/// TRANSFERE sans journal = donnée cloud périmée/polluée → on conserve l'état local.
fn pull_insert_row(
    conn: &Connection,
    table_name: &str,
    pk_cols: &[&str],
    row_map: &mut serde_json::Map<String, Value>,
    pull_warnings: &mut Vec<String>,
    remote_deleted_ids: &HashMap<String, HashSet<String>>,
) -> Result<(), AppError> {
    if table_name == "EleveClasse" {
        return upsert_eleve_classe_row(conn, row_map);
    }

    if table_name == "Eleve" {
        protect_eleve_statut(conn, row_map, pull_warnings, remote_deleted_ids);
    }

    match upsert_row(conn, table_name, pk_cols, row_map) {
        Ok(()) => Ok(()),
        Err(e) => {
            let is_unique = e.to_string().contains("UNIQUE constraint failed");
            if !is_unique {
                return Err(e);
            }
            let row_id = row_map.get("id").and_then(|v| v.as_str()).unwrap_or("?").to_string();
            match table_name {
                "Eleve" => {
                    let mut new_row = row_map.clone();
                    let code = id_prefix_code(&row_id);
                    let prefix = format!("ELV-{}-{}-", chrono::Utc::now().format("%Y"), code);
                    let seq = next_unique_sequence(conn, table_name, "matricule", &prefix);
                    let new_mat = format!("{}{:04}", prefix, seq);
                    new_row.insert("matricule".to_string(), Value::String(new_mat.clone()));
                    upsert_row(conn, table_name, pk_cols, &new_row)?;
                    pull_warnings.push(format!(
                        "Eleve (id {}) : matricule en double renommé → {}",
                        row_id, new_mat
                    ));
                    Ok(())
                }
                "Paiement" => {
                    let mut new_row = row_map.clone();
                    let code = id_prefix_code(&row_id);
                    let prefix = format!("REC-{}-{}-", chrono::Utc::now().format("%Y%m%d"), code);
                    let seq = next_unique_sequence(conn, table_name, "numero_recu", &prefix);
                    let new_recu = format!("{}{:04}", prefix, seq);
                    new_row.insert("numero_recu".to_string(), Value::String(new_recu.clone()));
                    upsert_row(conn, table_name, pk_cols, &new_row)?;
                    pull_warnings.push(format!(
                        "Paiement (id {}) : numéro de reçu en double renommé → {}",
                        row_id, new_recu
                    ));
                    Ok(())
                }
                "User" => {
                    let username = row_map
                        .get("username")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    if username == "admin" {
                        // Compte système : chaque machine en crée un avec un id
                        // aléatoire → conflit d'username au push (23505). On aligne
                        // l'admin local sur l'id DISTANT en réécrivant les références
                        // (paiements, dépenses, annulations, audit) avant de renommer.
                        merge_admin_into_local(conn, &row_id, pull_warnings)?;
                        upsert_row(conn, "User", pk_cols, row_map)
                    } else {
                        pull_warnings.push(format!(
                            "User (id {}) : username '{}' en double ignoré localement — fusion manuelle requise dans Supabase",
                            row_id, username
                        ));
                        Ok(())
                    }
                }
                _ => Err(e),
            }
        }
    }
}

/// Aligne l'admin local (id aléatoire propre à la machine) sur l'id distant
/// reçu du cloud : réécrit les références FK locales, puis renomme la ligne.
/// Rendu possible car la synchro désactive les contraintes FK (foreign_keys=OFF).
fn merge_admin_into_local(
    conn: &Connection,
    remote_admin_id: &str,
    pull_warnings: &mut Vec<String>,
) -> Result<(), AppError> {
    // Id de l'admin local (username='admin', id différent du distant)
    let local_admin_id: Option<String> = conn
        .query_row(
            "SELECT id FROM \"User\" WHERE username = 'admin' AND id <> ?1 LIMIT 1",
            [remote_admin_id],
            |r| r.get(0),
        )
        .ok();
    let Some(local_id) = local_admin_id else {
        return Ok(());
    };

    // Réécrire toutes les références vers l'id distant
    for (table, col) in [
        ("Paiement", "user_id"),
        ("Depense", "created_by_id"),
        ("AnnulationRecu", "user_id"),
        ("AuditLog", "user_id"),
        ("ParametreEtablissement", "created_by"),
    ] {
        let sql = format!(
            "UPDATE \"{}\" SET \"{}\" = ?1 WHERE \"{}\" = ?2",
            table, col, col
        );
        let _ = conn.execute(&sql, params![remote_admin_id, local_id]);
    }

    let affected = conn.execute(
        "UPDATE \"User\" SET id = ?1, updated_at = ?2 WHERE id = ?3",
        params![remote_admin_id, now_iso(), local_id],
    )?;
    if affected > 0 {
        pull_warnings.push(format!(
            "User admin : id local {} aligné sur l'id distant {} (références mises à jour)",
            local_id, remote_admin_id
        ));
    }
    Ok(())
}

/// Pousse UNE ligne de `Eleve` / `Paiement` vers le cloud.
///
/// Si l'insertion échoue sur la clé unique secondaire (matricule / numero_recu
/// déjà pris par une AUTRE ligne distante), la ligne est renommée localement
/// avec un code dérivé de son id (déterministe → même valeur sur toutes les
/// machines) puis repoussée. Le renommage est persistant localement et visible
/// dans la console ; la synchro converge au lieu d'échouer en boucle.
fn push_row_with_unique_fallback(
    conn: &Connection,
    client: &reqwest::blocking::Client,
    supabase_url: &str,
    supabase_key: &str,
    table_name: &str,
    pk_cols: &[&str],
    row: &Value,
) -> Result<(), String> {
    let url = format!("{}/rest/v1/{}?on_conflict={}", supabase_url, table_name, pk_cols.join(","));
    let push = |body: Value| -> Result<(), String> {
        match http_post_with_retry(client, &url, supabase_key, &format!("Bearer {}", supabase_key), &body) {
            Ok(resp) if resp.status().is_success() => Ok(()),
            Ok(resp) => Err(resp.text().unwrap_or_default()),
            Err(e) => Err(e.to_string()),
        }
    };

    match push(Value::Array(vec![row.clone()])) {
        Ok(()) => return Ok(()),
        Err(e) if !(e.contains("23505") || e.contains("duplicate key")) => return Err(e),
        Err(e) => {
            // Conflit de clé unique : renommer puis repousser.
            let Some(row_map) = row.as_object() else { return Err(e) };
            let Some(row_id) = row_map.get("id").and_then(|v| v.as_str()) else { return Err(e) };

            let (col, prefix) = if table_name == "Eleve" {
                ("matricule", format!("ELV-{}-{}-", chrono::Utc::now().format("%Y"), id_prefix_code(row_id)))
            } else {
                ("numero_recu", format!("REC-{}-{}-", chrono::Utc::now().format("%Y%m%d"), id_prefix_code(row_id)))
            };
            let seq = next_unique_sequence(conn, table_name, col, &prefix);
            let new_val = format!("{}{:04}", prefix, seq);

            // Persister le renommage localement (la ligne garde le même id).
            let sql = format!("UPDATE \"{}\" SET \"{}\" = ?1, updated_at = ?2 WHERE id = ?3", table_name, col);
            conn.execute(&sql, params![new_val, now_iso(), row_id])
                .map_err(|e| e.to_string())?;
            eprintln!("[SYNC] {} {} : {} en double → renommé {}", table_name, row_id, col, new_val);

            let mut new_row = row_map.clone();
            new_row.insert(col.to_string(), Value::String(new_val));
            push(Value::Array(vec![Value::Object(new_row)]))
        }
    }
}

/// Code court DÉTERMINISTE dérivé de l'id d'une ligne (8 premiers caractères
/// de l'UUID). Pour une même ligne, toutes les machines calculent la même
/// valeur : les renommages anti-doublons convergent au lieu de diverger.
fn id_prefix_code(id: &str) -> String {
    let clean: String = id.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    clean[..clean.len().min(8)].to_uppercase()
}

/// Prochain numéro de séquence libre pour un préfixe donné (ex. `ELV-2026-3EF3D36C-`).
fn next_unique_sequence(conn: &Connection, table_name: &str, col: &str, prefix: &str) -> i64 {
    let sql = format!(
        "SELECT COALESCE(MAX(CAST(REPLACE(\"{col}\", ?1, '') AS INTEGER)), 0) \
         FROM \"{table_name}\" WHERE \"{col}\" LIKE ?1 || '%'"
    );
    conn.query_row(&sql, [prefix], |r| r.get(0)).unwrap_or(0) + 1
}

/// Insertion distante EleveClasse avec résolution du conflit « un seul ACTIF par élève » :
/// avant d'insérer une inscription ACTIF, on rétrograde les éventuelles inscriptions ACTIF
/// locales concurrentes du même élève. L'état distant fait foi : la contrainte partielle
/// existe aussi côté serveur, donc l'inscription ACTIF reçue est forcément l'actuelle.
fn upsert_eleve_classe_row(
    conn: &Connection,
    row_map: &serde_json::Map<String, Value>,
) -> Result<(), AppError> {
    if row_map.get("statut").and_then(|v| v.as_str()) == Some("ACTIF") {
        if let Some(eleve_id) = row_map.get("eleve_id").and_then(|v| v.as_str()) {
            let classe_id = row_map.get("classe_id").and_then(|v| v.as_str()).unwrap_or("");
            let now = now_iso();
            let _ = conn.execute(
                "UPDATE \"EleveClasse\" SET statut = 'TRANSFERE', date_sortie = ?1 \
                 WHERE eleve_id = ?2 AND statut = 'ACTIF' AND classe_id <> ?3",
                params![now, eleve_id, classe_id],
            );
        }
    }
    upsert_row(conn, "EleveClasse", &["eleve_id", "classe_id"], row_map)
}

fn upsert_row(
    conn: &Connection,
    table_name: &str,
    pk_cols: &[&str],
    row: &serde_json::Map<String, Value>,
) -> Result<(), AppError> {
    let mut cols = Vec::new();
    let mut val_placeholders = Vec::new();
    let mut params_val: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    for (k, v) in row {
        cols.push(k.as_str());
        val_placeholders.push(format!("?{}", cols.len()));

        let sql_val: Box<dyn rusqlite::types::ToSql> = match v {
            Value::Null => Box::new(rusqlite::types::Null),
            Value::Bool(b) => Box::new(if *b { 1i32 } else { 0i32 }),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Box::new(i)
                } else if let Some(f) = n.as_f64() {
                    Box::new(f)
                } else {
                    Box::new(rusqlite::types::Null)
                }
            }
            Value::String(s) => Box::new(normalize_remote_timestamp(s)),
            _ => Box::new(v.to_string()),
        };
        params_val.push(sql_val);
    }

    if cols.is_empty() { return Ok(()); }

    let quoted_cols: Vec<String> = cols.iter().map(|c| format!("\"{}\"", c)).collect();
    let pk_clause = pk_cols.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ");

    let update_parts: Vec<String> = cols.iter()
        .filter(|&&c| !pk_cols.contains(&c))
        .map(|&c| format!("\"{}\"=excluded.\"{}\"", c, c))
        .collect();

    let sql = if update_parts.is_empty() {
        format!(
            "INSERT INTO \"{}\" ({}) VALUES ({}) ON CONFLICT({}) DO NOTHING",
            table_name,
            quoted_cols.join(", "),
            val_placeholders.join(", "),
            pk_clause
        )
    } else {
        format!(
            "INSERT INTO \"{}\" ({}) VALUES ({}) ON CONFLICT({}) DO UPDATE SET {}",
            table_name,
            quoted_cols.join(", "),
            val_placeholders.join(", "),
            pk_clause,
            update_parts.join(", ")
        )
    };

    let refs: Vec<&dyn rusqlite::types::ToSql> = params_val.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, refs.as_slice())?;
    Ok(())
}