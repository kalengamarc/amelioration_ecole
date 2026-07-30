use rusqlite::Connection;

pub fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn generate_receipt_number(conn: &Connection) -> String {
    let date = chrono::Local::now().format("%Y%m%d").to_string();
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM Paiement WHERE date(created_at) = date('now')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    format!("REC-{}-{:04}", date, count + 1)
}

pub fn generate_matricule(conn: &rusqlite::Connection) -> String {
    let year = chrono::Utc::now().format("%Y").to_string();
    let prefix = format!("ELV-{}-", year);
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM Eleve WHERE matricule LIKE ?1",
            rusqlite::params![format!("{}%", prefix)],
            |row| row.get(0),
        )
        .unwrap_or(0);
    format!("{}{:04}", prefix, count + 1)
}