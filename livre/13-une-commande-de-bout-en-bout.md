# 13. Une commande de bout en bout

Ce chapitre est un guide de réalisation. Objectif : écrire (ou réécrire proprement) une
commande complète, depuis le bouton jusqu'à la ligne SQLite.

Nous prenons `create_paiement`, la commande la plus sensible du projet.

## 13.1 Le cahier des charges

> **Encaisser un paiement** : étant donné un élève, éventuellement une échéance, un
> montant, une devise et un caissier, créer un reçu numéroté, mettre à jour l'échéance,
> journaliser l'opération, renvoyer le reçu complet.

Contraintes métier :

1. l'élève doit exister et être actif dans un établissement actif ;
2. le montant doit être strictement positif ;
3. le reçu doit porter un numéro unique ;
4. l'échéance, si fournie, doit appartenir au même élève ;
5. le montant payé de l'échéance ne doit pas dépasser le dû (ou l'excédent doit être
   signalé) ;
6. l'opération doit être atomique ;
7. elle doit être auditée.

## 13.2 Ce que fait le code actuel

Résumé fidèle de `create_paiement` (`commands/encaissements.rs`) :

```rust
let conn = db.lock()?;
let now = now_iso();
let id = generate_id();
let numero_recu = generate_receipt_number(&conn);

// 1. l'élève existe-t-il ?
if !eleve_exists { return Err(AppError::Validation("L'élève sélectionné n'existe pas…")) }

// 2. établissement valide, sinon repli sur le premier
let etab_id = if etab_existe { etablissement_id } else { premier_etablissement() };

// 3. année valide, sinon année active, sinon n'importe quelle année, sinon création
//    d'une année 2026-2027 codée en dur (!)

// 4. l'élève peut-il payer ? (ACTIF/INSCRIT + établissement actif)
if !peut_payer { return Err(AppError::Validation("Paiement impossible : …")) }

// 5. utilisateur valide, sinon premier utilisateur, sinon "admin"
// 6. échéance valide, sinon None
// 7. INSERT Paiement
// 8. UPDATE Echeance SET montant_paye = montant_paye + montant_affecte
// 9. drop(conn); log_audit(...)
// 10. relecture complète avec jointures → réponse JSON
```

### Ce qui est bien

- les messages d'erreur sont en français et **actionnables** ;
- la validation de l'éligibilité au paiement est faite en SQL ;
- l'audit est écrit après libération du verrou (pas de deadlock) ;
- la réponse renvoie l'objet complet joint (élève, classe, caissier) : le front n'a pas
  besoin d'un second appel.

### Ce qui doit être corrigé

| Problème | Risque | Correction |
|---|---|---|
| pas de transaction | reçu sans mise à jour d'échéance si crash | `conn.transaction()` |
| `montant` non validé (> 0) | reçu de 0 ou négatif | `AppError::Validation` |
| année codée en dur `2026-09-01` | données fausses | refuser l'encaissement sans année |
| repli silencieux sur un autre établissement | paiement imputé au mauvais établissement | erreur explicite |
| échéance non vérifiée comme appartenant à l'élève | imputation croisée | `WHERE id=? AND eleve_id=?` |
| dépassement non contrôlé | solde négatif | comparer `montant_paye + affecte <= du` |
| numéro de reçu non atomique | collision `UNIQUE` | séquence + transaction |

> 🧠 **Repli silencieux = bug garanti.** Quand une donnée obligatoire est invalide,
> l'application doit s'arrêter avec un message clair, pas deviner. Le repli est
> éventuellement acceptable pour l'affichage, jamais pour l'écriture comptable.

## 13.3 La version cible, pas à pas

### Étape 1 — Signature et validation d'entrée

```rust
#[tauri::command]
pub fn create_paiement(
    db: State<'_, DbConn>,
    eleve_id: String,
    echeance_id: Option<String>,
    etablissement_id: String,
    annee_scolaire_id: Option<String>,
    user_id: String,
    motif: String,
    montant: f64,
    devise: String,
    montant_affecte: Option<f64>,
    devise_echeance: Option<String>,
    mode_paiement: String,
    reference_paiement: Option<String>,
    taux_change: Option<f64>,
    montant_original: Option<f64>,
) -> Result<serde_json::Value, AppError> {
    // ── Validation pure (aucune I/O) ──────────────────────────────
    if montant <= 0.0 || !montant.is_finite() {
        return Err(AppError::Validation("Le montant doit être supérieur à zéro.".into()));
    }
    if !["ESPECES", "MOBILE_MONEY", "BANQUE", "CHEQUE"].contains(&mode_paiement.as_str()) {
        return Err(AppError::Validation("Mode de paiement inconnu.".into()));
    }
    let affecte = montant_affecte.unwrap_or(montant);
    if affecte < 0.0 || !affecte.is_finite() {
        return Err(AppError::Validation("Montant affecté invalide.".into()));
    }
    // …
}
```

