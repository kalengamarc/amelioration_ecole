# 📊 Guide de Synchronisation Sécurisée - Nouvelle Base de Données

## 🔍 État Actuel du Système

Votre application utilise une **synchronisation bidirectionnelle** SQLite (local) ↔ Supabase/PostgreSQL (cloud).

### Architecture:
- **Local**: SQLite avec WAL mode
- **Cloud**: Supabase (PostgreSQL)
- **Protocole**: REST API PostgREST avec retry logic
- **Mode**: Bidirectionnel (Pull puis Push)

---

## ⚠️ Ordre de Synchronisation Critique

### **Tables Maîtres (pas de dépendances):**
1. `Etablissement` ✓
2. `User` ✓
3. `AnneeScolaire` → dépend de `Etablissement`

### **Tables Secondaires:**
4. `Classe` → dépend de `Etablissement`, `AnneeScolaire`
5. `Eleve` → dépend de `Etablissement`, `AnneeScolaire`
6. `Tuteur` ✓ (indépendant)

### **Tables de Liaison (Junction):**
7. `TuteurEleve` → dépend de `Eleve`, `Tuteur`
8. `EleveClasse` → dépend de `Eleve`, `Classe`

### **Frais & Échéances:**
9. `FraisScolaire` → dépend de `Etablissement`, `AnneeScolaire`
10. `FraisClasse` → dépend de `FraisScolaire`, `Classe`
11. `Echeance` → dépend de `Eleve`, `FraisScolaire`, `Etablissement`, `AnneeScolaire`

### **Transactions Financières:**
12. `Paiement` → dépend de `Eleve`, `Echeance`, `Etablissement`, `AnneeScolaire`, `User`
13. `AnnulationRecu` → dépend de `Paiement`, `User`
14. `Depense` → dépend de `Etablissement`, `AnneeScolaire`, `User`

### **Configuration & Audit:**
15. `ParametreEtablissement` → dépend de `Etablissement`, `AnneeScolaire`
16. `AuditLog` (non critique)

---

## 🚀 Étapes de Synchronisation Sécurisée

### **Avant la Première Sync:**

#### 1️⃣ Vérifier la Configuration Supabase
```bash
# Dans Paramètres → Synchronisation
- Entrer votre URL Supabase: https://xxxxx.supabase.co
- Entrer votre clé API: eyJhbG...
```

#### 2️⃣ Exécuter le Script SQL Supabase
```sql
-- ✓ Aller dans Supabase → SQL Editor
-- ✓ Copier-coller le contenu de: supabase_schema.sql
-- ✓ Exécuter le script
-- ✓ Attendre que toutes les tables soient créées
```

#### 3️⃣ Vérifier les Données Locales
```bash
# Vérifier que votre SQLite locale a des données:
- Dashboard: voir des élèves, frais, paiements
- Chaque établissement doit avoir des années scolaires
- Les élèves doivent être liés à des classes
```

### **Première Synchronisation (Pull → Push):**

#### Phase 1: PULL (Supabase → Local)
- Télécharge les **deletions** depuis l'audit de Supabase
- Télécharge les **insertions/modifications** par table
- ✓ Remet à jour les données locales qui auraient pu être modifiées en cloud

#### Phase 2: PUSH (Local → Supabase)
- Envoie les **deletions** (uniquement tables non-critiques)
- Envoie les **insertions/modifications** par lot de 100
- ✓ Utilise `on_conflict` pour gérer les doublons

---

## ✅ Vérifications de Sécurité

### Avant de cliquer "Synchroniser":

- [ ] **Supabase est accessible**
  ```bash
  Tester: https://xxxxx.supabase.co/rest/v1/Etablissement
  Header: apikey: votre_cle_api
  ```

- [ ] **Les tables sont créées** (SQL exécuté)
  ```bash
  Supabase → SQL Editor → Vérifier que toutes les tables existent
  ```

- [ ] **Les données locales sont complètes**
  ```bash
  Dashboard → Vérifier:
  - Au moins 1 établissement
  - Au moins 1 année scolaire active
  - Au moins quelques élèves
  - Au moins quelques paiements ou frais
  ```

- [ ] **Foreign keys respectées**
  ```bash
  Exemple: Un élève DOIT être lié à un établissement existant
  ```

