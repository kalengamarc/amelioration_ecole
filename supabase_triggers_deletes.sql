-- ============================================================================
-- SGFS-ME — Triggers d'audit des suppressions (propagation multi-machines)
-- ============================================================================
-- Pourquoi ?
--   La synchronisation propage les suppressions via le journal AuditLog.
--   Sans ces triggers, une suppression effectuée DIRECTEMENT dans Supabase
--   (Table Editor, script SQL...) n'est jamais journalisée et n'atteint donc
--   jamais les autres machines : la donnée reste en "fantôme" localement.
--
-- À exécuter : Supabase → SQL Editor → coller → Run (sur une base EXISTANTE).
-- Idempotent : peut être relancé sans risque.
--
-- ⚠️ NE PAS relancer supabase_schema.sql sur une base existante : ce script
--    DROP toutes les tables et effacerait vos données cloud !
-- ============================================================================

-- Fonction générique d'audit des suppressions
CREATE OR REPLACE FUNCTION sync_record_delete() RETURNS TRIGGER AS $$
DECLARE
    entite_id_val TEXT;
    col1 TEXT := NULLIF(TG_ARGV[0], '');
    col2 TEXT := NULLIF(TG_ARGV[1], '');
    v1 TEXT;
    v2 TEXT;
BEGIN
    IF col1 IS NULL THEN
        entite_id_val := OLD.id::text;
    ELSE
        EXECUTE format('SELECT ($1).%I::text', col1) INTO v1 USING OLD;
        EXECUTE format('SELECT ($1).%I::text', col2) INTO v2 USING OLD;
        entite_id_val := col1 || '=' || v1 || ',' || col2 || '=' || v2;
    END IF;

    INSERT INTO "AuditLog" (id, user_id, action, entite, entite_id, created_at)
    VALUES (gen_random_uuid()::text, NULL, 'DELETE', TG_TABLE_NAME, entite_id_val, NOW());
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ── Tables simples (id unique) ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_delete_classe ON "Classe";
CREATE TRIGGER trg_audit_delete_classe AFTER DELETE ON "Classe" FOR EACH ROW EXECUTE FUNCTION sync_record_delete();

DROP TRIGGER IF EXISTS trg_audit_delete_tuteur ON "Tuteur";
CREATE TRIGGER trg_audit_delete_tuteur AFTER DELETE ON "Tuteur" FOR EACH ROW EXECUTE FUNCTION sync_record_delete();

DROP TRIGGER IF EXISTS trg_audit_delete_fraisscolaire ON "FraisScolaire";
CREATE TRIGGER trg_audit_delete_fraisscolaire AFTER DELETE ON "FraisScolaire" FOR EACH ROW EXECUTE FUNCTION sync_record_delete();

DROP TRIGGER IF EXISTS trg_audit_delete_echeance ON "Echeance";
CREATE TRIGGER trg_audit_delete_echeance AFTER DELETE ON "Echeance" FOR EACH ROW EXECUTE FUNCTION sync_record_delete();

DROP TRIGGER IF EXISTS trg_audit_delete_annulationrecu ON "AnnulationRecu";
CREATE TRIGGER trg_audit_delete_annulationrecu AFTER DELETE ON "AnnulationRecu" FOR EACH ROW EXECUTE FUNCTION sync_record_delete();

DROP TRIGGER IF EXISTS trg_audit_delete_depense ON "Depense";
CREATE TRIGGER trg_audit_delete_depense AFTER DELETE ON "Depense" FOR EACH ROW EXECUTE FUNCTION sync_record_delete();

DROP TRIGGER IF EXISTS trg_audit_delete_parametreetablissement ON "ParametreEtablissement";
CREATE TRIGGER trg_audit_delete_parametreetablissement AFTER DELETE ON "ParametreEtablissement" FOR EACH ROW EXECUTE FUNCTION sync_record_delete();

-- ── Tables composites (clé primaire à deux colonnes) ────────────────────────
DROP TRIGGER IF EXISTS trg_audit_delete_tuteureleve ON "TuteurEleve";
CREATE TRIGGER trg_audit_delete_tuteureleve AFTER DELETE ON "TuteurEleve" FOR EACH ROW EXECUTE FUNCTION sync_record_delete('eleve_id', 'tuteur_id');

DROP TRIGGER IF EXISTS trg_audit_delete_eleveclasse ON "EleveClasse";
CREATE TRIGGER trg_audit_delete_eleveclasse AFTER DELETE ON "EleveClasse" FOR EACH ROW EXECUTE FUNCTION sync_record_delete('eleve_id', 'classe_id');

DROP TRIGGER IF EXISTS trg_audit_delete_fraisclasse ON "FraisClasse";
CREATE TRIGGER trg_audit_delete_fraisclasse AFTER DELETE ON "FraisClasse" FOR EACH ROW EXECUTE FUNCTION sync_record_delete('frais_scolaire_id', 'classe_id');

-- ── Vérification ────────────────────────────────────────────────────────────
-- SELECT tgname, tgrelid::regclass FROM pg_trigger
-- WHERE NOT tgisinternal AND tgname LIKE 'trg_audit_%'
-- ORDER BY tgrelid::regclass::text;
