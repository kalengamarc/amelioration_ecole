'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAppStore, canManageUsers, getRoleLabel, getTypeIcon } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Plus, Users, UserCheck, Shield, Edit, Trash2, Power, ShieldAlert,
  Eye, Search, Filter, Clock, CalendarDays, Building2, Key, Lock, UserCog, Sparkles, CheckCircle2
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────────────────

interface User {
  id: string
  username: string
  nomComplet: string
  role: string
  etablissementId: string | null
  actif: boolean
  dernierLogin: string | null
  createdAt: string
  updatedAt: string
  etablissementNom?: string | null
}

interface Etablissement {
  id: string
  nom: string
  type?: string
}

interface UserForm {
  nomComplet: string
  username: string
  password: string
  role: string
  etablissementId: string
}

// ── Animation Variants ──────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const emptyForm: UserForm = {
  nomComplet: '',
  username: '',
  password: '',
  role: '',
  etablissementId: '',
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatDateTime(dateStr?: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getRoleBadgeClass(role: string): string {
  if (role === 'COORDINATEUR' || role === 'ADMIN' || role === 'SUPERADMIN') {
    return 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold'
  }
  return 'bg-amber-100 text-amber-900 border border-amber-200 font-semibold'
}

function getInitials(nomComplet: string, username?: string): string {
  const name = nomComplet || username || 'Admin'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

function getRolePermissions(role: string): { icon: typeof Shield; label: string; desc: string }[] {
  switch (role) {
    case 'COORDINATEUR':
      return [
        { icon: Building2, label: 'Tous les établissements', desc: 'Accès complet à tous les établissements du système' },
        { icon: Users, label: 'Gestion des utilisateurs', desc: 'Création, modification et désactivation des comptes' },
        { icon: Key, label: 'Gestion des frais', desc: 'Configuration des frais scolaires et échéances' },
        { icon: Shield, label: 'Paramètres système', desc: 'Configuration globale et paramètres avancés' },
        { icon: Eye, label: 'Rapports & Audit', desc: 'Accès à tous les rapports et journaux d\'audit' },
        { icon: Lock, label: 'Gestion des classes', desc: 'Création et gestion de toutes les classes' },
      ]
    case 'SECRETAIRE_MATERNELLE':
      return [
        { icon: Building2, label: 'Établissement maternelle', desc: 'Accès limité aux écoles maternelles et complexes' },
        { icon: Users, label: 'Gestion des élèves', desc: 'Inscription et suivi des élèves maternelles' },
        { icon: Key, label: 'Encaissements', desc: 'Gestion des paiements et reçus' },
        { icon: Eye, label: 'Rapports locaux', desc: 'Rapports limités à l\'établissement assigné' },
      ]
    case 'SECRETAIRE_PRIMAIRE':
      return [
        { icon: Building2, label: 'Établissement primaire', desc: 'Accès limité aux écoles primaires et complexes' },
        { icon: Users, label: 'Gestion des élèves', desc: 'Inscription et suivi des élèves primaires' },
        { icon: Key, label: 'Encaissements', desc: 'Gestion des paiements et reçus' },
        { icon: Eye, label: 'Rapports locaux', desc: 'Rapports limités à l\'établissement assigné' },
      ]
    case 'SECRETAIRE_SECONDAIRE':
      return [
        { icon: Building2, label: 'Établissement secondaire', desc: 'Accès limité aux écoles secondaires et complexes' },
        { icon: Users, label: 'Gestion des élèves', desc: 'Inscription et suivi des élèves secondaires' },
        { icon: Key, label: 'Encaissements', desc: 'Gestion des paiements et reçus' },
        { icon: Eye, label: 'Rapports locaux', desc: 'Rapports limités à l\'établissement assigné' },
      ]
    default:
      return []
  }
}

function getAllowedTypesForRole(role: string): string[] | null {
  switch (role) {
    case 'SECRETAIRE_MATERNELLE':
      return ['MATERNELLE', 'COMPLEXE']
    case 'SECRETAIRE_PRIMAIRE':
      return ['PRIMAIRE', 'COMPLEXE']
    case 'SECRETAIRE_SECONDAIRE':
      return ['SECONDAIRE', 'COMPLEXE']
    default:
      return null
  }
}

const ALL_ROLES = [
  'COORDINATEUR',
  'SECRETAIRE_MATERNELLE',
  'SECRETAIRE_PRIMAIRE',
  'SECRETAIRE_SECONDAIRE',
] as const

// ── Component ───────────────────────────────────────────────────────────────

export default function UtilisateursPage() {
  const { user } = useAppStore()
  const [users, setUsers] = useState<User[]>([])
  const [ecoles, setEcoles] = useState<Etablissement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [form, setForm] = useState<UserForm>(emptyForm)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [targetUser, setTargetUser] = useState<User | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')
  const [detailUser, setDetailUser] = useState<User | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // ── Chargement des données ──────────────────────────────────────────────
  async function fetchEcoles() {
    try {
      const res = await tc.listEtablissements()
      setEcoles(res?.etablissements ?? [])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors du chargement des établissements'
      console.error(message)
    }
  }

  async function fetchUsers() {
    setLoading(true)
    try {
      const res = await tc.listUtilisateurs()
      const list = res?.data ?? []
      setUsers(list)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors du chargement des utilisateurs'
      toast.error(message)
      console.error(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    fetchEcoles()
    fetchUsers()
  }, [user])

  // ── Filtres ────────────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    let result = users
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (u) =>
          u.nomComplet.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          getRoleLabel(u.role).toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q)
      )
    }
    if (roleFilter !== 'ALL') {
      result = result.filter((u) => u.role === roleFilter)
    }
    return result
  }, [users, searchQuery, roleFilter])

  const filteredEcoles = useMemo(() => {
    if (!form.role || form.role === 'COORDINATEUR') return ecoles
    const allowed = getAllowedTypesForRole(form.role)
    if (!allowed) return ecoles
    return ecoles.filter((e) => e.type && allowed.includes(e.type))
  }, [ecoles, form.role])

  // ── Garde d'accès ──────────────────────────────────────────────────────
  if (user && !canManageUsers(user.role)) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[60vh] gap-4"
      >
        <ShieldAlert className="w-16 h-16 text-rose-500" />
        <h2 className="text-2xl font-bold text-stone-800">Accès réservé</h2>
        <p className="text-stone-500">
          La gestion des utilisateurs est réservée au coordonnateur ou à l'administrateur.
        </p>
      </motion.div>
    )
  }

  // ── Handlers CRUD ──────────────────────────────────────────────────────
  function openCreate() {
    setEditingUser(null)
    setForm({ ...emptyForm })
    setDialogOpen(true)
  }

  function openEdit(u: User) {
    setEditingUser(u)
    setForm({
      nomComplet: u.nomComplet,
      username: u.username,
      password: '',
      role: u.role,
      etablissementId: u.etablissementId || '',
    })
    setDialogOpen(true)
  }

  function openDetail(u: User) {
    setDetailUser(u)
    setDetailOpen(true)
  }

  function openConfirm(u: User) {
    setTargetUser(u)
    setConfirmOpen(true)
  }

  async function handleSave() {
    if (!form.nomComplet.trim() || !form.username.trim() || !form.role) {
      toast.error('Veuillez remplir tous les champs obligatoires (*)')
      return
    }
    if (!editingUser && !form.password.trim()) {
      toast.error('Le mot de passe est requis pour la création')
      return
    }
    if (form.role !== 'COORDINATEUR' && !form.etablissementId) {
      toast.error('Veuillez sélectionner un établissement pour ce rôle')
      return
    }

    setSaving(true)
    try {
      if (editingUser) {
        await tc.updateUtilisateur(editingUser.id, {
          nomComplet: form.nomComplet.trim(),
          role: form.role,
          etablissementId: form.role === 'COORDINATEUR' ? null : form.etablissementId,
          ...(form.password.trim() ? { password: form.password.trim() } : {}),
        })
        toast.success('Utilisateur mis à jour avec succès')
      } else {
        await tc.createUtilisateur({
          username: form.username.trim(),
          password: form.password.trim(),
          nomComplet: form.nomComplet.trim(),
          role: form.role,
          etablissementId: form.role === 'COORDINATEUR' ? null : form.etablissementId,
        })
        toast.success('Utilisateur créé avec succès')
      }
      setDialogOpen(false)
      fetchUsers()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'enregistrement"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActif(u: User) {
    try {
      await tc.updateUtilisateur(u.id, { actif: !u.actif })
      toast.success(u.actif ? 'Utilisateur désactivé' : 'Utilisateur activé')
      fetchUsers()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour'
      toast.error(message)
    }
  }

  async function handleConfirmDelete() {
    if (!targetUser) return
    try {
      await tc.deleteUtilisateur(targetUser.id)
      toast.success(`Utilisateur "${targetUser.nomComplet}" désactivé avec succès`)
      setConfirmOpen(false)
      setTargetUser(null)
      fetchUsers()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la désactivation'
      toast.error(message)
    }
  }

  // ── Statistiques ────────────────────────────────────────────────────────
  const totalUsers = users.length
  const activeUsers = users.filter((u) => u.actif).length
  const uniqueRoles = new Set(users.map((u) => u.role)).size

  // ── Rendu ───────────────────────────────────────────────────────────────
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6 p-2 sm:p-4 md:p-6">
      {/* Banner Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 text-xs font-bold border border-amber-500/20 mb-2">
            <UserCog className="h-3.5 w-3.5" /> Sécurité & Comptes
          </div>
          <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight flex items-center gap-2">
            Gestion des Utilisateurs
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Création, rôles, affectations et sécurité d&apos;accès au système.
          </p>
        </div>
        {canManageUsers(user?.role || '') && (
          <Button onClick={openCreate} className="bg-[#0c241f] hover:bg-[#071916] text-white font-bold px-5 py-2.5 rounded-xl shadow-md gap-2">
            <Plus className="w-4 h-4 text-amber-400" />
            Nouvel utilisateur
          </Button>
        )}
      </motion.div>

      {/* Stats Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-[#0c241f]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-[#0c241f]/10 border border-[#0c241f]/20">
              <Users className="w-6 h-6 text-[#0c241f]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500">Total Utilisateurs</p>
              <p className="text-2xl font-extrabold text-stone-900">{totalUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-emerald-600">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <UserCheck className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500">Utilisateurs Actifs</p>
              <p className="text-2xl font-extrabold text-stone-900">{activeUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-stone-200/80 bg-white shadow-sm border-l-4 border-l-amber-500">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <Shield className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500">Rôles Différents</p>
              <p className="text-2xl font-extrabold text-stone-900">{uniqueRoles}</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Search & Filter */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <Input
            placeholder="Rechercher par nom, identifiant ou rôle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 rounded-xl border-stone-200 font-medium"
          />
        </div>
        <div className="relative w-full sm:w-60">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="rounded-xl border-stone-200 font-medium">
              <SelectValue placeholder="Tous les rôles" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="ALL">Tous les rôles</SelectItem>
              {ALL_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {getRoleLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <Card className="rounded-2xl border-stone-200/80 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-xl" />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-stone-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-base font-bold text-stone-700">
                  Aucun utilisateur trouvé
                </p>
                <p className="text-xs mt-1">
                  Essayez de modifier vos critères de recherche ou créez un nouvel utilisateur
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-[#0c241f] text-white">
                    <TableRow className="hover:bg-[#0c241f]">
                      <TableHead className="text-amber-300 font-bold">Utilisateur</TableHead>
                      <TableHead className="text-white font-bold">Identifiant</TableHead>
                      <TableHead className="text-white font-bold">Rôle</TableHead>
                      <TableHead className="hidden md:table-cell text-white font-bold">Établissement</TableHead>
                      <TableHead className="text-white font-bold">Statut</TableHead>
                      <TableHead className="hidden lg:table-cell text-white font-bold">Dernière Connexion</TableHead>
                      <TableHead className="text-right text-white font-bold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow
                        key={u.id}
                        className={`hover:bg-amber-500/5 transition-colors ${!u.actif ? 'opacity-60 bg-stone-50' : ''}`}
                      >
                        <TableCell className="font-bold text-stone-900 break-words">{u.nomComplet}</TableCell>
                        <TableCell className="text-stone-600 font-mono text-xs font-semibold">
                          @{u.username}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={getRoleBadgeClass(u.role)}>
                            {getRoleLabel(u.role)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell font-medium text-stone-700 break-words">
                          {u.etablissementNom ? (
                            u.etablissementNom
                          ) : u.role === 'COORDINATEUR' ? (
                            <span className="text-stone-400 italic">Tous les établissements</span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              u.actif
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold'
                                : 'bg-rose-100 text-rose-800 border border-rose-200 font-semibold'
                            }
                          >
                            {u.actif ? 'Actif' : 'Inactif'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-stone-500 text-xs font-medium">
                          {formatDateTime(u.dernierLogin)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDetail(u)}
                              className="h-8 w-8 text-stone-600 hover:text-[#0c241f] hover:bg-stone-100"
                              title="Voir la fiche"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(u)}
                              className="h-8 w-8 text-amber-700 hover:bg-amber-50"
                              title="Modifier"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleActif(u)}
                              className={`h-8 w-8 ${
                                u.actif
                                  ? 'text-amber-600 hover:bg-amber-50'
                                  : 'text-emerald-600 hover:bg-emerald-50'
                              }`}
                              title={u.actif ? 'Désactiver' : 'Activer'}
                            >
                              <Power className="w-4 h-4" />
                            </Button>
                            {u.actif && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openConfirm(u)}
                                className="h-8 w-8 text-rose-600 hover:bg-rose-50"
                                title="Supprimer / Désactiver"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── DIALOG CRÉATION / ÉDITION UTILISATEUR ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xl">
          <DialogHeader className="border-b border-stone-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-[#0c241f] text-amber-400">
                <UserCog className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-extrabold text-[#0c241f]">
                  {editingUser ? "Modifier le compte utilisateur" : 'Créer un utilisateur'}
                </DialogTitle>
                <p className="text-xs text-stone-500 font-medium">Saisissez les identifiants et le rôle système.</p>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label className="text-xs font-semibold text-stone-600">Nom complet *</Label>
              <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" placeholder="Ex: Jean Dupont" value={form.nomComplet} onChange={(e) => setForm({ ...form, nomComplet: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-stone-600">Nom d'utilisateur *</Label>
              <Input className="rounded-xl border-stone-200 bg-white font-mono font-bold mt-1" placeholder="Ex: jdupont" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={!!editingUser} />
              {editingUser && <p className="text-[11px] text-stone-400 mt-1 font-medium">L'identifiant d'accès ne peut pas être modifié.</p>}
            </div>
            <div>
              <Label className="text-xs font-semibold text-stone-600">Mot de passe {editingUser ? '(Optionnel)' : '*'}</Label>
              <Input className="rounded-xl border-stone-200 bg-white font-medium mt-1" type="password" placeholder={editingUser ? 'Laisser vide pour ne pas changer' : 'Définir un mot de passe'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-stone-600">Rôle système *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v, etablissementId: v === 'COORDINATEUR' ? '' : form.etablissementId })}>
                <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1"><SelectValue placeholder="Sélectionner un rôle" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="COORDINATEUR">Coordonnateur (Accès Complet)</SelectItem>
                  <SelectItem value="SECRETAIRE_MATERNELLE">Secrétaire Maternelle</SelectItem>
                  <SelectItem value="SECRETAIRE_PRIMAIRE">Secrétaire Primaire</SelectItem>
                  <SelectItem value="SECRETAIRE_SECONDAIRE">Secrétaire Secondaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role && form.role !== 'COORDINATEUR' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2">
                <Label className="text-xs font-semibold text-stone-600">Établissement affecté *</Label>
                <Select value={form.etablissementId} onValueChange={(v) => setForm({ ...form, etablissementId: v })}>
                  <SelectTrigger className="rounded-xl border-stone-200 bg-white font-medium mt-1"><SelectValue placeholder="Sélectionner un établissement" /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {filteredEcoles.length === 0 ? (
                      <div className="px-3 py-6 text-center text-sm text-stone-400 font-medium">Aucun établissement compatible disponible</div>
                    ) : (
                      filteredEcoles.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{`${e.type ? getTypeIcon(e.type) + ' ' : ''}${e.nom}`}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </motion.div>
            )}
            <div className="flex justify-end gap-3 border-t border-stone-100 pt-4">
              <Button variant="outline" className="rounded-xl border-stone-200" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-[#0c241f] hover:bg-[#071916] text-white font-bold rounded-xl px-6 shadow-md">
                {saving ? 'Enregistrement...' : editingUser ? 'Mettre à jour' : 'Créer le compte'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG FICHE DÉTAILLÉE UTILISATEUR ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xl">
          <DialogHeader className="border-b border-stone-100 pb-4">
            <DialogTitle className="text-lg font-bold text-[#0c241f]">Fiche Utilisateur</DialogTitle>
            <DialogDescription className="text-xs text-stone-500 font-medium">Informations du compte et droits d&apos;accès</DialogDescription>
          </DialogHeader>
          {detailUser && (
            <div className="space-y-5 pt-2">
              <div className="flex flex-col items-center text-center gap-3 bg-stone-50 p-4 rounded-2xl border border-stone-100">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md bg-[#d97706]">
                  {getInitials(detailUser.nomComplet, detailUser.username)}
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-stone-900 break-words">{detailUser.nomComplet}</h3>
                  <p className="text-xs text-stone-500 font-mono font-semibold mt-0.5">@{detailUser.username}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={getRoleBadgeClass(detailUser.role)}>{getRoleLabel(detailUser.role)}</Badge>
                  <Badge variant="secondary" className={detailUser.actif ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold' : 'bg-rose-100 text-rose-800 border border-rose-200 font-semibold'}>
                    {detailUser.actif ? 'Actif' : 'Inactif'}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl border border-stone-100 bg-stone-50/50">
                  <div className="p-2 rounded-lg bg-white border border-stone-200 text-[#0c241f]"><Building2 className="w-4 h-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-stone-400 font-bold uppercase tracking-wider">Établissement Affecté</p>
                    <p className="text-xs font-semibold text-stone-800 break-words mt-0.5">
                      {detailUser.etablissementNom ? detailUser.etablissementNom : detailUser.role === 'COORDINATEUR' ? 'Tous les établissements' : '—'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl border border-stone-100 bg-stone-50/50">
                  <div className="p-2 rounded-lg bg-white border border-stone-200 text-[#0c241f]"><Clock className="w-4 h-4" /></div>
                  <div>
                    <p className="text-[11px] text-stone-400 font-bold uppercase tracking-wider">Dernière Connexion</p>
                    <p className="text-xs font-semibold text-stone-800 mt-0.5">{formatDateTime(detailUser.dernierLogin)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl border border-stone-100 bg-stone-50/50">
                  <div className="p-2 rounded-lg bg-white border border-stone-200 text-[#0c241f]"><CalendarDays className="w-4 h-4" /></div>
                  <div>
                    <p className="text-[11px] text-stone-400 font-bold uppercase tracking-wider">Date de Création</p>
                    <p className="text-xs font-semibold text-stone-800 mt-0.5">{formatDateTime(detailUser.createdAt)}</p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5"><Shield className="w-4 h-4 text-amber-600" /> Droits d&apos;accès du rôle</h4>
                <div className="space-y-2">
                  {getRolePermissions(detailUser.role).map((perm, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 border border-stone-100">
                      <div className="p-1.5 rounded-lg bg-[#0c241f]/10 text-[#0c241f] mt-0.5"><perm.icon className="w-3.5 h-3.5" /></div>
                      <div>
                        <p className="text-xs font-bold text-stone-900">{perm.label}</p>
                        <p className="text-[11px] text-stone-500 font-medium mt-0.5">{perm.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <Button variant="outline" className="rounded-xl border-stone-200 text-xs font-semibold" size="sm" onClick={() => { setDetailOpen(false); openEdit(detailUser) }}><Edit className="w-3.5 h-3.5 mr-1.5" />Modifier</Button>
                <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); handleToggleActif(detailUser) }} className={`rounded-xl text-xs font-semibold ${detailUser.actif ? 'text-amber-700 border-amber-300 hover:bg-amber-50' : 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'}`}>
                  <Power className="w-3.5 h-3.5 mr-1.5" />{detailUser.actif ? 'Désactiver' : 'Activer'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Deactivation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-3xl border border-stone-200 p-6 shadow-2xl max-w-md bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-600 font-extrabold text-lg"><Trash2 className="w-5 h-5" />Désactiver le compte ?</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-600 text-sm font-medium mt-1">
              Êtes-vous sûr de vouloir désactiver l'utilisateur{' '}
              <b className="text-stone-900">{targetUser?.nomComplet}</b> ? Son accès au système sera interrompu. Vous pourrez réactiver son compte ultérieurement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-4">
            <AlertDialogCancel className="rounded-xl border-stone-200 font-semibold">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold">Désactiver</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}