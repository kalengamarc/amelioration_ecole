# 18. Déboguer la synchronisation

La synchronisation est la partie du logiciel qui échoue le plus souvent — et la plus
difficile à diagnostiquer, parce qu'elle mêle réseau, base locale, cloud, dépendances et
droits. Ce chapitre est un **manuel d'intervention**, à garder ouvert.

## 18.1 La méthode en cinq minutes

```text
1. Le statut      → Paramètres → Synchronisation → « Vérifier le statut »
2. La validation  → validate_sync_ready : quelles alertes ?
3. Le réseau      → la machine atteint-elle Supabase ?
4. La dernière erreur → logs (stderr) + message affiché
5. La donnée      → la ligne est-elle vraiment là, en local ? dans le cloud ?
```

> 🧠 **Ne relancez jamais une synchronisation en boucle sans avoir lu l'erreur.** Vous
> risquez de créer des doublons ou de saturer l'API (429).

## 18.2 Étape 1 — Le statut

```rust
#[tauri::command]
pub fn sync_status(db: State<'_, DbConn>) -> Result<Value, AppError> {
    // configured = URL non vide ET clé non vide
    // last_sync  = ConfigSysteme['LAST_SYNC']
}
```

Interprétation :

| Affichage | Signification | Action |
|---|---|---|
| `configured: false` | URL ou clé absente | Paramètres → Synchronisation |
| `last_sync: null` / « Jamais » | jamais synchronisé | première sync, prévoir du temps |
| `last_sync` très ancien | sync interrompue | lire les logs, valider |

## 18.3 Étape 2 — La validation préalable

`validate_sync_ready` produit une liste `issues`. Chaque message est une piste :

| Message | Cause | Correction |
|---|---|---|
| « Configuration Supabase incomplète » | URL/clé vide | ressaisir |
| « Table manquante : X » | base locale ancienne | relancer l'appli (le schéma se crée), sinon restaurer |
| « Aucune donnée locale » | base vide | créer école + année + élève |
| « échéances référencent des élèves ou frais inexistants » | orphelins | `clean` / réparation |
| « matricules dupliqués » | import sauvage | fusionner avant de pousser |
| « paiements orphelins » | suppression incohérente | annuler plutôt que supprimer |

> 🔧 Exécutez ces vérifications **avant** chaque synchronisation automatique : un
> `validate_sync_ready` en amont éviterait bien des erreurs 409.

## 18.4 Étape 3 — Tester le réseau sans l'application

```bash
# 1. la résolution et le certificat
curl -sS -o /dev/null -w "%{http_code}\n" https://xxxxx.supabase.co/rest/v1/

# 2. l'authentification et la table
curl -sS "https://xxxxx.supabase.co/rest/v1/Etablissement?select=id&limit=1" \
  -H "apikey: VOTRE_CLE" -H "Authorization: Bearer VOTRE_CLE"

# 3. l'écriture (test isolé, à supprimer ensuite)
curl -sS -X POST "https://xxxxx.supabase.co/rest/v1/ConfigSysteme?on_conflict=id" \
  -H "apikey: VOTRE_CLE" -H "Authorization: Bearer VOTRE_CLE" \
  -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
  -d '[{"id":"test-1","cle":"TEST","valeur":"ok"}]'
```

Codes HTTP et significations :

| Code | Signification | Piste |
|---|---|---|
| `200` / `206` | OK | — |
| `401` | clé invalide/expirée | régénérer la clé |
| `403` | RLS refuse | politique Supabase |
| `404` | table absente | exécuter `supabase_schema.sql` |
| `406` | `Accept`/colonnes incompatibles | vérifier les colonnes |
| `409` | conflit d'unicité | `on_conflict` incorrect |
| `413` | lot trop gros | réduire `push_batch_size` |
| `416` | plage `Range` invalide | normal : fin de pagination |
| `429` | trop de requêtes | attendre ; le code retente |
| `500+` | erreur serveur | retenter, consulter les logs Supabase |

## 18.5 Étape 4 — Lire les logs

Le moteur écrit sur `stderr` :

```rust
eprintln!("[SYNC] Récupéré {} élèves depuis le serveur", total_pulled);
eprintln!("[SYNC] Corrigé {} AuditLog avec user_id invalide", count);
```

Ils apparaissent dans le terminal qui a lancé `bun run tauri dev`. En production, ces
messages sont perdus : **ajoutez une journalisation persistante** (table `SyncLog` déjà
présente dans le schéma, exercice 17.3).

## 18.6 Les incidents typiques

### « Foreign key constraint violated »

