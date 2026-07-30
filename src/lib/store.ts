import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PageName =
  | 'dashboard'
  | 'etablissements'
  | 'classes'
  | 'eleves'
  | 'frais'
  | 'echeances'
  | 'encaissements'
  | 'depenses'
  | 'rapports'
  | 'audit'
  | 'parametres'
  | 'utilisateurs'

export interface UserInfo {
  id: string
  username: string
  nomComplet: string
  role: string
  etablissementId: string | null
}

// ── Etablissement type helpers ─────────────────────────────────────────────

export const ETAB_TYPES = ['MATERNELLE', 'PRIMAIRE', 'SECONDAIRE', 'COMPLEXE'] as const
export type EtabType = (typeof ETAB_TYPES)[number]

export function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    MATERNELLE: 'Maternelle',
    PRIMAIRE: 'Primaire',
    SECONDAIRE: 'Secondaire',
    COMPLEXE: 'Complexe',
  }
  return labels[type] || type
}

export function getTypeBadgeClass(type: string): string {
  const map: Record<string, string> = {
    MATERNELLE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    PRIMAIRE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    SECONDAIRE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    COMPLEXE: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  }
  return map[type] || 'bg-gray-100 text-gray-600'
}

export function getTypeIcon(type: string): string {
  const map: Record<string, string> = {
    MATERNELLE: '🧒',
    PRIMAIRE: '📚',
    SECONDAIRE: '🎓',
    COMPLEXE: '🏫',
  }
  return map[type] || '🏢'
}

// ── Etablissement context stored in Zustand ─────────────────────────────────

export interface EtablissementContext {
  id: string
  nom: string
  type: string
  adresse?: string | null
  telephone?: string | null
  email?: string | null
  couleurPrincipale: string
  devise: string
  logoUrl?: string | null
  rccm?: string | null
  idNat?: string | null
}

export interface EtabParams {
  mentionsLegales?: string | null
  piedPageRecu?: string | null
  nomImprimante?: string | null
  tauxChangeUSD_BIF?: number | null
  anneeScolaireId?: string | null
}

interface AppState {
  // Auth
  user: UserInfo | null
  token: string | null
  isAuthenticated: boolean
  login: (user: UserInfo, token: string) => void
  logout: () => void

  // Navigation
  currentPage: PageName
  setPage: (page: PageName) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void

  // Current établissement context (populated after login)
  currentEtablissement: EtablissementContext | null
  setCurrentEtablissement: (etab: EtablissementContext | null) => void
  etabParams: EtabParams | null
  setEtabParams: (params: EtabParams | null) => void
}

export const DEFAULT_COLOR = '#0f0e50f1'

// ── Color helper: darken a hex color ──────────────────────────────────────

export function darkenHex(hex: string, amount = 0.12): string {
  try {
    const clean = hex.replace('#', '')
    if (clean.length !== 6) return DEFAULT_COLOR
    const r = Math.max(0, Math.round(parseInt(clean.slice(0, 2), 16) * (1 - amount)))
    const g = Math.max(0, Math.round(parseInt(clean.slice(2, 4), 16) * (1 - amount)))
    const b = Math.max(0, Math.round(parseInt(clean.slice(4, 6), 16) * (1 - amount)))
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  } catch {
    return DEFAULT_COLOR
  }
}

// ── Shared combo handler: updates store when user picks a different school ─

