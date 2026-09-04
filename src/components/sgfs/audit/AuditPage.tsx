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
import { Search, ShieldAlert, Activity, LogIn, Edit3, Trash2, Undo2, LogOut, Eye, Shield, ChevronLeft, ChevronRight } from 'lucide-react'
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
  CREATE: { label: 'Création', className: 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold' },
  UPDATE: { label: 'Modification', className: 'bg-sky-100 text-sky-800 border border-sky-200 font-semibold' },
  DELETE: { label: 'Suppression', className: 'bg-rose-100 text-rose-800 border border-rose-200 font-semibold' },
  LOGIN: { label: 'Connexion', className: 'bg-purple-100 text-purple-800 border border-purple-200 font-semibold' },
  LOGOUT: { label: 'Déconnexion', className: 'bg-stone-100 text-stone-700 border border-stone-200 font-semibold' },
  ANNULATION: { label: 'Annulation', className: 'bg-amber-100 text-amber-800 border border-amber-200 font-semibold' },
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

  const fetchUtilisateurs = useCallback(async () => {
    try {
      const res = await tc.listUtilisateurs()
      const list = res?.data ?? []
      if (Array.isArray(list)) {
        const mapped: Utilisateur[] = list.map((u: any) => ({
          id: u.id,
          nomComplet: u.nomComplet || u.nom_complet || 'Sans nom',
          username: u.username || '',
        }))
        setUtilisateurs(mapped)
      } else {
        setUtilisateurs([])
      }
    } catch (err: any) {
      console.error('Erreur chargement utilisateurs', err)
      setUtilisateurs([])
    }
  }, [])

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

  if (user && !canViewAudit(user.role || '')) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[60vh] gap-4"
      >
        <ShieldAlert className="w-16 h-16 text-rose-500" />
        <h2 className="text-2xl font-bold text-stone-800">Accès réservé</h2>
        <p className="text-stone-500">Le journal d&apos;audit est réservé au coordonnateur ou à l&apos;administrateur.</p>
      </motion.div>
    )
  }

  const totalActions = totalEntries
  const connexions = auditEntries.filter((a) => a.action === 'LOGIN' || a.action === 'LOGOUT').length
  const modifications = auditEntries.filter((a) => a.action === 'UPDATE').length
  const annulations = auditEntries.filter((a) => a.action === 'ANNULATION').length

  function openDetail(entry: AuditEntry) {
    setSelectedEntry(entry)
    setDetailOpen(true)
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6 p-2 sm:p-4 md:p-6">
      {/* Banner Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 text-xs font-bold border border-amber-500/20 mb-2">
            <Shield className="h-3.5 w-3.5" /> Sécurité & Traçabilité
          </div>
          <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight">Journal d&apos;Audit Système</h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">Historique chronologique de toutes les opérations et connexions utilisateur.</p>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-[#0c241f]">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#0c241f]/10 text-[#0c241f]"><Activity className="w-5 h-5" /></div>
            <div><p className="text-xs font-semibold text-stone-500">Total Actions</p><p className="text-xl font-extrabold text-stone-900">{totalActions}</p></div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-purple-600">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-600"><LogIn className="w-5 h-5" /></div>
            <div><p className="text-xs font-semibold text-stone-500">Connexions</p><p className="text-xl font-extrabold text-stone-900">{connexions}</p></div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-sky-600">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-sky-500/10 text-sky-600"><Edit3 className="w-5 h-5" /></div>
            <div><p className="text-xs font-semibold text-stone-500">Modifications</p><p className="text-xl font-extrabold text-stone-900">{modifications}</p></div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600"><Undo2 className="w-5 h-5" /></div>
            <div><p className="text-xs font-semibold text-stone-500">Annulations</p><p className="text-xl font-extrabold text-stone-900">{annulations}</p></div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <Input placeholder="Rechercher dans l'historique d'audit..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="pl-9 rounded-xl border-stone-200 font-medium" />
        </div>
        <Select value={filterUser} onValueChange={(val) => { setFilterUser(val); setCurrentPage(1); }}>
          <SelectTrigger className="w-full sm:w-52 rounded-xl border-stone-200 font-medium"><SelectValue placeholder="Tous les utilisateurs" /></SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">Tous les utilisateurs</SelectItem>
            {utilisateurs.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.nomComplet} {u.username ? `(@${u.username})` : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAction} onValueChange={(val) => { setFilterAction(val); setCurrentPage(1); }}>
          <SelectTrigger className="w-full sm:w-40 rounded-xl border-stone-200 font-medium"><SelectValue placeholder="Toutes actions" /></SelectTrigger>
          <SelectContent className="rounded-xl">
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
          <SelectTrigger className="w-full sm:w-40 rounded-xl border-stone-200 font-medium"><SelectValue placeholder="Toutes entités" /></SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">Toutes entités</SelectItem>
            {Object.entries(ENTITY_MAP).map(([key, label]) => (<SelectItem key={key} value={key}>{label}</SelectItem>))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-xl" />
                ))}
              </div>
            ) : auditEntries.length === 0 ? (
              <div className="p-12 text-center text-stone-400"><Activity className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-bold text-stone-700">Aucune entrée d&apos;audit trouvée.</p></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-[#0c241f] text-white">
                    <TableRow className="hover:bg-[#0c241f]">
                      <TableHead className="text-amber-300 font-bold">Date & Heure</TableHead>
                      <TableHead className="text-white font-bold">Utilisateur</TableHead>
                      <TableHead className="text-white font-bold">Action</TableHead>
                      <TableHead className="text-white font-bold">Entité</TableHead>
                      <TableHead className="text-white font-bold">Détails</TableHead>
                      <TableHead className="text-right text-white font-bold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditEntries.map((entry) => {
                      const actionInfo = ACTION_MAP[entry.action] || { label: entry.action, className: 'bg-stone-100 text-stone-700' }
                      const ActionIcon = ACTION_ICONS[entry.action] || Activity
                      return (
                        <TableRow key={entry.id} className="hover:bg-amber-500/5 transition-colors">
                          <TableCell className="text-xs font-semibold text-stone-600 whitespace-nowrap">{formatDateTime(entry.created_at)}</TableCell>
                          <TableCell className="font-bold text-stone-900 break-words">{entry.nom_complet || entry.user_id}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`${actionInfo.className} gap-1`}>
                              <ActionIcon className="w-3 h-3" />{actionInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-semibold text-stone-800">{ENTITY_MAP[entry.entite] || entry.entite || '—'}</TableCell>
                          <TableCell className="text-xs text-stone-600 font-medium break-words max-w-[280px]">{entry.details || '—'}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => openDetail(entry)}
                              className="h-8 w-8 text-[#0c241f] hover:bg-stone-100" title="Voir les détails">
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
              <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-stone-100 bg-stone-50/50 text-xs font-semibold text-stone-600 gap-3">
                <p>
                  Affichage de <b>{(currentPage - 1) * pageSize + 1}</b> à <b>{Math.min(currentPage * pageSize, totalEntries)}</b> sur <b>{totalEntries}</b> entrées
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="rounded-xl border-stone-200" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="w-3.5 h-3.5 mr-1" />Précédent</Button>
                    <span>Page {currentPage} / {totalPages}</span>
                    <Button variant="outline" size="sm" className="rounded-xl border-stone-200" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Suivant<ChevronRight className="w-3.5 h-3.5 ml-1" /></Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xl">
          <DialogHeader className="border-b border-stone-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-[#0c241f] text-amber-400">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-extrabold text-[#0c241f]">Détails de l&apos;entrée d&apos;audit</DialogTitle>
                <p className="text-xs text-stone-500 font-medium">Trace d&apos;exécution système.</p>
              </div>
            </div>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-100">
                <div><Label className="text-[11px] text-stone-500 font-bold uppercase">Date & Heure</Label><p className="text-xs font-bold text-stone-900 mt-1">{formatDateTime(selectedEntry.created_at)}</p></div>
                <div><Label className="text-[11px] text-stone-500 font-bold uppercase">Utilisateur</Label><p className="text-xs font-bold text-stone-900 mt-1 break-words">{selectedEntry.nom_complet || 'Système'}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-100">
                <div><Label className="text-[11px] text-stone-500 font-bold uppercase">Action</Label><div className="mt-1"><Badge variant="secondary" className={(ACTION_MAP[selectedEntry.action] || {}).className || 'bg-stone-100'}>{ACTION_MAP[selectedEntry.action]?.label || selectedEntry.action}</Badge></div></div>
                <div><Label className="text-[11px] text-stone-500 font-bold uppercase">Entité Concernée</Label><p className="text-xs font-bold text-stone-900 mt-1">{ENTITY_MAP[selectedEntry.entite] || selectedEntry.entite || 'N/A'}</p></div>
              </div>
              {selectedEntry.details && (
                <div>
                  <Label className="text-xs font-semibold text-stone-600">Détails de l&apos;opération</Label>
                  <div className="mt-1 p-4 bg-stone-50 rounded-2xl border border-stone-200 text-xs font-mono font-semibold text-stone-800 break-all max-h-48 overflow-y-auto whitespace-pre-wrap">{selectedEntry.details}</div>
                </div>
              )}
              <div className="flex justify-end pt-2 border-t border-stone-100"><Button variant="outline" className="rounded-xl border-stone-200 font-semibold" onClick={() => setDetailOpen(false)}>Fermer</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}