---

## 🛡️ Garde-fous anti-perte de données (version corrigée)

La synchronisation inclut désormais les protections suivantes :

1. **Verrou global anti-concurrence** — la synchro automatique (5 min) et le clic
   manuel ne peuvent plus s'exécuter en même temps.
2. **`LAST_SYNC` n'avance que si PULL **et** PUSH réussissent** — si le
   téléchargement échoue (coupure réseau), les données et suppressions distantes
   seront re-téléchargées au prochain run au lieu d'être oubliées.
3. **Sauvegarde automatique locale** avant chaque synchronisation :
   `sgfs.db.bak-<horodatage>` (les 3 dernières sont conservées). En cas de
   problème, restaurez simplement ce fichier.
4. **Journal des suppressions protégé** — les entrées `DELETE` de l'AuditLog
   locales non encore poussées ne sont plus purgées : une suppression locale ne
   peut plus être perdue avant d'atteindre le cloud.
5. **Fusion unique sécurisée** — le repli `on_conflict=unique` ne s'applique plus
   qu'aux tables sûres (AnneeScolaire, Classe, Echeance, AnnulationRecu,
   ParametreEtablissement). Pour `Paiement` (numero_recu), `Eleve` (matricule) et
   `User` (username), un conflit est **signalé en erreur** au lieu d'écraser
   silencieusement une donnée.
6. **Suppressions des tables de liaison corrigées** — les filtres REST des
   suppressions `TuteurEleve`, `EleveClasse`, `FraisClasse` utilisaient deux fois
   la même colonne : les suppressions ne s'appliquaient jamais côté serveur.
7. **Horodatages normalisés** — les dates distantes (`+00:00`) sont converties au
   format UTC local (`Z`) pour que le journal des suppressions reste fiable.
8. **Conflit « un seul ACTIF par élève » résolu** lors du téléchargement
   d'EleveClasse (l'état distant consolidé fait foi).
9. **Identifiants uniques par machine** : numéros de reçu et matricules incluent
   un code machine (`REC-20260830-A7K-0001`, `ELV-2026-A7K-0001`) — plus aucune
   collision entre machines sur `numero_recu` / `matricule`.
10. **Fusion dupliquée désactivée côté PostgREST** : l'en-tête
    `resolution=merge-duplicates` n'est plus envoyé pour `Paiement`, `Eleve` et
    `User` (il faisait fusionner silencieusement les conflits même sans repli).
11. **Tuteurs stables** : plus de recréation de tuteurs à chaque édition d'élève
    (réutilisation par téléphone) — pas de doublons ni d'orphelins repoussés.
12. **Échéances recalculées avant push** : `montant_paye` est recalculé depuis
    les paiements réels après le pull, pour ne pas écraser le cloud avec des
    montants périmés.

### ⚠️ Limites connues

- **Résolution de conflits** : en cas de modification de la même ligne sur deux
  machines, la règle reste « dernier run de synchro gagne » (pull puis push
  complet). Les sauvegardes locales `.bak-*` permettent de restaurer un état
  antérieur si besoin.

### 🔁 Matricules / numéros de reçu en double (données héritées)

Les anciennes données peuvent contenir des matricules identiques
(`ELV-2026-0001` créés avant le code machine) sur deux machines différentes.
La synchro ne bloque plus à cause de cela :

- **Au téléchargement** : une ligne distante dont le matricule / numéro de reçu
  est déjà pris localement par une autre ligne est **renommée automatiquement**
  avec un code dérivé de son id (`ELV-2026-3EF3D36C-0001`). Le code est
  déterministe : toutes les machines calculent la même valeur, donc les données
  convergent.
- **À l'envoi** : si un lot échoue sur un conflit de clé unique, la synchro
  réessaie ligne par ligne et renomme les lignes en conflit (persisté
  localement, visible dans la console).
- Le bouton « Synchroniser maintenant » n'est **plus bloqué** par les matricules
  dupliqués : ils sont signalés comme avertissement et corrigés à la synchro.
- **User en double** (même username) : non renommé automatiquement (c'est un
  identifiant de connexion) — la ligne est ignorée localement avec un
  avertissement et nécessite une fusion manuelle dans Supabase.

