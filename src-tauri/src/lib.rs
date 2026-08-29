mod db;
mod error;
mod commands;
mod utils;
mod services;
mod sync;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(db::init_db().expect("Failed to init database"))
        // Auth
        .invoke_handler(tauri::generate_handler![
            commands::auth::login,
            commands::auth::get_me,
            // Etablissements
            commands::etablissements::list_etablissements,
            commands::etablissements::get_etablissement,
            commands::etablissements::create_etablissement,
            commands::etablissements::update_etablissement,
            commands::etablissements::delete_etablissement,
            commands::etablissements::get_etablissement_context,
            // Classes
            commands::classes::list_classes,
            commands::classes::get_classe,
            commands::classes::create_classe,
            commands::classes::update_classe,
            commands::classes::delete_classe,
            commands::classes::clean_eleve_classe_duplicates,
            commands::classes::list_eleves_sans_classe,
            // Eleves
            commands::eleves::list_eleves,
            commands::eleves::get_eleve,
            commands::eleves::create_eleve,
            commands::eleves::update_eleve,
            commands::eleves::delete_eleve,
            commands::eleves::get_eleve_stats,
            commands::eleves::pull_students_by_matricules,
            // Annees scolaires
            commands::annees_scolaires::list_annees_scolaires,
            commands::annees_scolaires::create_annee_scolaire,
            commands::annees_scolaires::update_annee_scolaire,
            commands::annees_scolaires::delete_annee_scolaire,
            commands::annees_scolaires::activer_annee_scolaire,
            // Frais
            commands::frais::list_frais,
            commands::frais::create_frais,
            commands::frais::update_frais,
            commands::frais::delete_frais,
            // Echeances
            commands::echeances::list_echeances,
            // Encaissements (Paiements)
            commands::encaissements::list_paiements,
            commands::encaissements::create_paiement,
            commands::encaissements::annuler_paiement,
            commands::encaissements::update_paiement,
            commands::encaissements::get_paiement,
            // Depenses
            commands::depenses::list_depenses,
            commands::depenses::create_depense,
            commands::depenses::update_depense,
            commands::depenses::delete_depense,
            // Parametres
            commands::parametres::get_parametres,
            commands::parametres::save_parametres,
            // Utilisateurs
            commands::utilisateurs::list_utilisateurs,
            commands::utilisateurs::create_utilisateur,
            commands::utilisateurs::update_utilisateur,
            commands::utilisateurs::delete_utilisateur,
            // Dashboard
            commands::dashboard::get_dashboard_stats,
            // Rapports
            commands::rapports::get_rapport_financier,
            commands::rapports::get_rapport_eleves,
            commands::rapports::get_rapport_journalier,
            // Audit
            commands::audit::list_audit_logs,
            // Sync
            commands::sync::sync_status,
            commands::sync::validate_sync_ready,
            commands::sync::sync_push,
            commands::sync::sync_pull,
            commands::sync::save_sync_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}