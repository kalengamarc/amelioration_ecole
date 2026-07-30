'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAppStore, canManageUsers, getRoleLabel, getTypeIcon, getTypeBadgeClass, getTypeLabel } from '@/lib/store'
import * as tc from '@/lib/tauri-commands'
import { Card, CardContent } from '@/components/ui/card'
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
  Eye, Search, Filter, Clock, CalendarDays, Building2, Key, Lock,
} from 'lucide-react'

// ── Types (camelCase exacts fournis par le backend) ─────────────────────────

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
  if (role === 'COORDINATEUR') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
  }
  return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
}

function getInitials(nomComplet: string): string {
  const parts = nomComplet.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return nomComplet.substring(0, 2).toUpperCase()
}

function getAvatarColor(nomComplet: string): string {
  const colors = [
    '#075e54', '#25d366', '#128c7e', '#34b7f1', '#f39c12',
    '#e74c3c', '#9b59b6', '#1abc9c', '#e67e22', '#2c3e50',
  ]
  let hash = 0
  for (let i = 0; i < nomComplet.length; i++) {
    hash = nomComplet.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
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
      // La réponse a la forme { success: true, data: User[] }
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
        <ShieldAlert className="w-16 h-16 text-red-400" />
        <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-200">Accès réservé</h2>
        <p className="text-gray-500 dark:text-gray-400">
          La gestion des utilisateurs est réservée au coordonnateur
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
      toast.error('Veuillez remplir tous les champs obligatoires')
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
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-7 h-7" style={{ color: 'var(--etab-color, #075e54)' }} />
            Gestion des Utilisateurs
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Créez et gérez les comptes d&apos;accès au système
          </p>
        </div>
        {canManageUsers(user?.role || '') && (
          <Button onClick={openCreate} className="bg-[var(--etab-color,#075e54)] hover:bg-[var(--etab-color-hover,#064e46)] text-white gap-2">
            <Plus className="w-4 h-4" />
            Nouvel utilisateur
          </Button>
        )}
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-[var(--etab-color,#075e54)]">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-[var(--etab-color,#075e54)]/10">
              <Users className="w-6 h-6 text-[var(--etab-color,#075e54)]" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total utilisateurs</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{totalUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#25d366]">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-[#25d366]/10">
              <UserCheck className="w-6 h-6 text-[#25d366]" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Utilisateurs actifs</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{activeUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-amber-500/10">
              <Shield className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Rôles différents</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{uniqueRoles}</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Search & Filter */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Rechercher par nom, identifiant ou rôle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="relative w-full sm:w-56">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="pl-10">
              <SelectValue placeholder="Tous les rôles" />
            </SelectTrigger>
            <SelectContent>
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
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4 items-center">
                    <Skeleton className="h-8 w-1/5" />
                    <Skeleton className="h-8 w-1/6" />
                    <Skeleton className="h-8 w-1/5" />
                    <Skeleton className="h-8 w-1/6" />
                    <Skeleton className="h-8 w-1/6" />
                    <Skeleton className="h-8 w-1/6" />
                  </div>
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium">
                  {searchQuery || roleFilter !== 'ALL'
                    ? 'Aucun utilisateur trouvé'
                    : 'Aucun utilisateur trouvé'}
                </p>
                <p className="text-sm mt-1">
                  {searchQuery || roleFilter !== 'ALL'
                    ? 'Essayez de modifier vos critères de recherche'
                    : 'Commencez par créer un nouvel utilisateur'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-gray-800/50">
                      <TableHead>Utilisateur</TableHead>
                      <TableHead>Identifiant</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead className="hidden md:table-cell">Établissement</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="hidden lg:table-cell">Dernière connexion</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow
                        key={u.id}
                        className={`hover:bg-gray-50/50 dark:hover:bg-gray-800/30 ${!u.actif ? 'opacity-60' : ''}`}
                      >
                        <TableCell className="font-medium">{u.nomComplet}</TableCell>
                        <TableCell className="text-gray-500 dark:text-gray-400 font-mono text-sm">
                          {u.username}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={getRoleBadgeClass(u.role)}>
                            {getRoleLabel(u.role)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {u.etablissementNom ? (
                            u.etablissementNom
                          ) : u.role === 'COORDINATEUR' ? (
                            <span className="text-gray-400 italic">Tous</span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              u.actif
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            }
                          >
                            {u.actif ? 'Actif' : 'Inactif'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-gray-500 dark:text-gray-400 text-sm">
                          {formatDate(u.dernierLogin)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDetail(u)}
                              className="text-[var(--etab-color,#075e54)] hover:text-[var(--etab-color-hover,#064e46)] hover:bg-[var(--etab-color,#075e54)]/10"
                              title="Voir la fiche"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(u)}
                              className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                              title="Modifier"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleActif(u)}
                              className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 ${
                                u.actif
                                  ? 'text-amber-500 hover:text-amber-700'
                                  : 'text-green-500 hover:text-green-700'
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
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                title="Désactiver (supprimer)"
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold" style={{ color: 'var(--etab-color, #075e54)' }}>
              {editingUser ? "Modifier l'utilisateur" : 'Nouvel utilisateur'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="nomComplet">Nom complet *</Label>
              <Input id="nomComplet" placeholder="Ex: Jean Dupont" value={form.nomComplet} onChange={(e) => setForm({ ...form, nomComplet: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Nom d'utilisateur *</Label>
              <Input id="username" placeholder="Ex: jdupont" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={!!editingUser} />
              {editingUser && <p className="text-xs text-gray-400">L'identifiant ne peut pas être modifié</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe {editingUser ? '' : '*'}</Label>
              <Input id="password" type="password" placeholder={editingUser ? 'Laisser vide pour ne pas changer' : 'Définir un mot de passe'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rôle *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v, etablissementId: v === 'COORDINATEUR' ? '' : form.etablissementId })}>
                <SelectTrigger id="role"><SelectValue placeholder="Sélectionner un rôle" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COORDINATEUR">Coordonnateur</SelectItem>
                  <SelectItem value="SECRETAIRE_MATERNELLE">Secrétaire Maternelle</SelectItem>
                  <SelectItem value="SECRETAIRE_PRIMAIRE">Secrétaire Primaire</SelectItem>
                  <SelectItem value="SECRETAIRE_SECONDAIRE">Secrétaire Secondaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role && form.role !== 'COORDINATEUR' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2">
                <Label htmlFor="etablissement">Établissement *</Label>
                <Select value={form.etablissementId} onValueChange={(v) => setForm({ ...form, etablissementId: v })}>
                  <SelectTrigger id="etablissement"><SelectValue placeholder="Sélectionner un établissement" /></SelectTrigger>
                  <SelectContent>
                    {filteredEcoles.length === 0 ? (
                      <div className="px-3 py-6 text-center text-sm text-gray-400">Aucun établissement compatible avec ce rôle</div>
                    ) : (
                      filteredEcoles.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{`${e.type ? getTypeIcon(e.type) + ' ' : ''}${e.nom}`}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </motion.div>
            )}
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-[var(--etab-color,#075e54)] hover:bg-[var(--etab-color-hover,#064e46)] text-white">
                {saving ? 'Enregistrement...' : editingUser ? 'Mettre à jour' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold" style={{ color: 'var(--etab-color, #075e54)' }}>Fiche utilisateur</DialogTitle>
            <DialogDescription>Informations détaillées du compte</DialogDescription>
          </DialogHeader>
          {detailUser && (
            <div className="space-y-5 pt-2">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg" style={{ backgroundColor: getAvatarColor(detailUser.nomComplet) }}>
                  {getInitials(detailUser.nomComplet)}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{detailUser.nomComplet}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">@{detailUser.username}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={getRoleBadgeClass(detailUser.role)}>{getRoleLabel(detailUser.role)}</Badge>
                  <Badge variant="secondary" className={detailUser.actif ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}>
                    {detailUser.actif ? 'Actif' : 'Inactif'}
                  </Badge>
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800"><Building2 className="w-4 h-4 text-gray-500 dark:text-gray-400" /></div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Établissement</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                      {detailUser.etablissementNom ? detailUser.etablissementNom : detailUser.role === 'COORDINATEUR' ? 'Tous les établissements' : '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800"><Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" /></div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Dernière connexion</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{formatDateTime(detailUser.dernierLogin)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800"><CalendarDays className="w-4 h-4 text-gray-500 dark:text-gray-400" /></div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Date de création</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{formatDateTime(detailUser.createdAt)}</p>
                  </div>
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2"><Shield className="w-4 h-4" style={{ color: 'var(--etab-color, #075e54)' }} />Permissions du rôle</h4>
                <div className="space-y-2">
                  {getRolePermissions(detailUser.role).map((perm, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <div className="p-1.5 rounded-md bg-[var(--etab-color,#075e54)]/10 mt-0.5"><perm.icon className="w-3.5 h-3.5 text-[var(--etab-color,#075e54)]" /></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{perm.label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{perm.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); openEdit(detailUser) }}><Edit className="w-3.5 h-3.5 mr-1.5" />Modifier</Button>
                <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); handleToggleActif(detailUser) }} className={detailUser.actif ? 'text-amber-600 border-amber-300 hover:bg-amber-50' : 'text-green-600 border-green-300 hover:bg-green-50'}>
                  <Power className="w-3.5 h-3.5 mr-1.5" />{detailUser.actif ? 'Désactiver' : 'Activer'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Deactivation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="w-5 h-5 text-red-500" />Désactiver l'utilisateur</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir désactiver l'utilisateur{' '}
              <span className="font-semibold text-gray-900 dark:text-white">{targetUser?.nomComplet}</span> ? Son accès au système sera supprimé. Vous pourrez le réactiver ultérieurement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700 text-white">Désactiver</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}