### 🧑🎓 Élèves passés « Transféré » sans raison

Un ancien bug faisait apparaître des élèves actifs comme « Transféré » après une
synchro : la propagation des suppressions appliquait un **hard delete** local
puis le pull complet **ré-importait la ligne depuis le cloud avec son statut
TRANSFERE** — même pour des élèves jamais archivés.

Corrections en place :

- **Propagation d'archivage = soft delete** : une suppression distante d'un
  élève (ou utilisateur/établissement) applique désormais le même traitement que
  le bouton « Archiver » (`statut='TRANSFERE'`, `actif=0`) au lieu d'une
  suppression physique.
- **Protection des élèves actifs** : un élève localement ACTIF/INSCRIT n'est
  JAMAIS rétrogradé TRANSFERE par le cloud, sauf si la suppression est
  documentée dans le journal d'audit (vrai archivage).
- **Auto-réparation** : les élèves déjà marqués TRANSFERE par l'ancien bug (sans
  AUCUNE suppression documentée, ni localement ni dans l'audit distant) sont
  restaurés ACTIF automatiquement à la prochaine synchro — puis repoussés ACTIF
  vers le cloud. L'opération est journalisée dans SyncLog (table `CONFLICTS`) et
  signalée dans le résumé. Les élèves **réellement archivés** (avec entrée
  d'audit) restent archivés.

### 🔢 Numéros de reçu et matricules uniques par machine

Depuis cette version :

- Chaque machine possède un **code machine persistant** (3 caractères, stocké
  dans `ConfigSysteme` clé `MACHINE_CODE`).
- Les nouveaux numéros de reçu ont le format `REC-20260830-A7K-0001` et les
  nouveaux matricules `ELV-2026-A7K-0001` : **deux machines ne peuvent plus
  générer le même numéro**, plus aucune collision ni écrasement sur
  `numero_recu` / `matricule`.
- Les anciennes données (`REC-20260830-0001`, `ELV-2026-0001`) restent
  inchangées : leurs formats ne peuvent pas entrer en collision avec les
  nouveaux.
- Bonus : les tuteurs ne sont plus recréés avec un nouvel ID à chaque édition
  d'élève (réutilisation par numéro de téléphone) — fini les doublons et les
  orphelins qui polluaient les synchronisations.

### ⚠️ Migration requise (base Supabase EXISTANTE)

Pour que les suppressions effectuées **directement dans Supabase** (Table Editor,
scripts SQL) soient propagées aux machines synchronisées, exécutez **une seule
fois** le script :

```
Supabase → SQL Editor → coller le contenu de supabase_triggers_deletes.sql → Run
```

⚠️ **Ne relancez PAS `supabase_schema.sql`** sur une base existante : il DROP
toutes les tables et effacerait vos données cloud ! `supabase_triggers_deletes.sql`
est idempotent et sans risque.

---

## 🔄 Processus de Sync Sécurisé

### **Pour une PREMIÈRE synchronisation:**

1. **Vérifier le statut** → Paramètres → Synchronisation → "Vérifier le statut"
   - ✓ Doit afficher "Configuré: Oui"
   - ✓ Doit afficher la dernière sync (si première, affichera "Jamais")

2. **Cliquer "Synchroniser maintenant"**
   - ⏳ Attendre... (cela peut prendre 30 secondes à 2 minutes)
   - 📊 Voir le résumé s'afficher

3. **Vérifier le résumé:**
   ```
   Établissement: 5 poussés
   Année scolaire: 3 poussés
   Élève: 45 poussés
   Paiement: 120 poussés
   ...
   ```

4. **Vérifier dans Supabase:**
   ```bash
   Supabase → Table Editor → Cliquer sur chaque table
   Vérifier que les données sont là
   ```

---

## ⚠️ Problèmes Courants & Solutions

### 🔴 "Erreur: Foreign key constraint violated"
**Cause**: Une table enfant référence un parent qui n'existe pas
**Solution**: 
- Vérifier que toutes les dépendances existent localement
- Relancer la sync (il va pull d'abord les parents manquants)

### 🔴 "Erreur: UNIQUE constraint violated"
**Cause**: Un doublon est trouvé dans Supabase
**Solution**:
- La sync utilise `on_conflict=merge` 
- Les doublons seront ignorés/fusionnés
- Continuer la sync

### 🔴 "Erreur réseau: Connection timeout"
**Cause**: Supabase ou votre internet est lent
**Solution**:
- Vérifier votre connexion internet
- Relancer la sync (elle retentera 3 fois)

### 🔴 "Sync réussie mais peu de données poussées"
**Cause**: Les données ont peut-être déjà été synchées
**Solution**:
- Vérifier dans Supabase que les données sont là
- Si oui: tout va bien! ✓
- Si non: Réinitialiser LAST_SYNC en base (avancé)

### 🔴 "User: Key (username)=(admin) already exists" (23505) + tables enfants ignorées
**Cause**: Chaque machine crée son compte `admin` avec un id aléatoire. Au push,
l'insertion par id entre en collision sur la contrainte unique `username`, et les
tables qui dépendent de `User` (Paiement, AnnulationRecu, Depense, AuditLog) sont
alors ignorées en cascade (« la table parente User a échoué »).
**Solution (corrigé automatiquement dans la version actuelle)**:
- Au **pull**, l'admin distant est fusionné dans la base locale : l'id local est
  remplacé par l'id distant et toutes ses références (paiements, dépenses,
  annulations, audit) sont réécrites automatiquement.
- Au **push**, l'admin est envoyé avec `on_conflict=username` (créé s'il
  manque, mis à jour sinon) — plus de 23505, et les tables enfants repartent.
