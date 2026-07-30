use tauri::State;
use crate::db::DbConn;
use crate::error::AppError;
use crate::utils::audit_logger::log_audit;
use serde::Serialize;

#[derive(Serialize)]
pub struct AuditLogEntry {
    pub id: String,
    pub user_id: Option<String>,
    pub nom_complet: Option<String>,
    pub action: String,
    pub entite: String,
    pub entite_id: Option<String>,
    pub details: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn list_audit_logs(
    db: State<'_, DbConn>,
    user_id: Option<String>,
    action: Option<String>,
    entite: Option<String>,
    entite_id: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<serde_json::Value, AppError> {
    let conn = db.lock()?;

    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(50).max(1).min(100);
    let offset = (page - 1) * page_size;

    let mut where_clauses = Vec::new();
    let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref uid) = user_id {
        where_clauses.push("al.user_id = ?".to_string());
        query_params.push(Box::new(uid.clone()));
    }
    if let Some(ref act) = action {
        where_clauses.push("al.action = ?".to_string());
        query_params.push(Box::new(act.clone()));
    }
    if let Some(ref ent) = entite {
        where_clauses.push("al.entite = ?".to_string());
        query_params.push(Box::new(ent.clone()));
    }
    if let Some(ref eid) = entite_id {
        where_clauses.push("al.entite_id = ?".to_string());
        query_params.push(Box::new(eid.clone()));
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let count_sql = format!("SELECT COUNT(*) FROM AuditLog al {}", where_sql);
    let param_refs: Vec<&dyn rusqlite::ToSql> = query_params.iter().map(|p| p.as_ref()).collect();
    let total: i64 = conn
        .query_row(&count_sql, param_refs.as_slice(), |row| row.get(0))
        .map_err(|e| AppError::Database(e.to_string()))?;

    let data_sql = format!(
        "SELECT al.id, al.user_id, u.nom_complet, al.action, al.entite, al.entite_id, al.details, al.created_at \
         FROM AuditLog al \
         LEFT JOIN User u ON al.user_id = u.id \
         {} \
         ORDER BY al.created_at DESC \
         LIMIT ? OFFSET ?",
        where_sql
    );

    let mut data_params = query_params;
    data_params.push(Box::new(page_size));
    data_params.push(Box::new(offset));
    let data_param_refs: Vec<&dyn rusqlite::ToSql> = data_params.iter().map(|p| p.as_ref()).collect();

    let logs: Vec<AuditLogEntry> = {
        let mut stmt = conn
            .prepare(&data_sql)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let result = stmt.query_map(data_param_refs.as_slice(), |row| {
            Ok(AuditLogEntry {
                id: row.get(0)?,
                user_id: row.get(1)?,
                nom_complet: row.get(2)?,
                action: row.get(3)?,
                entite: row.get(4)?,
                entite_id: row.get(5)?,
                details: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| AppError::Database(e.to_string()))?
        .filter_map(|r| r.ok())
        .collect();
        result
    };

    drop(conn);

    log_audit(
        &db,
        None,
        "VIEW",
        "AuditLog",
        None,
        Some("Listed audit logs"),
    );

    Ok(serde_json::json!({
        "success": true,
        "auditLogs": logs,
        "total": total,
        "page": page,
        "pageSize": page_size
    }))
}