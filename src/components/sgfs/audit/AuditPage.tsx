'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore, canViewAudit } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Search, ShieldAlert, Activity, LogIn, Edit3, Trash2, Undo2, LogOut, Eye } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

// ── Types ───────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string
  created_at: string
  user_id?: string
  nom_complet?: string
  action: string
  entite: string
  entite_id?: string
  details?: string
}

interface Utilisateur {
  id: string
  nomComplet: string
  username: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const ACTION_MAP: Record<string, { label: string; className: string }> = {
  CREATE: { label: 'Création', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  UPDATE: { label: 'Modification', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  DELETE: { label: 'Suppression', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  LOGIN: { label: 'Connexion', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  LOGOUT: { label: 'Déconnexion', className: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400' },
  ANNULATION: { label: 'Annulation', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
}

const ENTITY_MAP: Record<string, string> = {
  ELEVE: 'Élèves',
  PAIEMENT: 'Paiements',
  FRAIS: 'Frais Scolaires',
  USER: 'Utilisateurs',
  DEPENSE: 'Dépenses',
  PARAMETRE: 'Paramètres',
}

const ACTION_ICONS: Record<string, any> = {
  CREATE: Activity,
  UPDATE: Edit3,
  DELETE: Trash2,
  LOGIN: LogIn,
  LOGOUT: LogOut,
  ANNULATION: Undo2,
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr)
  return (
    d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  )
}

function truncateText(text: string, maxLen: number = 60) {
  if (!text) return '—'
  const cleanText = text.replace(/\s+/g, ' ')
  if (cleanText.length <= maxLen) return cleanText
  return cleanText.substring(0, maxLen) + '...'
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
}

// ── Component ───────────────────────────────────────────────────────────────

export default function AuditPage() {
  const { user } = useAppStore()
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterUser, setFilterUser] = useState('all')
  const [filterAction, setFilterAction] = useState('all')
  const [filterEntite, setFilterEntite] = useState('all')
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalEntries, setTotalEntries] = useState(0)
  const pageSize = 20

  // ── Chargement des utilisateurs ──────────────────────────────────────────
  const fetchUtilisateurs = useCallback(async () => {
    try {
      const res = await tc.listUtilisateurs()
      // La réponse a la forme { success: true, data: [...] }
      const list = res?.data ?? []
      if (Array.isArray(list)) {
        // S'assurer que chaque objet a bien nomComplet (camelCase)
        const mapped: Utilisateur[] = list.map((u: any) => ({
          id: u.id,
          nomComplet: u.nomComplet || u.nom_complet || 'Sans nom',
          username: u.username || '',
        }))
        setUtilisateurs(mapped)
      } else {
        console.warn('Format inattendu pour listUtilisateurs', res)
        setUtilisateurs([])
      }
    } catch (err: any) {
      console.error('Erreur chargement utilisateurs', err)
      toast.error('Impossible de charger la liste des utilisateurs')
      setUtilisateurs([])
    }
  }, [])

  // ── Chargement du journal d'audit ───────────────────────────────────────
  const fetchAudit = useCallback(async () => {
    setLoading(true)
    try {
      const res = await tc.listAuditLogs({
        userId: filterUser !== 'all' ? filterUser : undefined,
        action: filterAction !== 'all' ? filterAction : undefined,
        entite: filterEntite !== 'all' ? filterEntite : undefined,
        page: currentPage,
        pageSize,
      })
      setAuditEntries(res?.auditLogs ?? [])
      setTotalPages(res?.totalPages ?? 1)
      setTotalEntries(res?.total ?? 0)
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors du chargement du journal d\'audit')
    } finally {
      setLoading(false)
    }
  }, [filterUser, filterAction, filterEntite, currentPage])

  useEffect(() => {
    if (!canViewAudit(user?.role || '')) return
    fetchUtilisateurs()
  }, [fetchUtilisateurs, user])

  useEffect(() => {
    if (!canViewAudit(user?.role || '')) return
    fetchAudit()
  }, [fetchAudit, user])

  // ── Access check ──
  if (user && !canViewAudit(user.role || '')) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[60vh] gap-4"
      >
        <ShieldAlert className="w-16 h-16 text-red-400" />
        <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-200">Accès réservé</h2>
        <p className="text-gray-500 dark:text-gray-400">Accès réservé au coordonnateur</p>
      </motion.div>
    )
  }

  // ── Stats ──

  const totalActions = totalEntries
  const connexions = auditEntries.filter((a) => a.action === 'LOGIN' || a.action === 'LOGOUT').length
  const modifications = auditEntries.filter((a) => a.action === 'UPDATE').length
  const annulations = auditEntries.filter((a) => a.action === 'ANNULATION').length

  function openDetail(entry: AuditEntry) {
    setSelectedEntry(entry)
    setDetailOpen(true)
  }

  // ── Render ──

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6 p-4 md:p-6">
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Journal d&apos;Audit</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Historique de toutes les actions effectuées dans le système</p>
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[var(--etab-color,#075e54)]">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-[var(--etab-color,#075e54)]/10"><Activity className="w-5 h-5 text-[var(--etab-color,#075e54)]" /></div>
            <div><p className="text-xs text-gray-500">Total actions</p><p className="text-lg font-bold">{totalActions}</p></div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-purple-500/10"><LogIn className="w-5 h-5 text-purple-500" /></div>
            <div><p className="text-xs text-gray-500">Connexions</p><p className="text-lg font-bold text-purple-600">{connexions}</p></div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/10"><Edit3 className="w-5 h-5 text-blue-500" /></div>
            <div><p className="text-xs text-gray-500">Modifications</p><p className="text-lg font-bold text-blue-600">{modifications}</p></div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-orange-500/10"><Undo2 className="w-5 h-5 text-orange-500" /></div>
            <div><p className="text-xs text-gray-500">Annulations</p><p className="text-lg font-bold text-orange-600">{annulations}</p></div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Rechercher dans l'historique..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="pl-9" />
        </div>
        <Select value={filterUser} onValueChange={(val) => { setFilterUser(val); setCurrentPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Tous les utilisateurs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les utilisateurs</SelectItem>
            {utilisateurs.length === 0 ? (
              <SelectItem value="__none" disabled>Chargement...</SelectItem>
            ) : (
              utilisateurs.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.nomComplet} {u.username ? `(@${u.username})` : ''}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Select value={filterAction} onValueChange={(val) => { setFilterAction(val); setCurrentPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Toutes actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes actions</SelectItem>
            <SelectItem value="CREATE">Création</SelectItem>
            <SelectItem value="UPDATE">Modification</SelectItem>
            <SelectItem value="DELETE">Suppression</SelectItem>
            <SelectItem value="LOGIN">Connexion</SelectItem>
            <SelectItem value="LOGOUT">Déconnexion</SelectItem>
            <SelectItem value="ANNULATION">Annulation</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEntite} onValueChange={(val) => { setFilterEntite(val); setCurrentPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Toutes entités" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes entités</SelectItem>
            {Object.entries(ENTITY_MAP).map(([key, label]) => (<SelectItem key={key} value={key}>{label}</SelectItem>))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex gap-4"><Skeleton className="h-8 w-1/5" /><Skeleton className="h-8 w-1/5" /><Skeleton className="h-8 w-1/6" /><Skeleton className="h-8 flex-1" /></div>
                ))}
              </div>
            ) : auditEntries.length === 0 ? (
              <div className="p-12 text-center text-gray-500"><Activity className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Aucune entrée d&apos;audit trouvée</p></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-gray-800/50">
                      <TableHead>Date / Heure</TableHead>
                      <TableHead>Utilisateur</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entité</TableHead>
                      <TableHead className="max-w-xs">Détails</TableHead>
                      <TableHead className="text-right">Voir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditEntries.map((entry) => {
                      const actionInfo = ACTION_MAP[entry.action] || { label: entry.action, className: 'bg-gray-100 text-gray-600' }
                      const ActionIcon = ACTION_ICONS[entry.action] || Activity
                      return (
                        <TableRow key={entry.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                          <TableCell className="text-xs whitespace-nowrap">{formatDateTime(entry.created_at)}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{entry.nom_complet || entry.user_id}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`${actionInfo.className} gap-1`}>
                              <ActionIcon className="w-3 h-3" />{actionInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{ENTITY_MAP[entry.entite] || entry.entite || '—'}</TableCell>
                          <TableCell className="text-xs text-gray-500 max-w-[250px] truncate">{truncateText(entry.details || '')}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => openDetail(entry)}
                              className="text-[var(--etab-color,#075e54)] hover:text-[var(--etab-color-hover,#064e46)] hover:bg-[var(--etab-color,#075e54)]/5">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {totalEntries > 0 && (
              <div className="flex items-center justify-between p-4 border-t">
                <p className="text-xs text-gray-500">
                  Affichage de <span className="font-semibold">{(currentPage - 1) * pageSize + 1}</span> à{' '}
                  <span className="font-semibold">{Math.min(currentPage * pageSize, totalEntries)}</span> sur{' '}
                  <span className="font-semibold">{totalEntries}</span> entrées
                </p>
                {totalPages > 1 && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Précédent</Button>
                    <span className="flex items-center px-3 text-xs">Page {currentPage} sur {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Suivant</Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--etab-color, #075e54)' }}>
              <Eye className="w-5 h-5" /> Détails de l&apos;entrée d&apos;audit
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-xs text-gray-500">Date / Heure</Label><p className="text-sm font-medium mt-1">{formatDateTime(selectedEntry.created_at)}</p></div>
                <div><Label className="text-xs text-gray-500">Utilisateur</Label><p className="text-sm font-medium mt-1">{selectedEntry.nom_complet || 'N/A'}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-xs text-gray-500">Action</Label><div className="mt-1"><Badge variant="secondary" className={(ACTION_MAP[selectedEntry.action] || {}).className || 'bg-gray-100'}>{ACTION_MAP[selectedEntry.action]?.label || selectedEntry.action}</Badge></div></div>
                <div><Label className="text-xs text-gray-500">Entité</Label><p className="text-sm font-medium mt-1">{ENTITY_MAP[selectedEntry.entite] || selectedEntry.entite || 'N/A'}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-xs text-gray-500">ID Entité</Label><p className="text-sm font-mono mt-1 text-gray-500">{selectedEntry.entite_id || 'N/A'}</p></div>
              </div>
              {selectedEntry.details && (
                <div>
                  <Label className="text-xs text-gray-500">Détails</Label>
                  <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm font-mono break-all max-h-48 overflow-y-auto whitespace-pre-wrap">{selectedEntry.details}</div>
                </div>
              )}
              <div className="flex justify-end pt-2"><Button variant="outline" onClick={() => setDetailOpen(false)}>Fermer</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}