- Les autres utilisateurs (non-admin) restent protégés : un username en double
  est signalé sans fusion automatique.

### 🔴 "Eleve : réponse illisible (page N) : error decoding response body"
**Cause**: Réponse volumineuse tronquée (coupure réseau / timeout du client).
**Solution (corrigé automatiquement dans la version actuelle)**:
- Timeout HTTP allongé à 180 s ; pages de pull réduites à 500 lignes.
- Si le décodage JSON échoue, la page est re-téléchargée (jusqu'à 3 tentatives)
  avant de signaler l'erreur. Le message inclut l'en-tête `Content-Range` pour
  localiser la page en cause.

### 🔴 Élèves « sans classe » / effectifs incomplets / paiements sans classe
**Cause**: des élèves ACTIF/INSCRIT n'ont aucune inscription `EleveClasse`
ACTIVE (héritage du bug « TRANSFERE fantôme » ou de données orphelines). Ils
disparaissent des effectifs de classe, du dashboard, de la classe affichée sur
les paiements et du détail élève.
**Solution**:
- Auto-réparation à chaque synchro : `repair_missing_active_enrollments`
  réactive l'inscription la plus récente d'un élève ACTIF/INSCRIT sans classe
  active (l'app ne connaît aucune opération qui laisse légitimement un élève
  ACTIF sans classe). Le push suivant propage la correction au cloud.
- Diagnostic complet (local + cloud) :
  ```bash
  python tools/diagnostic_sync.py            # local uniquement
  python tools/diagnostic_sync.py --cloud    # + comparaison Supabase
  ```
  (fermez SGFS-ME avant ; lecture seule, rien n'est modifié).

---

## 📋 Checklist Finale

Avant de déployer en production:

- [ ] ✅ Première sync complétée avec succès
- [ ] ✅ Données visibles dans Supabase
- [ ] ✅ Dashboard affiche les mêmes données
- [ ] ✅ Pas d'erreurs dans les logs
- [ ] ✅ Sync automatique (toutes les 10 min) fonctionne
- [ ] ✅ Tester une nouvelle saisie → sync automatique → visible en Supabase
- [ ] ✅ Configurer les backups Supabase (optionnel mais recommandé)

---

## 🛠️ Commandes Avancées (Terminal)

Si vous devez réinitialiser la dernière sync:

```rust
// Dans SQLite locale:
DELETE FROM ConfigSysteme WHERE cle = 'LAST_SYNC';
```

Puis relancer la sync (elle va tout resynchroniser).

---

## 📞 Support

Si la sync échoue:
1. Vérifier que Supabase est accessible
2. Vérifier que la clé API est correcte
3. Vérifier les logs de Supabase (Logs → Fonction Logs)
4. Réessayer

---

**Bon courage pour la synchronisation! 🎉**
