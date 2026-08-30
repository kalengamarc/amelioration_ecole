use rusqlite::params;
use crate::db::DbConn;
use crate::utils::id::generate_id;

/// Log an audit entry with full parameters
pub fn log_audit(
    conn: &std::sync::Mutex<rusqlite::Connection>,
    user_id: Option<&str>,
    action: &str,
    entite: &str,
    entite_id: Option<&str>,
    details: Option<&str>,
) {
    let id = generate_id();
    let now = crate::db::now_iso();
    let conn = conn.lock().map_err(|e| {
        eprintln!("Erreur mutex audit logger: {}", e);
        e
    }).ok();
    if let Some(conn) = conn {
        let _ = conn.execute(
        "INSERT INTO AuditLog (id, user_id, action, entite, entite_id, details, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![id, user_id, action, entite, entite_id, details, now],
    );

    // Keep only the 200 most recent audit logs to prevent database bloat.
    // CRITIQUE : ne jamais supprimer les entrées DELETE plus récentes que la
    // dernière synchro réussie — ce sont des suppressions locales qui n'ont pas
    // encore été propagées vers le cloud. Les purger = suppression perdue.
    let _ = conn.execute(
        "DELETE FROM AuditLog \
         WHERE id NOT IN (SELECT id FROM AuditLog ORDER BY created_at DESC LIMIT 200) \
           AND NOT (action = 'DELETE' AND created_at > COALESCE(\
                (SELECT valeur FROM ConfigSysteme WHERE cle = 'LAST_SYNC'), '1970-01-01T00:00:00Z'))",
        [],
    );
    }
}

/// Convenience overload: log_audit with entity+action+details (no user_id, no entite_id)
pub fn log_audit_simple(
    conn: &DbConn,
    entite: &str,
    action: &str,
    details: &str,
) {
    log_audit(conn, None, action, entite, None, Some(details));
}
