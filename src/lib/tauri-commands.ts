import { invoke } from '@tauri-apps/api/core'

// ── Helper ──────────────────────────────────────────────────

/** Unwrap Tauri invoke result — throws on { success: false } */
function unwrap<T>(res: any): T {
  if (res && res.success === false) {
    throw new Error(res.error || 'Erreur inconnue')
  }
  return res as T
}

/** Invoke a Tauri command without any key conversion. */
async function cmd<T = any>(command: string, params: Record<string, any> = {}): Promise<T> {
  const result = unwrap<T>(await invoke(command, params))
  // Every successful local write requests a debounced background sync.
  // Read commands and sync commands are intentionally excluded.
  const isLocalWrite = /^(create|update|delete|save|activer|annuler|clean)_/.test(command)
    && !command.startsWith('sync_')
    && command !== 'save_sync_config'
  if (isLocalWrite && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('local-data-changed'))
  }
  return result
}

// ── Auth ───────────────────────────────────────────────────

export async function login(username: string, password: string) {
  return cmd<{ token: string; user: any }>('login', { req: { username, password } })
}

export async function getMe(token: string) {
  return cmd('get_me', { token })
}

// ── Établissements ──────────────────────────────────────────

export async function listEtablissements(id?: string) {
  return cmd('list_etablissements', { id: id || null })
}
export async function getEtablissement(id: string) {
  return cmd('get_etablissement', { id })
}
export async function createEtablissement(data: Record<string, any>) {
  const couleur = data.couleurPrincipale || data.couleur_principale || '#0c241f'

  return cmd('create_etablissement', {
    nom: data.nom,
    type: data.type || 'PRIMAIRE',
    adresse: data.adresse || null,
    telephone: data.telephone || null,
    email: data.email || null,
    logoUrl: data.logoUrl || data.logo_url || null,
    logo_url: data.logoUrl || data.logo_url || null,
    couleurPrincipale: couleur,
    couleur_principale: couleur,
    devise: data.devise || 'CDF',
  })
}
export async function updateEtablissement(id: string, data: Record<string, any>) {
  return cmd('update_etablissement', { id, ...data })
}
export async function deleteEtablissement(id: string) {
  return cmd('delete_etablissement', { id })
}
export async function getEtablissementContext(id: string) {
  return cmd('get_etablissement_context', { id })
}

// ── Années Scolaires ────────────────────────────────────────

export async function listAnneesScolaires(etablissementId?: string) {
  const etabId = etablissementId || null
  return cmd('list_annees_scolaires', {
    etablissementId: etabId,
    etablissement_id: etabId,
  })
}
export async function createAnneeScolaire(data: Record<string, any>) {
  const etabId = data.etablissementId || data.etablissement_id
  const libelle = data.libelle
  const dateDebut = data.dateDebut || data.date_debut || null
  const dateFin = data.dateFin || data.date_fin || null

  return cmd('create_annee_scolaire', {
    libelle,
    etablissementId: etabId,
    etablissement_id: etabId,
    dateDebut,
    date_debut: dateDebut,
    dateFin,
    date_fin: dateFin,
  })
}
export async function updateAnneeScolaire(id: string, data: Record<string, any>) {
  const dateDebut = data.dateDebut || data.date_debut || null
  const dateFin = data.dateFin || data.date_fin || null

  return cmd('update_annee_scolaire', {
    id,
    libelle: data.libelle,
    dateDebut,
    date_debut: dateDebut,
    dateFin,
    date_fin: dateFin,
    active: data.active,
  })
}
export async function deleteAnneeScolaire(id: string) {
  return cmd('delete_annee_scolaire', { id })
}
export async function activerAnneeScolaire(id: string) {
  return cmd('activer_annee_scolaire', { id })
}

// ── Classes ─────────────────────────────────────────────────

