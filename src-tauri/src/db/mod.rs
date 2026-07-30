use rusqlite::Connection;
use std::sync::Mutex;
use crate::error::AppError;

pub mod models;
pub use models::*;

pub type DbConn = Mutex<Connection>;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS Etablissement (
    id                  TEXT PRIMARY KEY,
    nom                 TEXT NOT NULL,
    type                TEXT NOT NULL DEFAULT 'PRIMAIRE',
    adresse             TEXT,
    telephone           TEXT,
    email               TEXT,
    logo_url            TEXT,
    couleur_principale  TEXT NOT NULL DEFAULT '#075e54',
    rccm                TEXT,
    id_nat              TEXT,
    devise              TEXT NOT NULL DEFAULT 'CDF',
    actif               INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_etab_actif ON Etablissement(actif);

CREATE TABLE IF NOT EXISTS AnneeScolaire (
    id                  TEXT PRIMARY KEY,
    libelle             TEXT NOT NULL,
    etablissement_id    TEXT NOT NULL,
    date_debut          TEXT NOT NULL,
    date_fin            TEXT NOT NULL,
    active              INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id) ON UPDATE CASCADE ON DELETE CASCADE,
    UNIQUE(etablissement_id, libelle)
);
CREATE INDEX IF NOT EXISTS idx_annee_etab_active ON AnneeScolaire(etablissement_id, active);

CREATE TABLE IF NOT EXISTS Classe (
    id                  TEXT PRIMARY KEY,
    nom                 TEXT NOT NULL,
    niveau              TEXT NOT NULL,
    etablissement_id    TEXT NOT NULL,
    annee_scolaire_id   TEXT NOT NULL,
    effectif_max        INTEGER NOT NULL DEFAULT 40,
    actif               INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id) ON UPDATE CASCADE ON DELETE CASCADE,
    UNIQUE(nom, etablissement_id, annee_scolaire_id)
);
CREATE INDEX IF NOT EXISTS idx_classe_etab_annee ON Classe(etablissement_id, annee_scolaire_id);

