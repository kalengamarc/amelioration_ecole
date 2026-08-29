-- SGFS-ME — Script d'initialisation de la base de données distante pour Supabase (PostgreSQL)
-- Ce script crée l'ensemble des tables requises pour la synchronisation bidirectionnelle.
-- Exécutez ce script dans l'éditeur SQL de votre projet Supabase.

-- ============= SUPPRESSION ÉVENTUELLE DES ANCIENNES TABLES =============
DROP TABLE IF EXISTS "SyncLog" CASCADE;
DROP TABLE IF EXISTS "ConfigSysteme" CASCADE;
DROP TABLE IF EXISTS "AuditLog" CASCADE;
DROP TABLE IF EXISTS "ParametreEtablissement" CASCADE;
DROP TABLE IF EXISTS "Depense" CASCADE;
DROP TABLE IF EXISTS "AnnulationRecu" CASCADE;
DROP TABLE IF EXISTS "Paiement" CASCADE;
DROP TABLE IF EXISTS "Echeance" CASCADE;
DROP TABLE IF EXISTS "FraisClasse" CASCADE;
DROP TABLE IF EXISTS "FraisScolaire" CASCADE;
DROP TABLE IF EXISTS "EleveClasse" CASCADE;
DROP TABLE IF EXISTS "TuteurEleve" CASCADE;
DROP TABLE IF EXISTS "Tuteur" CASCADE;
DROP TABLE IF EXISTS "Eleve" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;
DROP TABLE IF EXISTS "Classe" CASCADE;
DROP TABLE IF EXISTS "AnneeScolaire" CASCADE;
DROP TABLE IF EXISTS "Etablissement" CASCADE;

DROP TABLE IF EXISTS synclog CASCADE;
DROP TABLE IF EXISTS configsysteme CASCADE;
DROP TABLE IF EXISTS auditlog CASCADE;
DROP TABLE IF EXISTS parametreetablissement CASCADE;
DROP TABLE IF EXISTS depense CASCADE;
DROP TABLE IF EXISTS annulationrecu CASCADE;
DROP TABLE IF EXISTS paiement CASCADE;
DROP TABLE IF EXISTS echeance CASCADE;
DROP TABLE IF EXISTS fraisclasse CASCADE;
DROP TABLE IF EXISTS fraisscolaire CASCADE;
DROP TABLE IF EXISTS eleveclasse CASCADE;
DROP TABLE IF EXISTS tuteureleve CASCADE;
DROP TABLE IF EXISTS tuteur CASCADE;
DROP TABLE IF EXISTS eleve CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;
DROP TABLE IF EXISTS classe CASCADE;
DROP TABLE IF EXISTS anneescolaire CASCADE;
DROP TABLE IF EXISTS etablissement CASCADE;