export function onEtabSelect(etabId: string, ecoles: Array<{ id: string; nom: string; type?: string; couleurPrincipale?: string; devise?: string; adresse?: string | null; telephone?: string | null; email?: string | null; logoUrl?: string | null; rccm?: string | null; idNat?: string | null }>) {
  const etab = ecoles.find((e) => e.id === etabId)
  if (!etab) return
  useAppStore.getState().setCurrentEtablissement({
    id: etab.id,
    nom: etab.nom,
    type: etab.type || 'PRIMAIRE',
    couleurPrincipale: etab.couleurPrincipale || DEFAULT_COLOR,
    devise: etab.devise || 'BIF',
    adresse: etab.adresse ?? null,
    telephone: etab.telephone ?? null,
    email: etab.email ?? null,
    logoUrl: etab.logoUrl ?? null,
    rccm: etab.rccm ?? null,
    idNat: etab.idNat ?? null,
  })
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) => set({ user, token, isAuthenticated: true }),
      logout: () => set({
        user: null,
        token: null,
        isAuthenticated: false,
        currentEtablissement: null,
        etabParams: null,
      }),

      // Navigation
      currentPage: 'dashboard',
      setPage: (page) => set({ currentPage: page }),
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      // Etablissement context
      currentEtablissement: null,
      setCurrentEtablissement: (etab) => set({ currentEtablissement: etab }),
      etabParams: null,
      setEtabParams: (params) => set({ etabParams: params }),
    }),
    {
      name: 'sgfs-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

export function isCoordinateur(role: string | null | undefined): boolean {
  if (!role) return true
  const r = role.toUpperCase()
  return r === 'COORDINATEUR' || r === 'ADMIN' || r === 'SUPERADMIN' || r === 'ADMINISTRATEUR' || r === 'COORD'
}

// Helper: check permissions
export function canManageFees(role: string): boolean {
  return isCoordinateur(role)
}

export function canViewAllSchools(role: string): boolean {
  return isCoordinateur(role)
}

export function canManageUsers(role: string): boolean {
  return isCoordinateur(role)
}

export function canViewAudit(role: string): boolean {
  return isCoordinateur(role)
}

export function canManageSettings(role: string): boolean {
  return isCoordinateur(role)
}

export function canManageEtablissements(role: string): boolean {
  return isCoordinateur(role)
}

export function canManageClasses(role: string): boolean {
  return isCoordinateur(role)
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    COORDINATEUR: 'Coordonnateur',
    SECRETAIRE_MATERNELLE: 'Secr. Maternelle',
    SECRETAIRE_PRIMAIRE: 'Secr. Primaire',
    SECRETAIRE_SECONDAIRE: 'Secr. Secondaire',
  }
  return labels[role] || role
}

export function getSchoolFilter(role: string, etablissementId: string | null): string | null {
  if (role === 'COORDINATEUR') return null // all schools
  return etablissementId
}

export function getStoredAuthToken(): string | null {
  const storeState = useAppStore.getState()
  if (storeState.token) return storeState.token

  if (typeof window !== 'undefined') {
    try {
      const storage = window.localStorage.getItem('sgfs-storage')
      if (storage) {
        const parsed = JSON.parse(storage)
        return parsed?.state?.token || parsed?.token || null
      }
    } catch {}
  }

  return null
}

// ── API helpers ──────────────────────────────────────────────────────
// In Tauri desktop mode, apiFetch automatically routes to invoke() commands.
// In web dev mode, it uses standard fetch().

/** Detect if running inside Tauri webview */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** Parse URL query string into Record<string, string> */
function parseQuery(url: string): Record<string, string> {
  const q = url.includes('?') ? url.split('?')[1] : ''
  const params: Record<string, string> = {}
  if (!q) return params
  for (const pair of q.split('&')) {
    const [k, v] = pair.split('=')
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '')
  }
  return params
}

