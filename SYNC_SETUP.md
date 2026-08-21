# 🚀 GUIDE ÉTAPE PAR ÉTAPE - Synchronisation Supabase

## 📖 Table des matières
1. [Configuration Initiale](#configuration-initiale)
2. [Préparation Supabase](#préparation-supabase)
3. [Configuration SGFS-ME](#configuration-sgfs-me)
4. [Première Synchronisation](#première-synchronisation)
5. [Vérification & Validation](#vérification--validation)
6. [Troubleshooting](#troubleshooting)

---

## Configuration Initiale

### Étape 1: Créer un projet Supabase

1. Aller à [https://app.supabase.com](https://app.supabase.com)
2. Cliquer "New Project"
3. Remplir les informations:
   - **Project name**: `sgfs-me-prod` (ou votre nom)
   - **Database password**: Générer un mot de passe fort
   - **Region**: Choisir le plus proche de vous
4. Cliquer "Create new project"
5. ⏳ Attendre 1-2 minutes que le projet soit créé

### Étape 2: Récupérer les Credentials

Une fois le projet créé:

1. Aller à **Settings** (⚙️ en bas à gauche)
2. Cliquer **API** dans le menu
3. **Copier et sauvegarder** (dans un fichier sécurisé):

```
URL: https://xxxxxxxxxxxxx.supabase.co
API Key (anon): eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Service Role Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

⚠️ **Sécurité**: Ne pas partager ces clés! Elles donnent accès à votre base de données.

---

## Préparation Supabase

### Étape 3: Créer les tables

1. Dans le projet Supabase, cliquer **SQL Editor** (à gauche)
2. Cliquer **New query**
3. Ouvrir le fichier `supabase_schema.sql` de votre projet
4. **Copier TOUT le contenu** du fichier
5. **Coller dans** l'éditeur SQL de Supabase
6. Cliquer **Run** (ou Ctrl+Enter)
7. Attendre que le script se termine (voir "Query completed in X ms")

✓ Les tables sont maintenant créées!

### Étape 4: Vérifier les tables

1. Cliquer **Table Editor** (à gauche)
2. Vérifier que vous voyez toutes ces tables:
   - ✓ Etablissement
   - ✓ AnneeScolaire
   - ✓ Classe
   - ✓ User
   - ✓ Eleve
   - ✓ Tuteur
   - ✓ TuteurEleve
   - ✓ EleveClasse
   - ✓ FraisScolaire
   - ✓ FraisClasse
   - ✓ Echeance
   - ✓ Paiement
   - ✓ AnnulationRecu
   - ✓ Depense
   - ✓ ParametreEtablissement
   - ✓ AuditLog
   - ✓ ConfigSysteme
   - ✓ SyncLog

---

## Configuration SGFS-ME

### Étape 5: Configurer les credentials

1. **Ouvrir l'application SGFS-ME**
2. **Aller à**: Paramètres (⚙️) → Synchronisation
3. Voir la section "Configuration Supabase"
4. Remplir les champs:
   - **URL Supabase**: `https://xxxxxxxxxxxxx.supabase.co`
   - **Clé API**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
5. Cliquer **"Enregistrer la configuration"**
6. Attendre la notification "Configuration enregistrée avec succès"

### Étape 6: Vérifier le statut

1. Toujours dans Paramètres → Synchronisation
2. Cliquer **"Vérifier le statut"**
3. Vérifier que vous voyez:
   ```
   ✓ Configuré: Oui
   ✓ Dernière synchro: Jamais (pour une première fois)
   ```

---

## Première Synchronisation

### Étape 7: Vérifier les données locales

Avant de synchroniser, vérifier que vous avez des données:

**Dashboard:**
- [ ] Au moins 1 établissement
- [ ] Au moins 1 année scolaire active
- [ ] Au moins 1 élève
- [ ] Au moins 1 paiement ou frais

**Si vous avez peu de données:**
- Créer rapidement quelques élèves dans Élèves → Ajouter un élève
- Créer quelques frais dans Frais → Ajouter des frais
- Créer quelques paiements dans Encaissements → Nouvel encaissement

### Étape 8: Lancer la synchronisation

1. **Paramètres → Synchronisation**
2. Cliquer le bouton **"SYNCHRONISER MAINTENANT"** (gros bouton bleu)
3. ⏳ **Attendre...** (20 secondes à 2 minutes)
   - L'écran affichera un indicateur de progression
   - Ne pas fermer l'application pendant ce temps
4. ✅ Voir le résumé s'afficher:
   ```
   Synchronisation réussie avec succès!
   
   Etablissement:              5 poussés
   AnneeScolaire:              3 poussés
   Classe:                     15 poussés
   Eleve:                      45 poussés
   Paiement:                   120 poussés
   ...
   ```

### Erreurs possibles et solutions:

| Erreur | Cause | Solution |
|--------|-------|----------|
| "URL ou clé Supabase vide" | Credentails non configurées | Retourner Étape 5 et vérifier les valeurs |
| "Impossible de se connecter à Supabase" | URL incorrecte | Copier à nouveau l'URL exacte de Supabase |
| "Unauthorized (401)" | Clé API incorrecte | Vérifier que c'est bien la clé anon (pas autre chose) |
| "Foreign key constraint" | Donnée incohérente localement | Relancer la sync (elle fait Pull d'abord) |
| "UNIQUE constraint failed" | Doublon détecté | C'est normal, la sync va fusionner |

---

## Vérification & Validation

### Étape 9: Vérifier dans Supabase

1. Ouvrir le projet Supabase
2. **Table Editor** → Cliquer sur chaque table
3. Vérifier les comptes correspondent:

```
Exemple:
Local (SGFS-ME):         Supabase (Cloud):
- 5 Établissements  →  5 Établissements ✓
- 45 Élèves         →  45 Élèves ✓
- 120 Paiements     →  120 Paiements ✓
```

### Étape 10: Tester une nouvelle saisie

Pour confirmer que la sync fonctionne:

1. **Créer une nouvelle donnée en local** (ex: nouvel élève)
2. **Attendre 10-15 minutes** (ou cliquer "Synchroniser maintenant")
3. **Vérifier dans Supabase** qu'il apparaît
4. ✓ Si c'est le cas, tout fonctionne parfaitement!

---

## Troubleshooting

### La synchronisation prend trop longtemps

**Problème**: La sync prend plus de 5 minutes
**Solutions**:
1. Vérifier votre connexion internet
2. Vérifier que Supabase n'a pas de problèmes (status.supabase.com)
3. Relancer l'application
4. Réessayer

### Les données ne s'affichent pas dans Supabase

**Problème**: La sync dit "réussie" mais Supabase est vide
**Causes possibles**:
1. Vous regardez le mauvais projet Supabase
2. Vous regardez la mauvaise région
3. Les tables n'ont pas été créées (voir Étape 3)

**Solution**:
1. Vérifier l'URL Supabase (Settings → API → URL)
2. Vérifier que vous êtes dans le bon projet
3. Refaire le script SQL (Étape 3)

### "Foreign key constraint violated"

**Problème**: Erreur lors de la sync
**Cause**: Une donnée référence un parent qui n'existe pas

**Solution**:
1. C'est normal lors de la première sync
2. Relancer la sync (elle fera un Pull d'abord qui va corriger ça)
3. Si ça persiste:
   - Vérifier que tous les établissements existent
   - Vérifier que toutes les années scolaires existent
   - Faire un backup et supprimer les données orphelines

### "UNIQUE constraint failed"

**Problème**: Une valeur unique est dupliquée
**Exemple**: Deux élèves avec le même matricule

**Solution**:
1. C'est normal, la sync va fusionner
2. Si beaucoup de doublons:
   - Vérifier localement qu'il n'y a pas de mauvaises données
   - Nettoyer les doublons
   - Relancer la sync

### La sync automatique ne fonctionne pas

**Problème**: Les données ne se synchro pas toutes les 10 min
**Solutions**:
1. Vérifier que l'application est toujours ouverte
2. Vérifier que vous êtes connecté
3. Relancer l'application
4. Vérifier les credentials dans Paramètres

---

## ✅ Checklist Finale

Avant de considérer la synchronisation comme "complétée":

- [ ] Projet Supabase créé
- [ ] Tables créées via SQL
- [ ] Credentials configurés dans SGFS-ME
- [ ] Statut affiche "Configuré: Oui"
- [ ] Première sync exécutée avec succès
- [ ] Données visibles dans Supabase
- [ ] Nouveau test: saisie locale → visible en Supabase
- [ ] Backup Supabase configuré

---

## 🎉 C'est Bon!

Votre base de données est maintenant synchronisée avec Supabase. Vous pouvez:

✓ Continuer à saisir des données en local  
✓ Les données seront automatiquement synchronisées  
✓ Accéder aux données depuis Supabase si besoin  
✓ Configurer des alertes et rapports sur les données  

---

**Questions? Consultez SYNC_GUIDE.md pour plus de détails techniques.**
