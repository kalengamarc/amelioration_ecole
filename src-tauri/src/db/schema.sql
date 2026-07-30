-- SGFS-ME — Système de Gestion Financière et Scolaire Multi-Établissements
-- Full SQLite DDL mirroring the Prisma schema (16 tables)
-- All IDs are TEXT (CUID strings), amounts are REAL, booleans are INTEGER (0/1)
-- Column names use snake_case

-- ============= ÉTABLISSEMENTS =============
CREATE TABLE IF NOT EXISTS Etablissement (
    id                  TEXT PRIMARY KEY,
    nom                 TEXT NOT NULL,
    type                TEXT NOT NULL,              -- MATERNELLE | PRIMAIRE | SECONDAIRE | COMPLEXE
    adresse             TEXT,
    telephone           TEXT,
    email               TEXT,
    logo_url            TEXT,
    couleur_principale  TEXT NOT NULL DEFAULT '#075e54',
    rccm                TEXT,
    id_nat              TEXT,
    devise              TEXT NOT NULL DEFAULT 'CDF',
    actif               INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============= ANNÉES SCOLAIRES =============
CREATE TABLE IF NOT EXISTS AnneeScolaire (
    id                  TEXT PRIMARY KEY,
    libelle             TEXT NOT NULL,
    etablissement_id    TEXT NOT NULL,
    date_debut          TEXT NOT NULL,
    date_fin            TEXT NOT NULL,
    active              INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id)
);

-- ============= CLASSES =============
CREATE TABLE IF NOT EXISTS Classe (
    id                  TEXT PRIMARY KEY,
    nom                 TEXT NOT NULL,
    niveau              TEXT NOT NULL,
    etablissement_id    TEXT NOT NULL,
    annee_scolaire_id   TEXT NOT NULL,
    effectif_max        INTEGER NOT NULL DEFAULT 40,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id),
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id),
    UNIQUE(nom, etablissement_id, annee_scolaire_id)
);

-- ============= UTILISATEURS (RBAC) =============
CREATE TABLE IF NOT EXISTS User (
    id                  TEXT PRIMARY KEY,
    username            TEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    nom_complet         TEXT NOT NULL,
    role                TEXT NOT NULL,              -- COORDINATEUR | SECRETAIRE_MATERNELLE | SECRETAIRE_PRIMAIRE | SECRETAIRE_SECONDAIRE
    etablissement_id    TEXT,
    actif               INTEGER NOT NULL DEFAULT 1,
    dernier_login       TEXT,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id)
);

-- ============= ÉLÈVES =============
CREATE TABLE IF NOT EXISTS Eleve (
    id                  TEXT PRIMARY KEY,
    matricule           TEXT NOT NULL UNIQUE,
    nom                 TEXT NOT NULL,
    prenom              TEXT NOT NULL,
    date_naissance      TEXT,
    lieu_naissance      TEXT,
    sexe                TEXT NOT NULL,              -- M | F
    photo_url           TEXT,
    statut              TEXT NOT NULL DEFAULT 'INSCRIT',  -- INSCRIT | ACTIF | SUSPENDU | DIPLÔMÉ | TRANSFÉRÉ
    etablissement_id    TEXT NOT NULL,
    annee_scolaire_id   TEXT,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id),
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id)
);