```text
Cause : une ligne enfant (Paiement) référence un parent (Eleve) absent du cloud.
```

Le moteur tente de pousser le parent (`repair_missing_remote_parents`). Si cela échoue :

```sql
-- identifier les orphelins locaux
SELECT p.id, p.eleve_id FROM Paiement p
LEFT JOIN Eleve e ON e.id = p.eleve_id WHERE e.id IS NULL;
```

Correction : soit créer/synchroniser l'élève, soit réaffecter le paiement, soit archiver
la ligne.

### « UNIQUE constraint failed: Paiement.numero_recu »

```text
Cause : deux caisses ont produit le même numéro de reçu.
```

Vérifier :

```sql
SELECT numero_recu, COUNT(*) FROM Paiement GROUP BY numero_recu HAVING COUNT(*) > 1;
```

Correction : renommer le doublon local (avec audit) ou centraliser la numérotation.

### « Sync réussie mais rien n'est poussé »

Trois causes possibles :

1. `LAST_SYNC` est à jour et le pull ramène les mêmes lignes (normal) ;
2. les lignes sont **filtrées comme orphelines** (`filter_orphan_rows`) ;
3. les écritures ont eu lieu **après** le démarrage de la synchronisation.

Diagnostic :

```sql
SELECT cle, valeur FROM ConfigSysteme WHERE cle = 'LAST_SYNC';
```

et dans Supabase : `SELECT count(*) FROM "Paiement";`

### « La synchronisation prend 10 minutes »

Le pull rapatrie **toutes** les tables, page par page. Avec 50 000 paiements, cela fait
50 requêtes rien que pour cette table. Solutions : filtre `updated_at`, index côté
Supabase, et une politique de purge des vieilles années.

### « Hors ligne — données en attente » persistant

L'indicateur (`syncState === 'offline'`) reste affiché après une erreur. Vérifiez
`navigator.onLine`, puis le statut réel. L'erreur est volontairement silencieuse côté
interface : bonne idée pour ne pas inquiéter, mauvaise idée pour diagnostiquer.

## 18.7 Réinitialiser la synchronisation

Quand tout est bloqué et que vous avez une sauvegarde :

```sql
-- ⚠️ À faire uniquement sur une copie de sauvegarde
DELETE FROM ConfigSysteme WHERE cle = 'LAST_SYNC';
```

La prochaine synchronisation repart de `1970-01-01` : **tout** sera re-téléchargé et
re-poussé. Sur une grosse base, prévoyez plusieurs minutes et surveillez les doublons.

> ⚠️ **Avant toute manipulation** :
> ```bash
> sqlite3 ~/SGFS-ME/data/sgfs.db ".backup '/tmp/avant-reset.db'"
> ```

## 18.8 Un mode « simulation » utile

Pour tester sans réseau réel, ajoutez un drapeau dans `ConfigSysteme` :

```rust
let dry_run = conn.query_row(
    "SELECT valeur FROM ConfigSysteme WHERE cle = 'SYNC_DRY_RUN'", [],
    |r| r.get::<_, String>(0)).unwrap_or_else(|_| "false".into()) == "true";
```

Le moteur compte les lignes à envoyer sans les envoyer. Indispensable pour valider un
correctif sur une base de production **sans** écrire dans le cloud.

## 18.9 Exercices

> **Exercice 18.1** — Reproduisez un échec contrôlé : mettez une clé Supabase invalide,
> lancez la synchronisation, notez le message exact affiché et le code HTTP observé. Puis
> corrigez et documentez la procédure en cinq lignes.

> **Exercice 18.2** — Ajoutez une écriture dans `SyncLog` au début et à la fin de
> `run_bidirectional_sync` (table, poussés, tirés, durée, statut). Affichez les 20
> dernières entrées dans un panneau « Diagnostic ».

> **Exercice 18.3** — Implémentez le mode `SYNC_DRY_RUN`. Comparez le rapport simulé et
> le rapport réel sur la même base : quelles différences ? Pourquoi ?

> **Exercice 18.4** — Écrivez un script `tools/check_sync_rows.py` (le dépôt en contient
> un exemple) qui compare les compteurs locaux et distants table par table, et affiche un
> tableau. C'est l'outil que vous voudrez avoir le jour de l'incident.

## 18.10 À retenir

- Statut → validation → réseau → logs → données : toujours dans cet ordre.
- Les codes HTTP racontent l'histoire mieux que les messages de l'interface.
- Sauvegarder avant toute manipulation de `LAST_SYNC`.
- Un mode simulation est un investissement, pas un luxe.
- Persistez les logs de synchronisation : en production, le terminal n'existe plus.