-- ============= ÉTABLISSEMENTS =============
CREATE TABLE IF NOT EXISTS "Etablissement" (
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
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_etab_actif ON "Etablissement"(actif);

-- ============= ANNÉES SCOLAIRES =============
CREATE TABLE IF NOT EXISTS "AnneeScolaire" (
    id                  TEXT PRIMARY KEY,
    libelle             TEXT NOT NULL,
    etablissement_id    TEXT NOT NULL REFERENCES "Etablissement"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    date_debut          TEXT NOT NULL,
    date_fin            TEXT NOT NULL,
    active              INTEGER NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(etablissement_id, libelle)
);
CREATE INDEX IF NOT EXISTS idx_annee_etab_active ON "AnneeScolaire"(etablissement_id, active);

-- ============= CLASSES =============
CREATE TABLE IF NOT EXISTS "Classe" (
    id                  TEXT PRIMARY KEY,
    nom                 TEXT NOT NULL,
    niveau              TEXT NOT NULL,
    etablissement_id    TEXT NOT NULL REFERENCES "Etablissement"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    annee_scolaire_id   TEXT NOT NULL REFERENCES "AnneeScolaire"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    effectif_max        INTEGER NOT NULL DEFAULT 40,
    actif               INTEGER NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(nom, etablissement_id, annee_scolaire_id)
);
CREATE INDEX IF NOT EXISTS idx_classe_etab_annee ON "Classe"(etablissement_id, annee_scolaire_id);

-- ============= UTILISATEURS (RBAC) =============
CREATE TABLE IF NOT EXISTS "User" (
    id                  TEXT PRIMARY KEY,
    username            TEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    nom_complet         TEXT NOT NULL,
    role                TEXT NOT NULL,
    etablissement_id    TEXT REFERENCES "Etablissement"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    actif               INTEGER NOT NULL DEFAULT 1,
    dernier_login       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_etab_actif ON "User"(etablissement_id, actif);

-- ============= ÉLÈVES =============
CREATE TABLE IF NOT EXISTS "Eleve" (
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
    etablissement_id     TEXT NOT NULL REFERENCES "Etablissement"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    annee_scolaire_id    TEXT REFERENCES "AnneeScolaire"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eleve_etab_statut ON "Eleve"(etablissement_id, statut);
CREATE INDEX IF NOT EXISTS idx_eleve_annee ON "Eleve"(annee_scolaire_id);
CREATE INDEX IF NOT EXISTS idx_eleve_nom_prenom ON "Eleve"(nom, prenom);

-- ============= TUTEURS =============
CREATE TABLE IF NOT EXISTS "Tuteur" (
    id          TEXT PRIMARY KEY,
    nom         TEXT NOT NULL,
    prenom      TEXT NOT NULL,
    telephone   TEXT NOT NULL,
    telephone2  TEXT,
    adresse     TEXT,
    profession  TEXT,
    relation    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tuteur_tel ON "Tuteur"(telephone);

-- ============= TUTEUR-ÉLÈVE (Junction) =============
CREATE TABLE IF NOT EXISTS "TuteurEleve" (
    eleve_id     TEXT NOT NULL REFERENCES "Eleve"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    tuteur_id    TEXT NOT NULL REFERENCES "Tuteur"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    is_principal INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (eleve_id, tuteur_id)
);
CREATE INDEX IF NOT EXISTS idx_tuteur_eleve_tuteur ON "TuteurEleve"(tuteur_id);

-- ============= INSCRIPTIONS (CLASSES DES ÉLÈVES) =============
CREATE TABLE IF NOT EXISTS "EleveClasse" (
    eleve_id          TEXT NOT NULL REFERENCES "Eleve"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    classe_id         TEXT NOT NULL REFERENCES "Classe"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    date_inscription  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_sortie       TEXT,
    statut            TEXT NOT NULL DEFAULT 'ACTIF',
    PRIMARY KEY (eleve_id, classe_id)
);
CREATE INDEX IF NOT EXISTS idx_eleve_classe_classe_statut ON "EleveClasse"(classe_id, statut);
-- Un élève ne peut avoir qu'une seule inscription active à la fois.
CREATE UNIQUE INDEX IF NOT EXISTS idx_eleve_classe_one_active_per_eleve
    ON "EleveClasse"(eleve_id) WHERE statut = 'ACTIF';

-- ============= FRAIS SCOLAIRES =============
CREATE TABLE IF NOT EXISTS "FraisScolaire" (
    id                  TEXT PRIMARY KEY,
    libelle             TEXT NOT NULL,
    type                TEXT NOT NULL,
    montant             DOUBLE PRECISION NOT NULL,
    devise              TEXT NOT NULL DEFAULT 'CDF',
    etablissement_id    TEXT NOT NULL REFERENCES "Etablissement"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    annee_scolaire_id   TEXT NOT NULL REFERENCES "AnneeScolaire"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    tranche             INTEGER,
    date_echeance       TEXT,
    actif               INTEGER NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_frais_etab_annee_actif ON "FraisScolaire"(etablissement_id, annee_scolaire_id, actif);
CREATE INDEX IF NOT EXISTS idx_frais_type ON "FraisScolaire"(type);

-- ============= FRAIS-CLASSE (Junction) =============
CREATE TABLE IF NOT EXISTS "FraisClasse" (
    frais_scolaire_id  TEXT NOT NULL REFERENCES "FraisScolaire"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    classe_id          TEXT NOT NULL REFERENCES "Classe"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (frais_scolaire_id, classe_id)
);
CREATE INDEX IF NOT EXISTS idx_frais_classe_classe ON "FraisClasse"(classe_id);

-- ============= ÉCHÉANCES PAR ÉLÈVE =============
CREATE TABLE IF NOT EXISTS "Echeance" (
    id                      TEXT PRIMARY KEY,
    eleve_id                TEXT NOT NULL REFERENCES "Eleve"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    frais_scolaire_id       TEXT NOT NULL REFERENCES "FraisScolaire"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    etablissement_id        TEXT NOT NULL REFERENCES "Etablissement"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    annee_scolaire_id       TEXT NOT NULL REFERENCES "AnneeScolaire"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    montant_du              DOUBLE PRECISION NOT NULL,
    montant_paye            DOUBLE PRECISION NOT NULL DEFAULT 0,
    statut                  TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    date_echeance           TEXT,
    date_paiement_complet   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(eleve_id, frais_scolaire_id)
);
CREATE INDEX IF NOT EXISTS idx_echeance_eleve_statut ON "Echeance"(eleve_id, statut);
CREATE INDEX IF NOT EXISTS idx_echeance_frais ON "Echeance"(frais_scolaire_id);
CREATE INDEX IF NOT EXISTS idx_echeance_annee_statut ON "Echeance"(annee_scolaire_id, statut);
CREATE INDEX IF NOT EXISTS idx_echeance_etab ON "Echeance"(etablissement_id);

-- ============= PAIEMENTS (ENCAISSEMENTS) =============
CREATE TABLE IF NOT EXISTS "Paiement" (
    id                    TEXT PRIMARY KEY,
    numero_recu           TEXT NOT NULL UNIQUE,
    eleve_id              TEXT NOT NULL REFERENCES "Eleve"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    echeance_id           TEXT REFERENCES "Echeance"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    etablissement_id      TEXT NOT NULL REFERENCES "Etablissement"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    annee_scolaire_id     TEXT NOT NULL REFERENCES "AnneeScolaire"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    user_id               TEXT REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    motif                 TEXT NOT NULL,
    montant               DOUBLE PRECISION NOT NULL,
    devise                TEXT NOT NULL DEFAULT 'CDF',
    montant_affecte       DOUBLE PRECISION,
    devise_echeance       TEXT,
    mode_paiement         TEXT NOT NULL,
    reference_paiement    TEXT,
    taux_change           DOUBLE PRECISION,
    montant_original      DOUBLE PRECISION,
    annule                INTEGER NOT NULL DEFAULT 0,
    date_annulation       TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paiement_eleve_date ON "Paiement"(eleve_id, created_at);
CREATE INDEX IF NOT EXISTS idx_paiement_etab_date ON "Paiement"(etablissement_id, created_at);
CREATE INDEX IF NOT EXISTS idx_paiement_annee_date ON "Paiement"(annee_scolaire_id, created_at);
CREATE INDEX IF NOT EXISTS idx_paiement_annule ON "Paiement"(annule);

-- ============= ANNULATIONS DE REÇUS =============
CREATE TABLE IF NOT EXISTS "AnnulationRecu" (
    id              TEXT PRIMARY KEY,
    paiement_id     TEXT NOT NULL UNIQUE REFERENCES "Paiement"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    motif           TEXT NOT NULL,
    date_annulation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============= DÉPENSES =============
CREATE TABLE IF NOT EXISTS "Depense" (
    id                   TEXT PRIMARY KEY,
    etablissement_id     TEXT NOT NULL REFERENCES "Etablissement"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    annee_scolaire_id    TEXT NOT NULL REFERENCES "AnneeScolaire"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_by_id        TEXT REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    categorie            TEXT NOT NULL,
    libelle              TEXT NOT NULL,
    montant              DOUBLE PRECISION NOT NULL,
    devise               TEXT NOT NULL DEFAULT 'CDF',
    beneficiaire         TEXT,
    date_depense         TEXT NOT NULL,
    reference_piece      TEXT,
    justificatif_url     TEXT,
    statut               TEXT NOT NULL DEFAULT 'VALIDE',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_depense_etab_date ON "Depense"(etablissement_id, date_depense);
CREATE INDEX IF NOT EXISTS idx_depense_annee_statut ON "Depense"(annee_scolaire_id, statut);

-- ============= PARAMÈTRES PAR ÉTABLISSEMENT =============
CREATE TABLE IF NOT EXISTS "ParametreEtablissement" (
    id                    TEXT PRIMARY KEY,
    etablissement_id     TEXT NOT NULL UNIQUE REFERENCES "Etablissement"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    annee_scolaire_id    TEXT REFERENCES "AnneeScolaire"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    mentions_legales      TEXT,
    pied_page_recu        TEXT,
    nom_imprimante        TEXT,
    taux_change_usd_bif   DOUBLE PRECISION NOT NULL DEFAULT 2500,
    devise_defaut         TEXT NOT NULL DEFAULT 'CDF',
    created_by            TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_params_annee ON "ParametreEtablissement"(annee_scolaire_id);

-- ============= JOURNAL D'AUDIT =============
CREATE TABLE IF NOT EXISTS "AuditLog" (
    id           TEXT PRIMARY KEY,
    user_id      TEXT REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    action       TEXT NOT NULL,
    entite       TEXT NOT NULL,
    entite_id    TEXT,
    details      TEXT,
    adresse_ip   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user_date ON "AuditLog"(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entite ON "AuditLog"(entite, entite_id);
CREATE INDEX IF NOT EXISTS idx_audit_action_date ON "AuditLog"(action, created_at);

-- ============= CONFIGURATION GÉNÉRALE =============
CREATE TABLE IF NOT EXISTS "ConfigSysteme" (
    id          TEXT PRIMARY KEY,
    cle         TEXT NOT NULL UNIQUE,
    valeur      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============= JOURNAL DE SYNCHRONISATION =============
CREATE TABLE IF NOT EXISTS "SyncLog" (
    id            TEXT PRIMARY KEY,
    table_name    TEXT NOT NULL,
    last_sync_at  TIMESTAMPTZ NOT NULL,
    direction     TEXT NOT NULL DEFAULT 'BIDIRECTIONAL',
    status        TEXT NOT NULL DEFAULT 'SUCCESS',
    details       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Désactivation du RLS sur toutes les tables pour l'accès REST direct PostgREST
ALTER TABLE "Etablissement" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "AnneeScolaire" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Classe" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "User" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Eleve" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Tuteur" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "TuteurEleve" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "EleveClasse" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "FraisScolaire" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "FraisClasse" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Echeance" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Paiement" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "AnnulationRecu" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Depense" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "ParametreEtablissement" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "ConfigSysteme" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncLog" DISABLE ROW LEVEL SECURITY;
