// src/lib/permissions.ts

export function canManageClasses(role: string): boolean {
  return role === 'admin' || role === 'superadmin'
}

export function canManageEtablissements(role: string): boolean {
  return role === 'superadmin'
}

export function canManageUtilisateurs(role: string): boolean {
  return role === 'superadmin'
}

// Tu pourras ajouter d’autres fonctions de permission au même endroit