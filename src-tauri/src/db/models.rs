use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Etablissement {
    pub id: String,
    pub nom: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub adresse: Option<String>,
    pub telephone: Option<String>,
    pub email: Option<String>,
    pub logo_url: Option<String>,
    pub couleur_principale: String,
    pub rccm: Option<String>,
    pub id_nat: Option<String>,
    pub devise: String,
    pub actif: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]   // <-- AJOUTÉ
pub struct AnneeScolaire {
    pub id: String,
    pub libelle: String,
    pub etablissement_id: String,
    pub date_debut: Option<String>,  // devenu Option
    pub date_fin: Option<String>,    // devenu Option
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub etablissement: Option<Etablissement>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]   // <-- AJOUTÉ
pub struct Classe {
    pub id: String,
    pub nom: String,
    pub niveau: String,
    pub etablissement_id: String,
    pub annee_scolaire_id: String,
    pub effectif_max: i32,
    pub actif: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub etablissement: Option<Etablissement>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annee_scolaire: Option<AnneeScolaire>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effectif: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frais_classes: Option<Vec<FraisClasseInfo>>,   
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FraisClasseInfo {
    pub frais_scolaire_id: String,
    pub classe_id: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct User {
    pub id: String,
    pub username: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub nom_complet: String,
    pub role: String,
    pub etablissement_id: Option<String>,
    pub actif: bool,
    pub dernier_login: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub etablissement: Option<Etablissement>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UserMin {
    pub id: String,
    pub nom_complet: String,
    pub role: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Eleve {
    pub id: String,
    pub matricule: String,
    pub nom: String,
    pub prenom: String,
    pub date_naissance: Option<String>,
    pub lieu_naissance: Option<String>,
    pub sexe: Option<String>,
    pub address: Option<String>,
    pub ecole_de_provenance: Option<String>,
    pub photo_url: Option<String>,
    pub statut: String,
    pub etablissement_id: String,
    pub annee_scolaire_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub etablissement: Option<Etablissement>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tuteurs: Option<Vec<Tuteur>>, 
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inscriptions: Option<Vec<InscriptionInfo>>,  
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InscriptionInfo {
    pub classe_id: String,
    pub classe_nom: String,
    pub date_inscription: String,
    pub statut: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Tuteur {
    pub id: String,
    pub nom: String,
    pub prenom: String,
    pub telephone: String,
    pub telephone2: Option<String>,
    pub adresse: Option<String>,
    pub profession: Option<String>,
    pub relation: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TuteurEleve {
    pub eleve_id: String,
    pub tuteur_id: String,
    pub is_principal: bool,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EleveClasse {
    pub eleve_id: String,
    pub classe_id: String,
    pub date_inscription: String,
    pub date_sortie: Option<String>,
    pub statut: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")] 
pub struct FraisScolaire {
    pub id: String,
    pub libelle: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub montant: f64,
    pub devise: String,
    pub etablissement_id: String,
    pub annee_scolaire_id: String,
    pub tranche: Option<i32>,
    pub date_echeance: Option<String>,
    pub actif: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub etablissement: Option<Etablissement>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frais_classes: Option<Vec<String>>,  
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FraisClasse {
    pub frais_scolaire_id: String,
    pub classe_id: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Echeance {
    pub id: String,
    pub eleve_id: String,
    pub frais_scolaire_id: String,
    pub etablissement_id: String,
    pub annee_scolaire_id: String,
    pub montant_du: f64,
    pub montant_paye: f64,
    pub statut: String,
    pub date_echeance: Option<String>,
    pub date_paiement_complet: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub eleve: Option<EleveMin>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frais_scolaire: Option<FraisScolaire>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EleveMin {
    pub id: String,
    pub matricule: String,
    pub nom: String,
    pub prenom: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Paiement {
    pub id: String,
    pub numero_recu: String,
    pub eleve_id: String,
    pub echeance_id: Option<String>,
    pub etablissement_id: String,
    pub annee_scolaire_id: String,
    pub user_id: String,
    pub motif: String,
    pub montant: f64,
    pub devise: String,
    pub montant_affecte: Option<f64>,
    pub devise_echeance: Option<String>,
    pub mode_paiement: String,
    pub reference_paiement: Option<String>,
    pub taux_change: Option<f64>,
    pub montant_original: Option<f64>,
    pub annule: bool,
    pub date_annulation: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub eleve: Option<EleveMin>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<UserMin>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AnnulationRecu {
    pub id: String,
    pub paiement_id: String,
    pub user_id: String,
    pub motif: String,
    pub date_annulation: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Depense {
    pub id: String,
    pub etablissement_id: String,
    pub annee_scolaire_id: String,
    pub created_by_id: Option<String>,
    pub categorie: String,
    pub libelle: String,
    pub montant: f64,
    pub devise: String,
    pub beneficiaire: Option<String>,
    pub date_depense: String,
    pub reference_piece: Option<String>,
    pub justificatif_url: Option<String>,
    pub statut: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub etablissement: Option<Etablissement>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<UserMin>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ParametreEtablissement {
    pub id: String,
    pub etablissement_id: String,
    pub annee_scolaire_id: Option<String>,
    pub mentions_legales: Option<String>,
    pub pied_page_recu: Option<String>,
    pub nom_imprimante: Option<String>,
    pub taux_change_usd_bif: f64,
    pub devise_defaut: String,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AuditLog {
    pub id: String,
    pub user_id: Option<String>,
    pub action: String,
    pub entite: String,
    pub entite_id: Option<String>,
    pub details: Option<String>,
    pub adresse_ip: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ConfigSysteme {
    pub id: String,
    pub cle: String,
    pub valeur: String,
    pub updated_at: String,
}