-- ============= TUTEURS =============
CREATE TABLE IF NOT EXISTS Tuteur (
    id                  TEXT PRIMARY KEY,
    nom                 TEXT NOT NULL,
    prenom              TEXT NOT NULL,
    telephone           TEXT NOT NULL,
    telephone2          TEXT,
    adresse             TEXT,
    profession          TEXT,
    relation            TEXT,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============= TUTEUR-ÉLÈVE (Junction) =============
CREATE TABLE IF NOT EXISTS TuteurEleve (
    eleve_id            TEXT NOT NULL,
    tuteur_id           TEXT NOT NULL,
    is_principal        INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (eleve_id, tuteur_id),
    FOREIGN KEY (eleve_id) REFERENCES Eleve(id) ON DELETE CASCADE,
    FOREIGN KEY (tuteur_id) REFERENCES Tuteur(id) ON DELETE CASCADE
);

-- ============= INSCRIPTIONS (CLASSES DES ÉLÈVES) =============
CREATE TABLE IF NOT EXISTS EleveClasse (
    eleve_id            TEXT NOT NULL,
    classe_id           TEXT NOT NULL,
    date_inscription    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    statut              TEXT NOT NULL DEFAULT 'ACTIF',  -- ACTIF | SUSPENDU | TRANSFÉRÉ

    PRIMARY KEY (eleve_id, classe_id),
    FOREIGN KEY (eleve_id) REFERENCES Eleve(id) ON DELETE CASCADE,
    FOREIGN KEY (classe_id) REFERENCES Classe(id) ON DELETE CASCADE
);

-- ============= FRAIS SCOLAIRES =============
CREATE TABLE IF NOT EXISTS FraisScolaire (
    id                  TEXT PRIMARY KEY,
    libelle             TEXT NOT NULL,
    type                TEXT NOT NULL,              -- SCOLARITE | INSCRIPTION | ANNEXE
    montant             REAL NOT NULL,
    devise              TEXT NOT NULL DEFAULT 'CDF',
    etablissement_id    TEXT NOT NULL,
    annee_scolaire_id   TEXT NOT NULL,
    classe_ids          TEXT NOT NULL,              -- JSON array or "all"
    tranche             INTEGER,
    date_echeance       TEXT,
    actif               INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id),
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id)
);

-- ============= ÉCHÉANCES PAR ÉLÈVE =============
CREATE TABLE IF NOT EXISTS Echeance (
    id                     TEXT PRIMARY KEY,
    eleve_id               TEXT NOT NULL,
    frais_scolaire_id      TEXT NOT NULL,
    annee_scolaire_id      TEXT NOT NULL,
    montant_du             REAL NOT NULL,
    montant_paye           REAL NOT NULL DEFAULT 0,
    statut                 TEXT NOT NULL DEFAULT 'EN_ATTENTE',  -- EN_ATTENTE | PARTIELLEMENT_PAYE | PAYE | EN_RETARD
    date_echeance          TEXT,
    date_paiement_complet  TEXT,
    created_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (eleve_id) REFERENCES Eleve(id),
    FOREIGN KEY (frais_scolaire_id) REFERENCES FraisScolaire(id),
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id)
);

-- ============= PAIEMENTS (ENCAISSEMENTS) =============
CREATE TABLE IF NOT EXISTS Paiement (
    id                  TEXT PRIMARY KEY,
    numero_recu         TEXT NOT NULL UNIQUE,
    eleve_id            TEXT NOT NULL,
    echeance_id         TEXT,
    etablissement_id    TEXT NOT NULL,
    annee_scolaire_id   TEXT NOT NULL,
    user_id             TEXT NOT NULL,
    motif               TEXT NOT NULL,
    montant             REAL NOT NULL,
    devise              TEXT NOT NULL DEFAULT 'CDF',
    mode_paiement       TEXT NOT NULL,              -- ESPECES | CHEQUE | VIREMENT
    reference_paiement  TEXT,
    taux_change         REAL,
    montant_original    REAL,
    annule              INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (eleve_id) REFERENCES Eleve(id),
    FOREIGN KEY (echeance_id) REFERENCES Echeance(id),
    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id),
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id),
    FOREIGN KEY (user_id) REFERENCES User(id)
);

-- ============= ANNULATIONS DE REÇUS =============
CREATE TABLE IF NOT EXISTS AnnulationRecu (
    id                  TEXT PRIMARY KEY,
    paiement_id         TEXT NOT NULL UNIQUE,
    user_id             TEXT NOT NULL,
    motif               TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (paiement_id) REFERENCES Paiement(id),
    FOREIGN KEY (user_id) REFERENCES User(id)
);

-- ============= DÉPENSES =============
CREATE TABLE IF NOT EXISTS Depense (
    id                  TEXT PRIMARY KEY,
    etablissement_id    TEXT NOT NULL,
    annee_scolaire_id   TEXT NOT NULL,
    categorie           TEXT NOT NULL,              -- SALAIRES | FOURNITURES | RÉPARATIONS | LOYER | ÉNERGIE | AUTRE
    libelle             TEXT NOT NULL,
    montant             REAL NOT NULL,
    devise              TEXT NOT NULL DEFAULT 'CDF',
    beneficiaire        TEXT,
    date_depense        TEXT NOT NULL,
    reference_piece     TEXT,
    justificatif_url    TEXT,
    statut              TEXT NOT NULL DEFAULT 'VALIDÉ',  -- EN_ATTENTE | VALIDÉ | REJETÉ
    created_by          TEXT,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id),
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id)
);

