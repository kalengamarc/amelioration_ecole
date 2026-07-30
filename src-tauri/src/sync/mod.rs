use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use crate::error::AppError;
use crate::db::now_iso;

#[derive(Debug, Serialize, Deserialize)]
pub struct TableSyncStats {
    pub table_name: String,
    pub pushed: usize,
    pub pulled: usize,
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
    has_updated_at: bool,
    pk_cols: Vec<&'static str>,
}

// Map local entity names in AuditLog to SQLite / PostgreSQL table names
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

pub fn run_bidirectional_sync(conn: &Connection) -> Result<SyncSummary, AppError> {
    let start_time = now_iso();

    // 1. Retrieve Supabase config
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

    // 2. Retrieve last sync time
    let last_sync: String = conn.query_row(
        "SELECT valeur FROM ConfigSysteme WHERE cle = 'LAST_SYNC'",
        [],
        |r| r.get(0)
    ).unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());

    // 3. Define tables in strict dependency order
    let tables = vec![
        TableConfig { name: "Etablissement", has_updated_at: true, pk_cols: vec!["id"] },
        TableConfig { name: "User", has_updated_at: true, pk_cols: vec!["id"] },
        TableConfig { name: "AnneeScolaire", has_updated_at: true, pk_cols: vec!["id"] },
        TableConfig { name: "Classe", has_updated_at: true, pk_cols: vec!["id"] },
        TableConfig { name: "Eleve", has_updated_at: true, pk_cols: vec!["id"] },
        TableConfig { name: "Tuteur", has_updated_at: true, pk_cols: vec!["id"] },
        TableConfig { name: "TuteurEleve", has_updated_at: false, pk_cols: vec!["eleve_id", "tuteur_id"] },
        TableConfig { name: "EleveClasse", has_updated_at: false, pk_cols: vec!["eleve_id", "classe_id"] },
        TableConfig { name: "FraisScolaire", has_updated_at: true, pk_cols: vec!["id"] },
        TableConfig { name: "FraisClasse", has_updated_at: false, pk_cols: vec!["frais_scolaire_id", "classe_id"] },
        TableConfig { name: "Echeance", has_updated_at: true, pk_cols: vec!["id"] },
        TableConfig { name: "Paiement", has_updated_at: true, pk_cols: vec!["id"] },
        TableConfig { name: "AnnulationRecu", has_updated_at: false, pk_cols: vec!["id"] },
        TableConfig { name: "Depense", has_updated_at: true, pk_cols: vec!["id"] },
        TableConfig { name: "ParametreEtablissement", has_updated_at: true, pk_cols: vec!["id"] },
        TableConfig { name: "AuditLog", has_updated_at: false, pk_cols: vec!["id"] },
    ];

    let client = reqwest::blocking::Client::new();
    let mut stats = HashMap::new();

    // Initialize stats
    for t in &tables {
        stats.insert(t.name.to_string(), TableSyncStats {
            table_name: t.name.to_string(),
            pushed: 0,
            pulled: 0,
        });
    }

    // ==========================================
    // PHASE 1 : PUSH (Local -> Remote)
    // ==========================================

    // A. Push Deletions
    // Find deletions logged locally since last sync
    let mut stmt_del = conn.prepare(
        "SELECT entite, entite_id FROM AuditLog WHERE action = 'DELETE' AND created_at > ?"
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

    // Propagate deletions to Supabase
    for (table_name, ids) in deletions_by_table {
        if ids.is_empty() { continue; }
        // Postgres PostgREST syntax for DELETE in: ?id=in.(id1,id2)
        let ids_filter = ids.join(",");
        let url = format!("{}/rest/v1/{}?id=in.({})", supabase_url, table_name, ids_filter);
        let res = client.delete(&url)
            .header("apikey", &supabase_key)
            .header("Authorization", format!("Bearer {}", supabase_key))
            .send();
        
        match res {
            Ok(resp) => {
                if !resp.status().is_success() {
                    let err_text = resp.text().unwrap_or_default();
                    println!("Erreur lors de la suppression distante sur {} : {}", table_name, err_text);
                }
            }
            Err(e) => println!("Erreur HTTP lors de la suppression sur {} : {}", table_name, e),
        }
    }

    // B. Push Inserts & Updates
    for t in &tables {
        // Skip pushing AuditLog directly during push to prevent redundant logs, or push it normally.
        // We push it normally so the remote database has the complete logs.
        let local_rows = query_table_since(conn, t.name, &last_sync, t.has_updated_at)?;
        if local_rows.is_empty() { continue; }

        let on_conflict = match t.name {
            "TuteurEleve" => "on_conflict=eleve_id,tuteur_id",
            "EleveClasse" => "on_conflict=eleve_id,classe_id",
            "FraisClasse" => "on_conflict=frais_scolaire_id,classe_id",
            _ => "on_conflict=id",
        };

        let url = format!("{}/rest/v1/{}?{}", supabase_url, t.name, on_conflict);
        let res = client.post(&url)
            .header("apikey", &supabase_key)
            .header("Authorization", format!("Bearer {}", supabase_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates")
            .json(&local_rows)
            .send();

        match res {
            Ok(resp) => {
                if resp.status().is_success() {
                    if let Some(stat) = stats.get_mut(t.name) {
                        stat.pushed = local_rows.len();
                    }
                } else {
                    let status = resp.status();
                    let err_text = resp.text().unwrap_or_default();
                    return Err(AppError::Internal(format!(
                        "Erreur push table {} : Code {}, Détails: {}",
                        t.name, status, err_text
                    )));
                }
            }
            Err(e) => {
                return Err(AppError::Internal(format!(
                    "Erreur HTTP push table {} : {}", t.name, e
                )));
            }
        }
    }

    // ==========================================
    // PHASE 2 : PULL (Remote -> Local)
    // ==========================================

    // A. Pull Deletions from Remote AuditLog
    let url_del = format!("{}/rest/v1/AuditLog?action=eq.DELETE&created_at=gt.{}", supabase_url, last_sync);
    let res_del = client.get(&url_del)
        .header("apikey", &supabase_key)
        .header("Authorization", format!("Bearer {}", supabase_key))
        .send();

    if let Ok(resp) = res_del {
        if resp.status().is_success() {
            if let Ok(remote_deletes) = resp.json::<Vec<Value>>() {
                for del in remote_deletes {
                    if let (Some(entite), Some(entite_id)) = (
                        del.get("entite").and_then(|v| v.as_str()),
                        del.get("entite_id").and_then(|v| v.as_str())
                    ) {
                        if let Some(table_name) = map_entity_to_table(entite) {
                            let sql_del = format!("DELETE FROM {} WHERE id = ?", table_name);
                            let _ = conn.execute(&sql_del, params![entite_id]);
                        }
                    }
                }
            }
        }
    }

    // B. Pull Inserts & Updates
    for t in &tables {
        // Build timestamp field query parameter
        let timestamp_col = if t.has_updated_at {
            "updated_at"
        } else if t.name == "EleveClasse" {
            "date_inscription"
        } else {
            "created_at"
        };

        let url = format!("{}/rest/v1/{}?{}=gt.{}", supabase_url, t.name, timestamp_col, last_sync);
        let res = client.get(&url)
            .header("apikey", &supabase_key)
            .header("Authorization", format!("Bearer {}", supabase_key))
            .send();

        match res {
            Ok(resp) => {
                if resp.status().is_success() {
                    let remote_rows: Vec<Value> = resp.json().unwrap_or_default();
                    let count = remote_rows.len();
                    
                    for row in remote_rows {
                        if let Some(row_map) = row.as_object() {
                            upsert_row(conn, t.name, &t.pk_cols, row_map)?;
                        }
                    }

                    if let Some(stat) = stats.get_mut(t.name) {
                        stat.pulled = count;
                    }
                } else {
                    let status = resp.status();
                    let err_text = resp.text().unwrap_or_default();
                    return Err(AppError::Internal(format!(
                        "Erreur pull table {} : Code {}, Détails: {}",
                        t.name, status, err_text
                    )));
                }
            }
            Err(e) => {
                return Err(AppError::Internal(format!(
                    "Erreur HTTP pull table {} : {}", t.name, e
                )));
            }
        }
    }

    // 4. Update LAST_SYNC in ConfigSysteme
    let end_time = now_iso();
    let uuid_str = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO ConfigSysteme (id, cle, valeur, created_at, updated_at) \
         VALUES (?1, 'LAST_SYNC', ?2, ?3, ?3) \
         ON CONFLICT(cle) DO UPDATE SET valeur = ?2, updated_at = ?3",
        params![uuid_str, end_time, end_time],
    )?;

    // 5. Log synchronization locally in SyncLog
    for (_, stat) in &stats {
        if stat.pushed > 0 || stat.pulled > 0 {
            let log_id = uuid::Uuid::new_v4().to_string();
            let details = serde_json::json!({
                "pushed": stat.pushed,
                "pulled": stat.pulled
            }).to_string();
            
            let _ = conn.execute(
                "INSERT INTO SyncLog (id, table_name, last_sync_at, direction, status, details, created_at) \
                 VALUES (?1, ?2, ?3, 'BIDIRECTIONAL', 'SUCCESS', ?4, ?3)",
                params![log_id, stat.table_name, end_time, details],
            );
        }
    }

    // Convert stats hashmap to sorted vector
    let mut stats_vec: Vec<TableSyncStats> = stats.into_values().collect();
    stats_vec.sort_by(|a, b| a.table_name.cmp(&b.table_name));

    Ok(SyncSummary {
        success: true,
        start_time,
        end_time,
        stats: stats_vec,
        message: "Synchronisation réussie avec succès !".to_string(),
    })
}

// Helper to query rows since a timestamp
fn query_table_since(
    conn: &Connection,
    table_name: &str,
    last_sync: &str,
    has_updated_at: bool,
) -> Result<Vec<Value>, AppError> {
    let query = if has_updated_at {
        format!("SELECT * FROM {} WHERE updated_at > ?", table_name)
    } else if table_name == "EleveClasse" {
        format!("SELECT * FROM {} WHERE date_inscription > ?", table_name)
    } else {
        format!("SELECT * FROM {} WHERE created_at > ?", table_name)
    };

    let mut stmt = conn.prepare(&query)?;
    let col_count = stmt.column_count();
    
    let col_names: Vec<String> = (0..col_count)
        .map(|i| stmt.column_name(i).unwrap_or_default().to_string())
        .collect();

    let mut rows = stmt.query(params![last_sync])?;
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

// Helper to upsert a row in SQLite
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
            Value::Bool(b) => Box::new(if *b { 1 } else { 0 }),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Box::new(i)
                } else if let Some(f) = n.as_f64() {
                    Box::new(f)
                } else {
                    Box::new(rusqlite::types::Null)
                }
            }
            Value::String(s) => Box::new(s.clone()),
            _ => Box::new(v.to_string()),
        };
        params_val.push(sql_val);
    }

    if cols.is_empty() { return Ok(()); }

    let pk_clause = pk_cols.join(", ");

    let update_parts: Vec<String> = cols.iter()
        .filter(|&&c| !pk_cols.contains(&c))
        .map(|&c| format!("{}=excluded.{}", c, c))
        .collect();

    let sql = if update_parts.is_empty() {
        format!(
            "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT({}) DO NOTHING",
            table_name,
            cols.join(", "),
            val_placeholders.join(", "),
            pk_clause
        )
    } else {
        format!(
            "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT({}) DO UPDATE SET {}",
            table_name,
            cols.join(", "),
            val_placeholders.join(", "),
            pk_clause,
            update_parts.join(", ")
        )
    };

    let refs: Vec<&dyn rusqlite::types::ToSql> = params_val.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, refs.as_slice())?;
    Ok(())
}