export async function listClasses(etablissementId?: string, anneeScolaireId?: string) {
  const etabId = etablissementId || null
  const anneeId = anneeScolaireId || null
  return cmd('list_classes', {
    etablissementId: etabId,
    etablissement_id: etabId,
    anneeScolaireId: anneeId,
    annee_scolaire_id: anneeId,
  })
}
export async function getClasse(id: string) {
  return cmd('get_classe', { id })
}
export async function createClasse(data: Record<string, any>) {
  const etabId = data.etablissementId || data.etablissement_id
  const anneeId = data.anneeScolaireId || data.annee_scolaire_id
  const nom = data.nom
  const niveau = data.niveau || 'PRIMAIRE'
  const effectifMax = data.effectifMax || data.effectif_max || 40

  return cmd('create_classe', {
    nom,
    niveau,
    etablissementId: etabId,
    etablissement_id: etabId,
    anneeScolaireId: anneeId,
    annee_scolaire_id: anneeId,
    effectifMax,
    effectif_max: effectifMax,
  })
}
export async function updateClasse(id: string, data: Record<string, any>) {
  return cmd('update_classe', { id, ...data })
}
export async function deleteClasse(id: string) {
  return cmd('delete_classe', { id })
}
export async function cleanEleveClasseDuplicates() {
  return cmd('clean_eleve_classe_duplicates', {})
}

export async function listElevesSansClasse(etablissementId?: string, anneeScolaireId?: string) {
  const etabId = etablissementId || null
  const anneeId = anneeScolaireId || null
  return cmd('list_eleves_sans_classe', {
    etablissementId: etabId,
    etablissement_id: etabId,
    anneeScolaireId: anneeId,
    annee_scolaire_id: anneeId,
  })
}

// ── Élèves ──────────────────────────────────────────────────

export async function listEleves(params: {
  etablissementId?: string; anneeScolaireId?: string; classeId?: string;
  statut?: string; search?: string; page?: number; pageSize?: number;
} = {}) {
  const etabId = params.etablissementId || null
  const anneeId = params.anneeScolaireId || null
  const classeId = params.classeId || null

  return cmd('list_eleves', {
    etablissementId: etabId,
    etablissement_id: etabId,
    anneeScolaireId: anneeId,
    annee_scolaire_id: anneeId,
    classeId,
    classe_id: classeId,
    statut: params.statut || null,
    search: params.search || null,
    page: params.page || 1,
    pageSize: params.pageSize || 20,
    page_size: params.pageSize || 20,
  })
}

export async function getEleve(id: string) {
  return cmd('get_eleve', { id })
}

export async function createEleve(data: Record<string, any>) {
  const etabId = data.etablissementId || data.etablissement_id
  const anneeId = data.anneeScolaireId || data.annee_scolaire_id
  const classeId = data.classeId || data.classe_id
  const dateNaissance = data.dateNaissance || data.date_naissance || null
  const lieuNaissance = data.lieuNaissance || data.lieu_naissance || null

  return cmd('create_eleve', {
    data: {
      nom: data.nom,
      prenom: data.prenom,
      sexe: data.sexe || 'M',
      dateNaissance,
      date_naissance: dateNaissance,
      lieuNaissance,
      lieu_naissance: lieuNaissance,
      etablissementId: etabId,
      etablissement_id: etabId,
      anneeScolaireId: anneeId,
      annee_scolaire_id: anneeId,
      classeId,
      classe_id: classeId,
      tuteurs: data.tuteurs || [],
    }
  })
}

export async function updateEleve(id: string, data: Record<string, any>) {
  const etabId = data.etablissementId || data.etablissement_id
  const anneeId = data.anneeScolaireId || data.annee_scolaire_id
  const classeId = data.classeId || data.classe_id
  const dateNaissance = data.dateNaissance || data.date_naissance || null
  const lieuNaissance = data.lieuNaissance || data.lieu_naissance || null

  return cmd('update_eleve', {
    id,
    data: {
      nom: data.nom,
      prenom: data.prenom,
      sexe: data.sexe,
      dateNaissance,
      date_naissance: dateNaissance,
      lieuNaissance,
      lieu_naissance: lieuNaissance,
      etablissementId: etabId,
      etablissement_id: etabId,
      anneeScolaireId: anneeId,
      annee_scolaire_id: anneeId,
      classeId,
      classe_id: classeId,
      tuteurs: data.tuteurs || [],
    }
  })
}

