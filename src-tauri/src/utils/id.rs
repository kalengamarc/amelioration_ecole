use rusqlite::Connection;

pub fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Code court (3 caractères) propre à cette machine, généré une seule fois et
/// conservé dans ConfigSysteme (clé MACHINE_CODE).
///
/// Pourquoi : deux machines qui génèrent le même jour un numéro de reçu
/// (`REC-20260830-0001`) ou un matricule (`ELV-2026-0001`) entraient en
/// collision sur la clé unique distante — et l'ancienne fusion silencieuse
/// écrasait une donnée. Avec un code machine intégré au numéro, chaque
/// machine possède son propre espace de numérotation : collision impossible.
pub fn get_machine_code(conn: &Connection) -> String {
    if let Ok(code) = conn.query_row(
        "SELECT valeur FROM ConfigSysteme WHERE cle = 'MACHINE_CODE'",
        [],
        |r| r.get::<_, String>(0),
    ) {
        if !code.is_empty() {
            return code;
        }
    }

    let code = generate_machine_code();
    let now = crate::db::now_iso();
    let _ = conn.execute(
        "INSERT INTO ConfigSysteme (id, cle, valeur, created_at, updated_at) \
         VALUES (?1, 'MACHINE_CODE', ?2, ?3, ?3) \
         ON CONFLICT(cle) DO UPDATE SET valeur = ?2, updated_at = ?3",
        rusqlite::params![uuid::Uuid::new_v4().to_string(), code, now],
    );
    code
}

/// Génère un code aléatoire de 3 caractères (alphabet sans caractères ambigus
/// O/0/I/1/L) à partir des octets d'un UUID v4.
fn generate_machine_code() -> String {
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let uuid = uuid::Uuid::new_v4();
    let bytes = uuid.as_bytes();
    let mut code = String::with_capacity(3);
    for b in bytes.iter().take(3) {
        code.push(CHARS[(*b as usize) % CHARS.len()] as char);
    }
    code
}

/// Numéro de reçu unique par machine : `REC-20260830-A7K-0001`.
/// Le compteur ne tient compte que des reçus de CETTE machine (préfixe code
/// machine), donc les séquences restent courtes et ne collisionnent jamais
/// entre machines.
pub fn generate_receipt_number(conn: &Connection) -> String {
    let code = get_machine_code(conn);
    let date = chrono::Local::now().format("%Y%m%d").to_string();
    let prefix = format!("REC-{}-{}-", date, code);
    let count: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(CAST(REPLACE(numero_recu, ?1, '') AS INTEGER)), 0) \
             FROM Paiement WHERE numero_recu LIKE ?1 || '%'",
            [&prefix],
            |row| row.get(0),
        )
        .unwrap_or(0);
    format!("{}{:04}", prefix, count + 1)
}

/// Matricule unique par machine : `ELV-2026-A7K-0001`.
/// Même principe que les reçus : préfixe code machine ⇒ aucune collision
/// entre machines.
pub fn generate_matricule(conn: &rusqlite::Connection) -> String {
    let year = chrono::Utc::now().format("%Y").to_string();
    let code = get_machine_code(conn);
    let prefix = format!("ELV-{}-{}-", year, code);
    let count: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(CAST(REPLACE(matricule, ?1, '') AS INTEGER)), 0) \
             FROM Eleve WHERE matricule LIKE ?1 || '%'",
            [&prefix],
            |row| row.get(0),
        )
        .unwrap_or(0);
    format!("{}{:04}", prefix, count + 1)
}