/** Extract :id from path like /api/eleves/abc123 → ['eleves', 'abc123'] */
function parsePath(path: string): string[] {
  return path.replace(/^\/api\//, '').split('/')
}

// Lazy-imported Tauri command functions (only loaded when in Tauri)
let _tc: any = null
async function getTC() {
  if (!_tc) _tc = await import('@/lib/tauri-commands')
  return _tc
}

/**
 * Universal API helper.
 * - In Tauri: routes to invoke() commands automatically
 * - In web: uses standard fetch() with auth headers
 */
export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!isTauri()) {
    const token = getStoredAuthToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(path, { ...options, headers })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erreur serveur' }))
      throw new Error(err.error || `Erreur ${res.status}`)
    }
    return res.json()
  }

  const tc = await getTC()
  const method = (options.method || 'GET').toUpperCase()
  const body = options.body ? JSON.parse(options.body as string) : null
  const qp = parseQuery(path)
  const segments = parsePath(path)
  const resource = segments[0] || ''
  const resourceId = segments[1] || null
  const subAction = segments[2] || null

  try {
    // ── Établissements ──
    if (resource === 'etablissements') {
      if (subAction === 'context') return tc.getEtablissementContext(qp.etablissementId || qp.etablissementid)
      if (method === 'GET' && !resourceId) return tc.listEtablissements(qp.id || qp.etabid || null)
      if (method === 'GET' && resourceId) return tc.getEtablissement(resourceId)
      if (method === 'POST') return tc.createEtablissement(body)
      if (method === 'PUT' && resourceId) return tc.updateEtablissement(resourceId, body)
      if (method === 'DELETE' && resourceId) return tc.deleteEtablissement(resourceId)
    }

    // ── Années Scolaires ──
    if (resource === 'annees-scolaires') {
      if (subAction === 'activer' && resourceId) return tc.activerAnneeScolaire(resourceId)
      if (method === 'GET' && !resourceId) return tc.listAnneesScolaires(qp.etablissementId || qp.etabid || null)
      if (method === 'POST') return tc.createAnneeScolaire(body)
      if (method === 'PUT' && resourceId) return tc.updateAnneeScolaire(resourceId, body)
      if (method === 'DELETE' && resourceId) return tc.deleteAnneeScolaire(resourceId)
    }

    // ── Classes ──
    if (resource === 'classes') {
      if (method === 'GET' && !resourceId) return tc.listClasses(qp.etablissementId || qp.etabid || null, qp.anneeScolaireId || qp.anneeid || null)
      if (method === 'GET' && resourceId) return tc.getClasse(resourceId)
      if (method === 'POST') return tc.createClasse(body)
      if (method === 'PUT' && resourceId) return tc.updateClasse(resourceId, body)
      if (method === 'DELETE' && resourceId) return tc.deleteClasse(resourceId)
    }

    // ── Élèves ──
    if (resource === 'eleves') {
      if (subAction === 'promouvoir' || subAction === 'promouvoir-groupe') throw new Error('Promotion non disponible en mode desktop')
      if (resourceId === 'stats') return tc.getEleveStats(qp.etablissementId || qp.etabid || null, qp.anneeScolaireId || qp.anneeid || null)
      if (method === 'GET' && !resourceId) {
        return tc.listEleves({
          etablissementId: qp.etablissementId || qp.etabid || undefined,
          anneeScolaireId: qp.anneeScolaireId || qp.anneeid || undefined,
          classeId: qp.classeId || qp.classeid || undefined,
          statut: qp.statut || undefined,
          search: qp.search || undefined,
          page: qp.page ? parseInt(qp.page) : undefined,
          pageSize: qp.pageSize || qp.pagesize ? parseInt(qp.pageSize || qp.pagesize) : undefined,
        })
      }
      if (method === 'GET' && resourceId) return tc.getEleve(resourceId)
      if (method === 'POST') return tc.createEleve(body)
      if (method === 'PUT' && resourceId) return tc.updateEleve(resourceId, body)
      if (method === 'DELETE' && resourceId) return tc.deleteEleve(resourceId)
    }

    // ── Frais ──
    if (resource === 'frais') {
      if (method === 'GET' && !resourceId) return tc.listFrais(qp.etablissementId || qp.etabid || null, qp.anneeScolaireId || qp.anneeid || null, qp.actif ? qp.actif === 'true' : undefined)
      if (method === 'POST') return tc.createFrais(body)
      if (method === 'PUT' && resourceId) return tc.updateFrais(resourceId, body)
      if (method === 'DELETE' && resourceId) return tc.deleteFrais(resourceId)
    }

    // ── Échéances ──
    if (resource === 'echeances') {
      if (method === 'GET' && !resourceId) return tc.listEcheances({ eleveId: qp.eleveId || qp.eleveid, etablissementId: qp.etablissementId || qp.etabid, anneeScolaireId: qp.anneeScolaireId || qp.anneeid, statut: qp.statut })
      if (method === 'POST' && !resourceId) return tc.createEcheancesBulk(body.fraisScolaireId, body.anneeScolaireId, body.eleveIds)
      if (method === 'PUT' && resourceId) return tc.updateEcheance(resourceId, body)
      if (method === 'DELETE' && resourceId) return tc.deleteEcheance(resourceId)
    }

    // ── Encaissements ──
    if (resource === 'encaissements') {
      if (subAction === 'annuler' && resourceId) return tc.annulerPaiement(resourceId, body.userId, body.motif)
      if (method === 'GET' && !resourceId) {
        return tc.listPaiements({
          etablissementId: qp.etablissementId || qp.etabid || undefined,
          anneeScolaireId: qp.anneeScolaireId || qp.anneeid || undefined,
          eleveId: qp.eleveId || qp.eleveid || undefined,
          annule: qp.annule ? qp.annule === 'true' : undefined,
          dateFrom: qp.dateFrom || qp.datefrom || undefined,
          dateTo: qp.dateTo || qp.dateto || undefined,
          page: qp.page ? parseInt(qp.page) : undefined,
          pageSize: qp.pageSize || qp.pagesize ? parseInt(qp.pageSize || qp.pagesize) : undefined,
        })
      }
      if (method === 'GET' && resourceId) return tc.getPaiement(resourceId)
      if (method === 'POST') return tc.createPaiement(body)
    }

    // ── Dépenses ──
    if (resource === 'depenses') {
      if (resourceId === 'stats') return tc.getDepensesStats(qp.etablissementId || qp.etabid || null, qp.anneeScolaireId || qp.anneeid || null)
      if (method === 'GET' && !resourceId) {
        return tc.listDepenses({
          etablissementId: qp.etablissementId || qp.etabid || undefined,
          anneeScolaireId: qp.anneeScolaireId || qp.anneeid || undefined,
          categorie: qp.categorie || undefined,
          statut: qp.statut || undefined,
          dateFrom: qp.dateFrom || qp.datefrom || undefined,
          dateTo: qp.dateTo || qp.dateto || undefined,
        })
      }
      if (method === 'POST') return tc.createDepense(body)
      if (method === 'PUT' && resourceId) return tc.updateDepense(resourceId, body)
      if (method === 'DELETE' && resourceId) return tc.deleteDepense(resourceId)
    }

    // ── Paramètres ──
    if (resource === 'parametres') {
      if (method === 'GET') return tc.getParametres(qp.etablissementId || qp.etabid || '')
      if (method === 'PUT' || method === 'POST') return tc.saveParametres(qp.etablissementId || qp.etabid || body?.etablissementId || '', body)
    }

    // ── Utilisateurs ──
    if (resource === 'utilisateurs') {
      if (method === 'GET') return tc.listUtilisateurs(qp.etablissementId || qp.etabid || null)
      if (method === 'POST') return tc.createUtilisateur(body)
      if (method === 'PUT' && resourceId) return tc.updateUtilisateur(resourceId, body)
      if (method === 'DELETE') return tc.deleteUtilisateur(resourceId)
    }

    // ── Dashboard ──
    if (resource === 'dashboard') {
      return tc.getDashboardStats(qp.etablissementId || qp.etabid || '', qp.anneeScolaireId || qp.anneeid || '')
    }

    // ── Rapports ──
    if (resource === 'rapports') {
      if (qp.type === 'financier') return tc.getRapportFinancier(qp.etablissementId || qp.etabid || '', qp.anneeScolaireId || qp.anneeid || '')
      return tc.getRapportEleves(qp.etablissementId || qp.etabid || '', qp.anneeScolaireId || qp.anneeid || '')
    }

    // ── Audit ──
    if (resource === 'audit') {
      return tc.listAuditLogs({
        userId: qp.userId || qp.userid || undefined,
        action: qp.action || undefined,
        entite: qp.entite || undefined,
        entiteId: qp.entiteId || qp.entiteid || undefined,
        page: qp.page ? parseInt(qp.page) : undefined,
        pageSize: qp.pageSize || qp.pagesize ? parseInt(qp.pageSize || qp.pagesize) : undefined,
      })
    }

    // ── Auth ──
    if (resource === 'auth') {
      if (subAction === 'login') return tc.login(body.username, body.password)
      if (subAction === 'me') {
        const token = getStoredAuthToken()
        return tc.getMe(token || '')
      }
    }

    console.warn(`[apiFetch] Unhandled Tauri route: ${method} ${path}`)
    return {} as T
  } catch (err: any) {
    throw new Error(err?.message || 'Erreur Tauri')
  }
}