export async function deleteEleve(id: string) {
  return cmd('delete_eleve', { id })
}

export async function getEleveStats(etablissementId?: string, anneeScolaireId?: string) {
  const etabId = etablissementId || null
  const anneeId = anneeScolaireId || null
  return cmd('get_eleve_stats', {
    etablissementId: etabId,
    etablissement_id: etabId,
    anneeScolaireId: anneeId,
    annee_scolaire_id: anneeId,
  })
}

export async function pullStudentsByMatricules(matricules: string[]) {
  return cmd('pull_students_by_matricules', { matricules })
}

// ── Frais Scolaires ─────────────────────────────────────────

export async function listFrais(etablissementId?: string, anneeScolaireId?: string, actif?: boolean) {
  const etabId = etablissementId || null
  const anneeId = anneeScolaireId || null
  return cmd('list_frais', {
    etablissementId: etabId,
    etablissement_id: etabId,
    anneeScolaireId: anneeId,
    annee_scolaire_id: anneeId,
    actif: actif ?? null,
  })
}
export async function createFrais(data: Record<string, any>) {
  const etabId = data.etablissementId || data.etablissement_id
  const anneeId = data.anneeScolaireId || data.annee_scolaire_id || null
  const typeVal = data.type || data.type_ || 'SCOLARITE'
  const dev = data.devise || 'BIF'

  return cmd('create_frais', {
    libelle: data.libelle,
    type: typeVal,
    type_: typeVal,
    montant: Number(data.montant),
    devise: dev,
    etablissementId: etabId,
    etablissement_id: etabId,
    anneeScolaireId: anneeId,
    annee_scolaire_id: anneeId,
    tranche: data.tranche || null,
    dateEcheance: data.dateEcheance || data.date_echeance || null,
    date_echeance: data.dateEcheance || data.date_echeance || null,
    classeIds: data.classeIds || data.classe_ids || data.fraisClasses || null,
    classe_ids: data.classeIds || data.classe_ids || data.fraisClasses || null,
  })
}
export async function updateFrais(id: string, data: Record<string, any>) {
  const typeVal = data.type || data.type_
  const dev = data.devise
  const dateEch = data.dateEcheance || data.date_echeance
  const cIds = data.classeIds || data.classe_ids || data.fraisClasses

  return cmd('update_frais', {
    id,
    libelle: data.libelle,
    type: typeVal,
    type_: typeVal,
    montant: data.montant != null ? Number(data.montant) : undefined,
    devise: dev,
    tranche: data.tranche != null ? Number(data.tranche) : undefined,
    dateEcheance: dateEch,
    date_echeance: dateEch,
    actif: data.actif,
    classeIds: cIds,
    classe_ids: cIds,
  })
}
export async function deleteFrais(id: string) {
  return cmd('delete_frais', { id })
}

// ── Échéances ───────────────────────────────────────────────────────────────
// À recopier dans src/lib/tauri-commands.ts (remplace le bloc existant).

/** Totaux d'un élève dans UNE devise. Jamais de somme inter-devises. */
export interface TotalDevise {
  devise: string
  totalDu: number
  totalPaye: number
  reste: number
}

/** Détail d'un frais, avec imputation des paiements (cloisonnée par devise). */
export interface LigneFrais {
  libelle: string
  /** Devise du frais : deux lignes d'un même élève peuvent différer. */
  devise: string
  montantDu: number
  montantPaye: number
  reste: number
  dateEcheance: string | null
  etat: 'PAYE' | 'PARTIEL' | 'DU'
}