> 🧠 **Validez d'abord, interrogez ensuite.** Les règles pures (signe, liste de valeurs,
> longueur) ne nécessitent pas la base : elles échouent vite et se testent sans SQLite.

### Étape 2 — Ouvrir une transaction et vérifier les références

```rust
    let mut conn = db.lock()?;
    let tx = conn.transaction()?;
    let now = now_iso();

    let (statut_eleve, etab_eleve): (String, String) = tx.query_row(
        "SELECT e.statut, e.etablissement_id FROM Eleve e WHERE e.id = ?1",
        params![eleve_id], |r| Ok((r.get(0)?, r.get(1)?)),
    ).map_err(|_| AppError::NotFound("Élève introuvable en base locale.".into()))?;

    if !["ACTIF", "INSCRIT"].contains(&statut_eleve.as_str()) {
        return Err(AppError::Validation(format!(
            "L'élève est « {} » : aucun encaissement possible.", statut_eleve)));
    }
    if etab_eleve != etablissement_id {
        return Err(AppError::Validation(
            "L'établissement du paiement ne correspond pas à celui de l'élève.".into()));
    }
```

### Étape 3 — Échéance et contrôle de dépassement

```rust
    let mut echeance: Option<(String, f64, f64)> = None;   // (id, dû, payé)
    if let Some(ref eid) = echeance_id {
        echeance = Some(tx.query_row(
            "SELECT id, montant_du, montant_paye FROM Echeance
             WHERE id = ?1 AND eleve_id = ?2",
            params![eid, eleve_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).map_err(|_| AppError::Validation(
            "Échéance introuvable ou n'appartenant pas à cet élève.".into()))?);
    }

    if let Some((_, du, paye)) = &echeance {
        let nouveau = paye + affecte;
        if nouveau > du + 0.01 {
            return Err(AppError::Validation(format!(
                "Le paiement dépasse le solde : dû {:.0}, déjà payé {:.0}, reste {:.0}.",
                du, paye, du - paye)));
        }
    }
```

### Étape 4 — Numéro de reçu sous transaction

```rust
    let jour = chrono::Local::now().format("%Y%m%d").to_string();
    let seq: i64 = tx.query_row(
        "SELECT COALESCE(MAX(CAST(substr(numero_recu, -4) AS INTEGER)), 0) + 1
         FROM Paiement WHERE numero_recu LIKE ?1",
        params![format!("REC-{}-%", jour)], |r| r.get(0),
    )?;
    let numero_recu = format!("REC-{}-{:04}", jour, seq);
```

Sous transaction, deux caissiers sur la même installation ne peuvent pas obtenir le même
numéro. (Sur deux installations distinctes, la synchronisation devra réconcilier :
exercice 17.4.)

### Étape 5 — Écritures

```rust
    let id = generate_id();
    tx.execute(
        "INSERT INTO Paiement (id, numero_recu, eleve_id, echeance_id, etablissement_id,
                               annee_scolaire_id, user_id, motif, montant, devise,
                               montant_affecte, devise_echeance, mode_paiement,
                               reference_paiement, taux_change, montant_original,
                               annule, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, 0, ?17, ?17)",
        params![id, numero_recu, eleve_id, echeance.as_ref().map(|e| &e.0),
                etablissement_id, annee_scolaire_id, user_id, motif, montant, devise,
                affecte, devise_echeance.unwrap_or_else(|| devise.clone()),
                mode_paiement, reference_paiement, taux_change, montant_original, now],
    )?;

    if let Some((eid, du, paye)) = &echeance {
        let nouveau = paye + affecte;
        let (statut, date_complete) = if nouveau >= du - 0.01 {
            ("PAYE", Some(now.clone()))
        } else {
            ("PARTIELLEMENT_PAYE", None)
        };
        tx.execute(
            "UPDATE Echeance SET montant_paye = ?1, statut = ?2,
                    date_paiement_complet = COALESCE(?3, date_paiement_complet),
                    updated_at = ?4
             WHERE id = ?5",
            params![nouveau, statut, date_complete, now, eid],
        )?;
    }

    tx.commit()?;
```

> 🧠 **Pourquoi `>= du - 0.01` ?** Parce que les montants sont des `f64` : `0.1 + 0.2`
> ne vaut pas exactement `0.3`. Une tolérance de un centième évite les faux « partiel ».
> Le chapitre 14 traite ce sujet à fond.

