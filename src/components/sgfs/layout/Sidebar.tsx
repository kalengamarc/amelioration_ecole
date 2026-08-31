'use client'

import { useAppStore, DEFAULT_COLOR, type PageName, getRoleLabel } from '@/lib/store'
import {
  LayoutDashboard,
  Building2,
  GraduationCap,
  Users,
  Receipt,
  Banknote,
  CalendarClock,
  TrendingDown,
  FileText,
  Shield,
  Settings,
  UserCog,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import type { LucideIcon } from 'lucide-react'

export type { PageName }

interface Etablissement {
  id: string
  nom: string
  type: string
}

interface SidebarProps {
  etablissements: Etablissement[]
}

interface MenuItem {
  key: PageName
  label: string
  icon: LucideIcon
  roles: 'all' | string[]
}

const menuItems: MenuItem[] = [
  { key: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, roles: 'all' },
  { key: 'etablissements', label: 'Établissements', icon: Building2, roles: ['COORDINATEUR'] },
  { key: 'classes', label: 'Classes', icon: GraduationCap, roles: ['COORDINATEUR'] },
  { key: 'eleves', label: 'Élèves', icon: Users, roles: 'all' },
  { key: 'frais', label: 'Frais scolaires', icon: Banknote, roles: ['COORDINATEUR'] },
  { key: 'echeances', label: 'Échéances', icon: CalendarClock, roles: 'all' },
  { key: 'encaissements', label: 'Encaissements', icon: Receipt, roles: 'all' },
  { key: 'depenses', label: 'Dépenses', icon: TrendingDown, roles: 'all' },
  { key: 'rapports', label: 'Rapports', icon: FileText, roles: 'all' },
  { key: 'audit', label: "Journal d'audit", icon: Shield, roles: ['COORDINATEUR'] },
  { key: 'parametres', label: 'Paramètres', icon: Settings, roles: ['COORDINATEUR'] },
  { key: 'utilisateurs', label: 'Utilisateurs', icon: UserCog, roles: ['COORDINATEUR'] },
]

function isAdminRole(role: string | undefined | null): boolean {
  if (!role) return true
  const r = role.toUpperCase()
  return r === 'COORDINATEUR' || r === 'ADMIN' || r === 'SUPERADMIN' || r === 'ADMINISTRATEUR' || r === 'COORD'
}

function getUserInitials(nomComplet: string | undefined | null, username: string | undefined | null): string {
  const name = nomComplet || username || 'Admin'
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'AD'
}

export default function Sidebar({ etablissements }: SidebarProps) {
  const { currentPage, setPage, user, logout, sidebarOpen, toggleSidebar, currentEtablissement } = useAppStore()

  const accentColor = currentEtablissement?.couleurPrincipale || DEFAULT_COLOR
  const schoolName = currentEtablissement?.nom || 'SGFS-ME'

  const filteredItems = menuItems.filter(
    (item) => item.roles === 'all' || isAdminRole(user?.role)
  )

  const navItem = (item: MenuItem) => {
    const isActive = currentPage === item.key
    const Icon = item.icon

    const buttonContent = (
      <Button
        variant="ghost"
        onClick={() => setPage(item.key)}
        className={`
          relative w-full flex items-center gap-2.5 px-3 h-9 rounded-lg
          text-[13px] font-medium transition-all duration-200
          ${sidebarOpen ? 'justify-start' : 'justify-center'}
          ${isActive
            ? 'text-amber-400 bg-white/10 font-semibold shadow-inner'
            : 'text-stone-300 hover:bg-white/5 hover:text-white'
          }
        `}
        style={isActive
          ? { borderLeft: `3px solid #d97706`, paddingLeft: '10px' }
          : { borderLeft: '3px solid transparent', paddingLeft: '10px' }
        }
      >
        <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-amber-400' : 'text-stone-400'}`} strokeWidth={isActive ? 2.2 : 1.5} />
        <AnimatePresence>
          {sidebarOpen && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15, ease: "easeInOut" }}
              className="whitespace-nowrap overflow-hidden"
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
      </Button>
    )

    if (!sidebarOpen) {
      return (
        <Tooltip key={item.key} delayDuration={0}>
          <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={10} className="border-zinc-800 bg-zinc-900 text-zinc-200">
            <p className="text-xs font-medium">{item.label}</p>
          </TooltipContent>
        </Tooltip>
      )
    }

    return <div key={item.key}>{buttonContent}</div>
  }

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={toggleSidebar}
          />
        )}
      </AnimatePresence>

      {/* Sidebar Container */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 260 : 64 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className={`
          fixed top-0 left-0 z-50 h-screen flex flex-col
          bg-[#0c241f] border-r border-emerald-900/40 shadow-xl
          ${sidebarOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'}
          md:translate-x-0 transition-transform duration-200
        `}
      >
        <TooltipProvider>
          {/* Top accent bar */}
          <div className="h-1 shrink-0 w-full bg-[#d97706]" />
          
          {/* Logo Section - Compact */}
          <div className="flex items-center gap-3 px-3.5 h-16 mt-2 shrink-0 border-b border-emerald-900/30">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border p-1 overflow-hidden"
              style={{ backgroundColor: `${accentColor}22`, borderColor: `${accentColor}55` }}
            >
              {currentEtablissement?.logoUrl ? (
                <Image
                  src={currentEtablissement.logoUrl}
                  alt="Logo"
                  width={32}
                  height={32}
                  className="object-contain"
                />
              ) : (
                <GraduationCap className="h-5 w-5" style={{ color: accentColor }} />
              )}
            </div>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 min-w-0"
                >
                  <span className="text-xs font-bold leading-snug text-white block break-words">
                    {schoolName}
                  </span>
                  <span className="text-[10px] text-amber-400 font-semibold block mt-0.5">
                    Système SGFS-ME
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User Section - Compact */}
          <div className="flex items-center gap-3 px-3.5 py-3 shrink-0 bg-emerald-950/40 border-b border-emerald-900/20">
            <div className="flex items-center justify-center h-8 w-8 rounded-full shrink-0 text-xs font-bold text-white bg-[#d97706] shadow-sm">
              {getUserInitials(user?.nomComplet, user?.username)}
            </div>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 min-w-0"
                >
                  <p className="text-xs font-semibold text-stone-100 leading-snug break-words">
                    {user?.nomComplet || user?.username || 'Administrateur'}
                  </p>
                  <p className="text-[10px] text-amber-400 font-medium leading-tight mt-0.5">
                    {getRoleLabel(user?.role || 'COORDINATEUR')}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Navigation - Scrollable & Compact */}
          <ScrollArea className="flex-1 px-1.5 py-1.5">
            <nav className="flex flex-col gap-0.5">
              {filteredItems.map(navItem)}
            </nav>
          </ScrollArea>

          {/* Bottom Actions - Compact */}
          <div className="px-1.5 pb-2 flex flex-col gap-0.5 shrink-0">
            <Separator className="bg-white/[0.06] mb-1" />

            <div className="flex gap-0.5">
              {sidebarOpen ? (
                <Button
                  variant="ghost"
                  onClick={toggleSidebar}
                  className="flex-1 flex items-center gap-2 px-2.5 h-8 rounded-md text-xs text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300 justify-start"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0" />
                  <span>Réduire</span>
                </Button>
              ) : (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      onClick={toggleSidebar}
                      className="w-full flex items-center justify-center h-8 rounded-md text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                    >
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10} className="border-zinc-800 bg-zinc-900 text-zinc-200">
                    <p className="text-xs font-medium">Développer</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {sidebarOpen ? (
                <Button
                  variant="ghost"
                  onClick={logout}
                  className="flex-1 flex items-center gap-2 px-2.5 h-8 rounded-md text-xs text-red-400/80 hover:bg-red-500/10 hover:text-red-300 justify-start"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>Quitter</span>
                </Button>
              ) : (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      onClick={logout}
                      className="w-full flex items-center justify-center h-8 rounded-md text-red-400/80 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <LogOut className="h-4 w-4 shrink-0" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10} className="border-zinc-800 bg-zinc-900 text-zinc-200">
                    <p className="text-xs font-medium">Déconnexion</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </TooltipProvider>
      </motion.aside>
    </>
  )
}