export interface EcheanceRow {
  eleveId: string
  eleveNom: string
  elevePrenom: string
  eleveMatricule: string
  classeNom: string
  totalDu: number
  totalPaye: number
  reste: number
  statut: 'PAYE' | 'PARTIELLEMENT_PAYE' | 'EN_RETARD' | 'EN_ATTENTE'
  dateEcheance: string | null
  retardJours: number
  /** Devise de l'établissement (CDF par défaut). */
  devise: string
  /** Libellés des frais impayés, ex. « Minerval T1, Inscription ». */
  motif: string | null
  /** Nombre d'échéances agrégées pour cet élève. */
  nbEcheances: number
  /** Détail frais par frais, pour un message de relance explicite. */
  lignes: LigneFrais[]
  /** Dû / payé / reste ventilés par devise. */
  totaux: TotalDevise[]
  /** Tuteur principal (TuteurEleve.is_principal → Tuteur). */
  tuteurNom: string | null
  tuteurTelephone: string | null
  /** Colonne Tuteur.relation : Père, Mère, Oncle… */
  tuteurLien: string | null
}

export interface EcheancesResponse {
  success: boolean
  data: EcheanceRow[]
  stats: Record<'PAYE' | 'PARTIELLEMENT_PAYE' | 'EN_RETARD' | 'EN_ATTENTE', number>
  /**
   * Somme brute des restes — ne vaut que si une seule devise est utilisée.
   * @deprecated Utiliser `resteGlobalParDevise`.
   */
  resteGlobal: number
  /** Reste à percevoir ventilé par devise, sur tout le périmètre filtré. */
  resteGlobalParDevise: TotalDevise[]
  /** Capacités détectées dans la base : signale une donnée dégradée. */
  schema: {
    /** La table Echeance existe. */
    hasEcheances: boolean
    /** Les frais peuvent être ciblés par classe (classe_ids ou FraisClasse). */
    hasClasseTargeting: boolean
    /** Les tables Tuteur / TuteurEleve existent. */
    hasTuteurs: boolean
  }
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export interface ListEcheancesParams {
  eleveId?: string
  etablissementId?: string
  anneeScolaireId?: string
  classeId?: string
  statut?: string
  search?: string
  page?: number
  pageSize?: number
}

export async function listEcheances(
  params: ListEcheancesParams = {},
): Promise<EcheancesResponse> {
  return cmd('list_echeances', {
    eleveId: params.eleveId || null,
    etablissementId: params.etablissementId || null,
    anneeScolaireId: params.anneeScolaireId || null,
    classeId: params.classeId || null,
    statut: params.statut || null,
    search: params.search || null,
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
  })
}

export async function createEcheancesBulk(
  fraisScolaireId: string,
  anneeScolaireId: string,
  eleveIds: string[],
) {
  return cmd('create_echeances_bulk', { fraisScolaireId, anneeScolaireId, eleveIds })
}

export async function updateEcheance(id: string, data: Record<string, any>) {
  return cmd('update_echeance', { id, ...data })
}

export async function deleteEcheance(id: string) {
  return cmd('delete_echeance', { id })
}

// ── Encaissements (Paiements) ──────────────────────────────

export async function listPaiements(params: {
  etablissementId?: string; anneeScolaireId?: string; eleveId?: string;
  annule?: boolean; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number;
  search?: string;
  modePaiement?: string;
} = {}) {
  const etablissementId = params.etablissementId || null
  const anneeScolaireId = params.anneeScolaireId || null
  const eleveId = params.eleveId || null
  const annule = params.annule ?? null
  const dateFrom = params.dateFrom || null
  const dateTo = params.dateTo || null
  const search = params.search?.trim() || null
  const modePaiement = params.modePaiement || null
  const page = params.page || 1
  const pageSize = params.pageSize || 20

  return cmd('list_paiements', {
    etablissementId,
    etablissement_id: etablissementId,
    anneeScolaireId,
    annee_scolaire_id: anneeScolaireId,
    eleveId,
    eleve_id: eleveId,
    annule,
    dateFrom,
    date_from: dateFrom,
    dateTo,
    date_to: dateTo,
    search,
    modePaiement,
    mode_paiement: modePaiement,
    page,
    pageSize,
    page_size: pageSize,
  })
}

export async function createPaiement(data: Record<string, any>) {
  const eleveId = data.eleveId || data.eleve_id
  const echeanceId = data.echeanceId || data.echeance_id || null
  const etablissementId = data.etablissementId || data.etablissement_id
  const anneeScolaireId = data.anneeScolaireId || data.annee_scolaire_id || null
  const userId = data.userId || data.user_id
  const motif = data.motif
  const montant = Number(data.montant)
  const devise = data.devise || 'CDF'
  const montantAffecte = data.montantAffecte ?? data.montant_affecte ?? null
  const deviseEcheance = data.deviseEcheance || data.devise_echeance || null
  const modePaiement = data.modePaiement || data.mode_paiement
  const referencePaiement = data.referencePaiement || data.reference_paiement || null
  const tauxChange = data.tauxChange ?? data.taux_change ?? null
  const montantOriginal = data.montantOriginal ?? data.montant_original ?? null

  return cmd('create_paiement', {
    eleveId,
    eleve_id: eleveId,
    echeanceId,
    echeance_id: echeanceId,
    etablissementId,
    etablissement_id: etablissementId,
    anneeScolaireId,
    annee_scolaire_id: anneeScolaireId,
    userId,
    user_id: userId,
    motif,
    montant,
    devise,
    montantAffecte,
    montant_affecte: montantAffecte,
    deviseEcheance,
    devise_echeance: deviseEcheance,
    modePaiement,
    mode_paiement: modePaiement,
    referencePaiement,
    reference_paiement: referencePaiement,
    tauxChange,
    taux_change: tauxChange,
    montantOriginal,
    montant_original: montantOriginal,
  })
}

export async function annulerPaiement(id: string, userId: string, motif: string) {
  return cmd('annuler_paiement', { id, userId, user_id: userId, motif })
}

export async function updatePaiement(id: string, data: Record<string, any>) {
  const motif = data.motif
  const montant = Number(data.montant)
  const devise = data.devise || 'CDF'
  const modePaiement = data.modePaiement || data.mode_paiement
  const referencePaiement = data.referencePaiement || data.reference_paiement || null
  const tauxChange = data.tauxChange ?? data.taux_change ?? null
  const montantAffecte = data.montantAffecte ?? data.montant_affecte ?? null
  const deviseEcheance = data.deviseEcheance || data.devise_echeance || null

  return cmd('update_paiement', {
    id,
    motif,
    montant,
    devise,
    modePaiement,
    referencePaiement,
    tauxChange,
    montantAffecte,
    deviseEcheance,
  })
}

export async function getPaiement(id: string) {
  return cmd('get_paiement', { id })
}

// ── Dépenses ────────────────────────────────────────────────

export async function listDepenses(params: {
  etablissementId?: string; anneeScolaireId?: string; categorie?: string;
  statut?: string; dateFrom?: string; dateTo?: string;
} = {}) {
  return cmd('list_depenses', {
    etablissementId: params.etablissementId || null,
    anneeScolaireId: params.anneeScolaireId || null,
    categorie: params.categorie || null,
    statut: params.statut || null,
    dateFrom: params.dateFrom || null,
    dateTo: params.dateTo || null,
  })
}

export async function createDepense(data: Record<string, any>) {
  const etabId = data.etablissementId || data.etablissement_id
  const anneeId = data.anneeScolaireId || data.annee_scolaire_id || null
  const createdBy = data.createdById || data.created_by_id || data.userId || null
  const dateDepense = data.dateDepense || data.date_depense || new Date().toISOString().slice(0, 10)
  const refPiece = data.referencePiece || data.reference_piece || null
  const justif = data.justificatifUrl || data.justificatif_url || null

  return cmd('create_depense', {
    etablissementId: etabId,
    etablissement_id: etabId,
    anneeScolaireId: anneeId,
    annee_scolaire_id: anneeId,
    categorie: data.categorie,
    libelle: data.libelle,
    montant: Number(data.montant),
    devise: data.devise || 'BIF',
    beneficiaire: data.beneficiaire || null,
    dateDepense: dateDepense,
    date_depense: dateDepense,
    referencePiece: refPiece,
    reference_piece: refPiece,
    justificatifUrl: justif,
    justificatif_url: justif,
    createdById: createdBy,
    created_by_id: createdBy,
  })
}

export async function updateDepense(id: string, data: Record<string, any>) {
  return cmd('update_depense', {
    id,
    categorie: data.categorie,
    libelle: data.libelle,
    montant: data.montant,
    devise: data.devise,
    beneficiaire: data.beneficiaire || null,
    dateDepense: data.dateDepense,
    referencePiece: data.referencePiece || null,
    statut: data.statut,
  })
}

export async function deleteDepense(id: string) {
  return cmd('delete_depense', { id })
}

export async function getDepensesStats(etablissementId?: string, anneeScolaireId?: string) {
  return cmd('get_depenses_stats', { etablissementId: etablissementId || null, anneeScolaireId: anneeScolaireId || null })
}

// ── Paramètres ──────────────────────────────────────────────

export async function getParametres(etablissementId: string) {
  return cmd('get_parametres', { etablissementId })
}
export async function saveParametres(etablissementId: string, data: Record<string, any>) {
  return cmd('save_parametres', { etablissementId, ...data })
}

// ── Position du logo sur le reçu ─────────────────────────────

export async function getReceiptLogoPosition() {
  return cmd<{ position: string }>('get_receipt_logo_position', {})
}
export async function saveReceiptLogoPosition(position: string) {
  return cmd<{ position: string }>('save_receipt_logo_position', { position })
}

// ── Utilisateurs ─────────────────────────────────────────────

export async function listUtilisateurs(etablissementId?: string) {
  return cmd('list_utilisateurs', { etablissementId: etablissementId || null })
}
export async function createUtilisateur(data: Record<string, any>) {
  const etabId = data.etablissementId || data.etablissement_id || null
  const nomComp = data.nomComplet || data.nom_complet || data.username

  return cmd('create_utilisateur', {
    username: data.username,
    password: data.password,
    nomComplet: nomComp,
    nom_complet: nomComp,
    role: data.role || 'CAISSIER',
    etablissementId: etabId,
    etablissement_id: etabId,
  })
}
export async function updateUtilisateur(id: string, data: Record<string, any>) {
  return cmd('update_utilisateur', { id, ...data })
}
export async function deleteUtilisateur(id: string) {
  return cmd('delete_utilisateur', { id })
}

// ── Dashboard & Rapports ────────────────────────────────────

export async function getDashboardStats(etablissementId: string, anneeScolaireId: string) {
  return cmd('get_dashboard_stats', { etablissementId, anneeScolaireId })
}
export async function getRapportFinancier(etablissementId: string, anneeScolaireId: string) {
  return cmd('get_rapport_financier', { etablissementId, anneeScolaireId })
}
export async function getRapportEleves(etablissementId: string, anneeScolaireId: string) {
  return cmd('get_rapport_eleves', { etablissementId, anneeScolaireId })
}

export async function getRapportJournalier(etablissementId: string, date: string, anneeScolaireId?: string) {
  return cmd('get_rapport_journalier', {
    etablissementId,
    etablissement_id: etablissementId,
    anneeScolaireId: anneeScolaireId || null,
    annee_scolaire_id: anneeScolaireId || null,
    date,
  })
}

// ── Audit & Sync ────────────────────────────────────────────

export async function listAuditLogs(params: {
  userId?: string; action?: string; entite?: string; entiteId?: string; page?: number; pageSize?: number;
} = {}) {
  return cmd('list_audit_logs', {
    userId: params.userId || null, action: params.action || null, entite: params.entite || null,
    entiteId: params.entiteId || null, page: params.page || 1, pageSize: params.pageSize || 50,
  })
}
export async function syncStatus() { return cmd('sync_status') }
export async function validateSyncReady() { return cmd('validate_sync_ready') }
export async function syncPush() { return cmd('sync_push') }
export async function syncPull() { return cmd('sync_pull') }
export async function saveSyncConfig(supabaseUrl: string, supabaseKey: string) {
  return cmd('save_sync_config', { supabaseUrl, supabaseKey })
}