-- ============= PARAMÈTRES PAR ÉTABLISSEMENT =============
CREATE TABLE IF NOT EXISTS ParametreEtablissement (
    id                  TEXT PRIMARY KEY,
    etablissement_id    TEXT NOT NULL UNIQUE,
    mentions_legales    TEXT,
    pied_page_recu      TEXT,
    nom_imprimante      TEXT,
    annee_scolaire_id   TEXT,
    created_by          TEXT,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (etablissement_id) REFERENCES Etablissement(id),
    FOREIGN KEY (annee_scolaire_id) REFERENCES AnneeScolaire(id)
);

-- ============= JOURNAL D'AUDIT =============
CREATE TABLE IF NOT EXISTS AuditLog (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT,
    action              TEXT NOT NULL,              -- CREATE | UPDATE | DELETE | LOGIN | LOGOUT | ANNULATION
    entite              TEXT NOT NULL,              -- ELEVE | PAIEMENT | FRAIS | USER | DEPENSE | PARAMETRE
    entite_id           TEXT,
    details             TEXT,                       -- JSON string
    adresse_ip          TEXT,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES User(id)
);

-- ============= CONFIGURATION GÉNÉRALE =============
CREATE TABLE IF NOT EXISTS ConfigSysteme (
    id                  TEXT PRIMARY KEY,
    cle                 TEXT NOT NULL UNIQUE,       -- TAUX_CHANGE_USD_CDF, SESSION_xxx, DERNIER_NUMERO_RECUE, etc.
    valeur              TEXT NOT NULL,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============= JOURNAL DE SYNCHRONISATION =============
CREATE TABLE IF NOT EXISTS SyncLog (
    id                  TEXT PRIMARY KEY,
    table_name          TEXT NOT NULL,
    last_sync_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    direction           TEXT NOT NULL,              -- PUSH | PULL
    status              TEXT NOT NULL DEFAULT 'SUCCESS',  -- SUCCESS | ERROR
    details             TEXT,                       -- JSON string
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============= INDEXES =============
CREATE INDEX IF NOT EXISTS idx_annee_scolaire_etab ON AnneeScolaire(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_classe_etab_annee ON Classe(etablissement_id, annee_scolaire_id);
CREATE INDEX IF NOT EXISTS idx_user_etab ON User(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_user_username ON User(username);
CREATE INDEX IF NOT EXISTS idx_eleve_etab ON Eleve(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_eleve_annee ON Eleve(annee_scolaire_id);
CREATE INDEX IF NOT EXISTS idx_eleve_matricule ON Eleve(matricule);
CREATE INDEX IF NOT EXISTS idx_tuteur_eleve_eleve ON TuteurEleve(eleve_id);
CREATE INDEX IF NOT EXISTS idx_tuteur_eleve_tuteur ON TuteurEleve(tuteur_id);
CREATE INDEX IF NOT EXISTS idx_eleve_classe_classe ON EleveClasse(classe_id);
CREATE INDEX IF NOT EXISTS idx_frais_etab_annee ON FraisScolaire(etablissement_id, annee_scolaire_id);
CREATE INDEX IF NOT EXISTS idx_echeance_eleve ON Echeance(eleve_id);
CREATE INDEX IF NOT EXISTS idx_echeance_annee ON Echeance(annee_scolaire_id);
CREATE INDEX IF NOT EXISTS idx_paiement_eleve ON Paiement(eleve_id);
CREATE INDEX IF NOT EXISTS idx_paiement_etab ON Paiement(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_paiement_annee ON Paiement(annee_scolaire_id);
CREATE INDEX IF NOT EXISTS idx_paiement_recu ON Paiement(numero_recu);
CREATE INDEX IF NOT EXISTS idx_depense_etab_annee ON Depense(etablissement_id, annee_scolaire_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON AuditLog(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entite ON AuditLog(entite, entite_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON AuditLog(created_at);
CREATE INDEX IF NOT EXISTS idx_config_cle ON ConfigSysteme(cle);
CREATE INDEX IF NOT EXISTS idx_sync_table ON SyncLog(table_name);