CREATE TABLE IF NOT EXISTS User (
    id                  TEXT PRIMARY KEY,
    username            TEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    nom_complet         TEXT NOT NULL,
    role                TEXT NOT NULL,
    etablissement_id    TEXT,
    actif               INTEGER NOT NULL DEFAULT 1,
    dernier_login       TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_user_etab_actif ON User(etablissement_id, actif);

CREATE TABLE IF NOT EXISTS Eleve (
    id                   TEXT PRIMARY KEY,
    matricule            TEXT NOT NULL UNIQUE,
    nom                  TEXT NOT NULL,
    prenom               TEXT NOT NULL,
    date_naissance       TEXT,
    lieu_naissance       TEXT,
    sexe                 TEXT,
    address              TEXT,
    ecole_de_provenance  TEXT,
    photo_url            TEXT,
    statut               TEXT NOT NULL DEFAULT 'ACTIF',
    etablissement_id     TEXT NOT NULL,
    annee_scolaire_id    TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_eleve_etab_statut ON Eleve(etablissement_id, statut);
CREATE INDEX IF NOT EXISTS idx_eleve_annee ON Eleve(annee_scolaire_id);
CREATE INDEX IF NOT EXISTS idx_eleve_nom_prenom ON Eleve(nom, prenom);

CREATE TABLE IF NOT EXISTS Tuteur (
    id          TEXT PRIMARY KEY,
    nom         TEXT NOT NULL,
    prenom      TEXT NOT NULL,
    telephone   TEXT NOT NULL,
    telephone2  TEXT,
    adresse     TEXT,
    profession  TEXT,
    relation    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tuteur_tel ON Tuteur(telephone);

CREATE TABLE IF NOT EXISTS TuteurEleve (
    eleve_id     TEXT NOT NULL,
    tuteur_id    TEXT NOT NULL,
    is_principal INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (eleve_id, tuteur_id),
    FOREIGN KEY (eleve_id) REFERENCES Eleve(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (tuteur_id) REFERENCES Tuteur(id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tuteur_eleve_tuteur ON TuteurEleve(tuteur_id);

CREATE TABLE IF NOT EXISTS EleveClasse (
    eleve_id          TEXT NOT NULL,
    classe_id         TEXT NOT NULL,
    date_inscription  TEXT NOT NULL DEFAULT (datetime('now')),
    date_sortie       TEXT,
    statut            TEXT NOT NULL DEFAULT 'ACTIF',
    PRIMARY KEY (eleve_id, classe_id),
    FOREIGN KEY (eleve_id) REFERENCES Eleve(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (classe_id) REFERENCES Classe(id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_eleve_classe_classe_statut ON EleveClasse(classe_id, statut);

CREATE TABLE IF NOT EXISTS FraisScolaire (
    id                  TEXT PRIMARY KEY,
    libelle             TEXT NOT NULL,
    type                TEXT NOT NULL,
    montant             REAL NOT NULL,
    devise              TEXT NOT NULL DEFAULT 'CDF',
    etablissement_id    TEXT NOT NULL,
    annee_scolaire_id   TEXT NOT NULL,
    tranche             INTEGER,
    date_echeance       TEXT,
    actif               INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_frais_etab_annee_actif ON FraisScolaire(etablissement_id, annee_scolaire_id, actif);
CREATE INDEX IF NOT EXISTS idx_frais_type ON FraisScolaire(type);

CREATE TABLE IF NOT EXISTS FraisClasse (
    frais_scolaire_id  TEXT NOT NULL,
    classe_id          TEXT NOT NULL,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (frais_scolaire_id, classe_id),
    FOREIGN KEY (frais_scolaire_id) REFERENCES FraisScolaire(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (classe_id) REFERENCES Classe(id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_frais_classe_classe ON FraisClasse(classe_id);

CREATE TABLE IF NOT EXISTS Echeance (
    id                      TEXT PRIMARY KEY,
    eleve_id                TEXT NOT NULL,
    frais_scolaire_id       TEXT NOT NULL,
    etablissement_id        TEXT NOT NULL,
    annee_scolaire_id       TEXT NOT NULL,
    montant_du              REAL NOT NULL,
    montant_paye            REAL NOT NULL DEFAULT 0,
    statut                  TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    date_echeance           TEXT,
    date_paiement_complet   TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (eleve_id) REFERENCES Eleve(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (frais_scolaire_id) REFERENCES FraisScolaire(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id) ON UPDATE CASCADE ON DELETE CASCADE,
    UNIQUE(eleve_id, frais_scolaire_id)
);
CREATE INDEX IF NOT EXISTS idx_echeance_eleve_statut ON Echeance(eleve_id, statut);
CREATE INDEX IF NOT EXISTS idx_echeance_frais ON Echeance(frais_scolaire_id);
CREATE INDEX IF NOT EXISTS idx_echeance_annee_statut ON Echeance(annee_scolaire_id, statut);
CREATE INDEX IF NOT EXISTS idx_echeance_etab ON Echeance(etablissement_id);

CREATE TABLE IF NOT EXISTS Paiement (
    id                    TEXT PRIMARY KEY,
    numero_recu           TEXT NOT NULL UNIQUE,
    eleve_id              TEXT NOT NULL,
    echeance_id           TEXT,
    etablissement_id      TEXT NOT NULL,
    annee_scolaire_id     TEXT NOT NULL,
    user_id               TEXT NOT NULL,
    motif                 TEXT NOT NULL,
    montant               REAL NOT NULL,
    devise                TEXT NOT NULL DEFAULT 'CDF',
    montant_affecte       REAL,
    devise_echeance       TEXT,
    mode_paiement         TEXT NOT NULL,
    reference_paiement    TEXT,
    taux_change           REAL,
    montant_original      REAL,
    annule                INTEGER NOT NULL DEFAULT 0,
    date_annulation       TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (eleve_id) REFERENCES Eleve(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (echeance_id) REFERENCES Echeance(id) ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES User(id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_paiement_eleve_date ON Paiement(eleve_id, created_at);
CREATE INDEX IF NOT EXISTS idx_paiement_etab_date ON Paiement(etablissement_id, created_at);
CREATE INDEX IF NOT EXISTS idx_paiement_annee_date ON Paiement(annee_scolaire_id, created_at);
CREATE INDEX IF NOT EXISTS idx_paiement_annule ON Paiement(annule);

CREATE TABLE IF NOT EXISTS AnnulationRecu (
    id              TEXT PRIMARY KEY,
    paiement_id     TEXT NOT NULL UNIQUE,
    user_id         TEXT NOT NULL,
    motif           TEXT NOT NULL,
    date_annulation TEXT NOT NULL DEFAULT (datetime('now')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (paiement_id) REFERENCES Paiement(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES User(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS Depense (
    id                   TEXT PRIMARY KEY,
    etablissement_id     TEXT NOT NULL,
    annee_scolaire_id    TEXT NOT NULL,
    created_by_id        TEXT,
    categorie            TEXT NOT NULL,
    libelle              TEXT NOT NULL,
    montant              REAL NOT NULL,
    devise               TEXT NOT NULL DEFAULT 'CDF',
    beneficiaire         TEXT,
    date_depense         TEXT NOT NULL,
    reference_piece      TEXT,
    justificatif_url     TEXT,
    statut               TEXT NOT NULL DEFAULT 'VALIDE',
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (created_by_id) REFERENCES User(id) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_depense_etab_date ON Depense(etablissement_id, date_depense);
CREATE INDEX IF NOT EXISTS idx_depense_annee_statut ON Depense(annee_scolaire_id, statut);

CREATE TABLE IF NOT EXISTS ParametreEtablissement (
    id                    TEXT PRIMARY KEY,
    etablissement_id     TEXT NOT NULL UNIQUE,
    annee_scolaire_id    TEXT UNIQUE,
    mentions_legales      TEXT,
    pied_page_recu        TEXT,
    nom_imprimante        TEXT,
    taux_change_usd_bif   REAL NOT NULL DEFAULT 2500,
    devise_defaut         TEXT NOT NULL DEFAULT 'CDF',
    created_by            TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_params_annee ON ParametreEtablissement(annee_scolaire_id);

CREATE TABLE IF NOT EXISTS AuditLog (
    id           TEXT PRIMARY KEY,
    user_id      TEXT,
    action       TEXT NOT NULL,
    entite       TEXT NOT NULL,
    entite_id    TEXT,
    details      TEXT,
    adresse_ip   TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES User(id) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user_date ON AuditLog(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entite ON AuditLog(entite, entite_id);
CREATE INDEX IF NOT EXISTS idx_audit_action_date ON AuditLog(action, created_at);

CREATE TABLE IF NOT EXISTS ConfigSysteme (
    id          TEXT PRIMARY KEY,
    cle         TEXT NOT NULL UNIQUE,
    valeur      TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS SyncLog (
    id            TEXT PRIMARY KEY,
    table_name    TEXT NOT NULL,
    last_sync_at  TEXT NOT NULL,
    direction     TEXT NOT NULL DEFAULT 'BIDIRECTIONAL',
    status        TEXT NOT NULL DEFAULT 'SUCCESS',
    details       TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
"#;

pub fn get_db_path() -> String {
    // Use app data directory for cross-platform support
    let base = if cfg!(target_os = "windows") {
        // Windows: %APPDATA%/SGFS-ME/
        std::env::var("APPDATA")
            .unwrap_or_else(|_| ".".to_string())
    } else {
        // Linux/macOS: ~/.local/share/sgfs-me/
        dirs_home().unwrap_or_else(|| ".".to_string())
    };
    let path = std::path::PathBuf::from(base)
        .join("SGFS-ME")
        .join("data")
        .join("sgfs.db");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    path.to_string_lossy().to_string()
}

#[cfg(not(target_os = "windows"))]
fn dirs_home() -> Option<String> {
    std::env::var("HOME").ok()
}

#[cfg(target_os = "windows")]
fn dirs_home() -> Option<String> {
    std::env::var("USERPROFILE").ok()
}

pub fn init_db() -> Result<DbConn, AppError> {
    let path = get_db_path();
    let conn = Connection::open(&path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    conn.execute_batch(SCHEMA)?;
    seed_default_admin(&conn)?;
    Ok(Mutex::new(conn))
}

/// Insert a default COORDINATEUR admin if no users exist.
fn seed_default_admin(conn: &Connection) -> Result<(), AppError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM User", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();
    let hash = bcrypt::hash("admin123", 4)
        .map_err(|e| AppError::Internal(format!("bcrypt seed error: {}", e)))?;
    conn.execute(
        "INSERT INTO User (id, username, password_hash, nom_complet, role, actif, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?7)",
        rusqlite::params![id, "admin", hash, "Administrateur Système", "COORDINATEUR", now, now],
    )?;
    Ok(())
}

pub fn bool_to_int(b: bool) -> i32 { if b { 1 } else { 0 } }
pub fn int_to_bool(i: i32) -> bool { i != 0 }
pub fn now_iso() -> String { chrono::Utc::now().to_rfc3339() }