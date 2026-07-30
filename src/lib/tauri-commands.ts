import { invoke } from '@tauri-apps/api/core'

// ── Helper ──────────────────────────────────────────────────

/** Unwrap Tauri invoke result — throws on { success: false } */
function unwrap<T>(res: any): T {
  if (res && res.success === false) {
    throw new Error(res.error || 'Erreur inconnue')
  }
  return res as T
}

/** Invoke a Tauri command without any key conversion */
async function cmd<T = any>(command: string, params: Record<string, any> = {}): Promise<T> {
  return unwrap<T>(await invoke(command, params))
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
  return cmd('create_etablissement', data)
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
  return cmd('list_annees_scolaires', { etablissementId: etablissementId || null })
}
export async function createAnneeScolaire(data: Record<string, any>) {
  return cmd('create_annee_scolaire', data)
}
export async function updateAnneeScolaire(id: string, data: Record<string, any>) {
  return cmd('update_annee_scolaire', { id, ...data })
}
export async function deleteAnneeScolaire(id: string) {
  return cmd('delete_annee_scolaire', { id })
}
export async function activerAnneeScolaire(id: string) {
  return cmd('activer_annee_scolaire', { id })
}

// ── Classes ─────────────────────────────────────────────────

export async function listClasses(etablissementId?: string, anneeScolaireId?: string) {
  return cmd('list_classes', { etablissementId: etablissementId || null, anneeScolaireId: anneeScolaireId || null })
}
export async function getClasse(id: string) {
  return cmd('get_classe', { id })
}
export async function createClasse(data: Record<string, any>) {
  return cmd('create_classe', data)
}
export async function updateClasse(id: string, data: Record<string, any>) {
  return cmd('update_classe', { id, ...data })
}
export async function deleteClasse(id: string) {
  return cmd('delete_classe', { id })
}

// ── Élèves ──────────────────────────────────────────────────

export async function listEleves(params: {
  etablissementId?: string; anneeScolaireId?: string; classeId?: string;
  statut?: string; search?: string; page?: number; pageSize?: number; // ✅ CORRIGÉ : pageSize
} = {}) {
  return cmd('list_eleves', {
    etablissementId: params.etablissementId || null,
    anneeScolaireId: params.anneeScolaireId || null,
    classeId: params.classeId || null,
    statut: params.statut || null,
    search: params.search || null,
    page: params.page || 1,
    pageSize: params.pageSize || 20, // ✅ CORRIGÉ : pageSize
  })
}

export async function getEleve(id: string) {
  return cmd('get_eleve', { id })
}

export async function createEleve(data: Record<string, any>) {
  return cmd('create_eleve', { data })          
}

export async function updateEleve(id: string, data: Record<string, any>) {
  return cmd('update_eleve', { id, data })      
}

export async function deleteEleve(id: string) {
  return cmd('delete_eleve', { id })
}

export async function getEleveStats(etablissementId?: string, anneeScolaireId?: string) {
  return cmd('get_eleve_stats', { etablissementId: etablissementId || null, anneeScolaireId: anneeScolaireId || null })
}

// ── Frais Scolaires ─────────────────────────────────────────

export async function listFrais(etablissementId?: string, anneeScolaireId?: string, actif?: boolean) {
  return cmd('list_frais', { etablissementId: etablissementId || null, anneeScolaireId: anneeScolaireId || null, actif: actif ?? null })
}
export async function createFrais(data: Record<string, any>) {
  return cmd('create_frais', data)
}
export async function updateFrais(id: string, data: Record<string, any>) {
  return cmd('update_frais', { id, ...data })
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
  search?: string;       // ✅ NOUVEAU
    modePaiement?: string; // ✅ NOUVEAU
  } = {}) {
    return cmd('list_paiements', {
      etablissementId: params.etablissementId || null,
      anneeScolaireId: params.anneeScolaireId || null,
      eleveId: params.eleveId || null,
      annule: params.annule ?? null,
      dateFrom: params.dateFrom || null,
      dateTo: params.dateTo || null,
      search: params.search || null,       // ✅ NOUVEAU
      modePaiement: params.modePaiement || null, // ✅ NOUVEAU
      page: params.page || 1,
      pageSize: params.pageSize || 20,
    })
  }
  // ... (gardez le reste de vos fonctions paiements tel quel)
export async function createPaiement(data: Record<string, any>) {
  return cmd('create_paiement', data)
}
export async function annulerPaiement(id: string, userId: string, motif: string) {
  return cmd('annuler_paiement', { id, userId, motif })
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
  return cmd('create_depense', {
    etablissementId: data.etablissementId,
    anneeScolaireId: data.anneeScolaireId || undefined,   // optionnel
    categorie: data.categorie,
    libelle: data.libelle,
    montant: data.montant,
    devise: data.devise || 'BIF',
    beneficiaire: data.beneficiaire || null,
    dateDepense: data.dateDepense,
    referencePiece: data.referencePiece || null,
    justificatifUrl: data.justificatifUrl || null,
    createdById: data.createdById || null,
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

// ── Utilisateurs ─────────────────────────────────────────────

export async function listUtilisateurs(etablissementId?: string) {
  return cmd('list_utilisateurs', { etablissementId: etablissementId || null })
}
export async function createUtilisateur(data: Record<string, any>) {
  return cmd('create_utilisateur', data)
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
export async function syncPush() { return cmd('sync_push') }
export async function syncPull() { return cmd('sync_pull') }
export async function saveSyncConfig(supabaseUrl: string, supabaseKey: string) {
  return cmd('save_sync_config', { supabaseUrl, supabaseKey })
}