### Étape 6 — Audit et réponse

```rust
    drop(conn);
    log_audit(&db, Some(&user_id), "CREATE", "paiement", Some(&id),
              Some(&format!("reçu={}, montant={} {}", numero_recu, montant, devise)));

    let conn = db.lock()?;
    let recu = fetch_recu_json(&conn, &id)?;
    Ok(api_response(Ok(recu)))
```

## 13.4 Côté front

```ts
// src/lib/tauri-commands.ts
export async function createPaiement(data: {
  eleveId: string; echeanceId?: string; etablissementId: string
  anneeScolaireId?: string; userId: string; motif: string
  montant: number; devise: string; montantAffecte?: number
  deviseEcheance?: string; modePaiement: string
  referencePaiement?: string; tauxChange?: number; montantOriginal?: number
}) {
  return cmd('create_paiement', {
    eleveId: data.eleveId,
    echeanceId: data.echeanceId ?? null,
    etablissementId: data.etablissementId,
    anneeScolaireId: data.anneeScolaireId ?? null,
    userId: data.userId,
    motif: data.motif,
    montant: data.montant,
    devise: data.devise,
    montantAffecte: data.montantAffecte ?? null,
    deviseEcheance: data.deviseEcheance ?? null,
    modePaiement: data.modePaiement,
    referencePaiement: data.referencePaiement ?? null,
    tauxChange: data.tauxChange ?? null,
    montantOriginal: data.montantOriginal ?? null,
  })
}
```

Dans l'écran : désactiver le bouton, appeler, afficher le reçu, vider le formulaire,
recharger la liste. En cas d'erreur : conserver la saisie (ne jamais vider un formulaire
sur échec — le caissier devrait tout retaper).

## 13.5 Tester la commande à la main

```bash
# 1. lancer en mode bureau
bun run tauri dev

# 2. dans la console du WebView (Ctrl+Shift+I)
await window.__TAURI_INTERNALS__.invoke('create_paiement', {
  eleveId: 'ID-EXISTANT', echeanceId: null, etablissementId: 'ID-ETAB',
  anneeScolaireId: null, userId: 'ID-USER', motif: 'Test manuel',
  montant: 1000, devise: 'BIF', montantAffecte: null, deviseEcheance: null,
  modePaiement: 'ESPECES', referencePaiement: null, tauxChange: null, montantOriginal: null
})
```

Puis vérifier en base :

```sql
SELECT numero_recu, montant, montant_affecte, devise, annule FROM Paiement ORDER BY created_at DESC LIMIT 1;
SELECT montant_du, montant_paye, statut FROM Echeance WHERE id = '…';
SELECT action, entite, details FROM AuditLog ORDER BY created_at DESC LIMIT 3;
```

> 🧠 **Test en trois temps** : réponse API, ligne métier, journal d'audit. Si les trois
> concordent, la commande est réellement correcte.

## 13.6 Exercices

> **Exercice 13.1** — Implémentez la commande manquante `create_echeances_bulk(frais_scolaire_id, annee_scolaire_id, eleve_ids)`
> qui crée une échéance pour chaque élève d'une classe concernée par le frais.
> Contraintes : transaction, `INSERT OR IGNORE` (à cause de `UNIQUE`), audit, retour du
> nombre créé. Enregistrez-la dans `lib.rs` et testez depuis `FraisPage.tsx`.

> **Exercice 13.2** — Ajoutez la validation du mode de paiement côté Rust **et** un
> `Select` fermé côté front. Pourquoi les deux sont-ils nécessaires ?

> **Exercice 13.3** — Transformez `create_eleve` en transaction. Provoquez une erreur au
> milieu (tuteur sans nom) et vérifiez qu'aucun élève n'est créé.

> **Exercice 13.4** — Remplacez `generate_receipt_number` par la version transactionnelle
> du §13.3, et ajoutez un test unitaire qui simule 100 encaissements et vérifie l'unicité.

> **Exercice 13.5** — Refusez un paiement sur une échéance déjà `PAYE`. Rédigez le message
> d'erreur en français, avec le reste à payer. Testez le cas « paiement partiel puis
> second paiement soldant ».

## 13.7 À retenir

- Valider d'abord les règles pures, puis interroger la base.
- Jamais de repli silencieux sur une écriture comptable.
- Une transaction pour le reçu + l'échéance + la séquence de numérotation.
- L'audit se fait **après** `drop(conn)`.
- Une réponse riche (jointures) évite un second aller-retour au front.
- Testez trois niveaux : réponse, base, audit.
