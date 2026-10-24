# Annexe A — Glossaire

## A.1 Métier

**Année scolaire** — Période d'enseignement (ex. 2025-2026). Une seule est active par
établissement ; les données financières y sont rattachées.

**Échéance** — Montant qu'un élève donné doit pour un frais donné. Porte `montant_du`,
`montant_paye` et un statut calculé.

**Encaissement / Paiement** — Reçu enregistré pour un élève. Ne se supprime jamais ; peut
être annulé.

**Frais scolaire** — Montant à payer (minerval, inscription, annexe), éventuellement
limité à certaines classes.

**Imputation (montant affecté)** — Partie d'un paiement affectée à une échéance, dans la
devise de celle-ci.

**Minerval** — Frais de scolarité principal, souvent payé par tranches.

**Recouvrement** — Part du dû effectivement encaissé.

**Tuteur** — Responsable légal de l'élève, joignable en cas d'impayé.

**Trop-perçu** — Montant payé supérieur au dû ; doit être refusé ou crédité selon la
politique de l'école.

## A.2 Web et front-end

**Composant** — Fonction React retournant du JSX, réutilisable et paramétrable.

**État (state)** — Donnée qui, lorsqu'elle change, provoque un nouveau rendu.

**Hook** — Fonction React (`useState`, `useEffect`, `useMemo`, `useCallback`) qui ajoute
un comportement à un composant.

**Hydratation** — Processus par lequel React attache ses événements au HTML rendu. Absente
en export statique côté Tauri (tout est client).

**JSX / TSX** — Syntaxe mêlant balisage et JavaScript/TypeScript.

**Props** — Paramètres reçus par un composant.

**Rendu conditionnel** — Affichage selon une condition (`loading ? … : …`).

**shadcn/ui** — Collection de composants copiés dans le dépôt, basés sur Radix et
Tailwind.

**Tailwind CSS** — Framework de classes utilitaires ; chaque classe applique un style.

**Zustand** — Bibliothèque d'état global, simple et persistable.

## A.3 Desktop, Rust, Tauri

**Cargo** — Gestionnaire de paquets et compilateur de Rust.

**Clé étrangère (FK)** — Contrainte garantissant qu'une référence pointe vers une ligne
existante.

**Commande Tauri** — Fonction Rust annotée `#[tauri::command]`, appelable depuis la
WebView via `invoke`.

**IPC** — Communication entre la WebView et le cœur Rust.

**Mutex** — Verrou garantissant un accès exclusif (ici à la connexion SQLite).

**`Option<T>`** — Type représentant une valeur présente (`Some`) ou absente (`None`).

**`Result<T, E>`** — Type représentant un succès (`Ok`) ou une erreur (`Err`).

**`?`** — Opérateur propageant une erreur.

**`serde`** — Bibliothèque de sérialisation/désérialisation (JSON).

**`State`** — Accès, dans une commande, aux données gérées par l'application
(`app.manage`).

**Tauri** — Cadre d'application de bureau utilisant la WebView du système et un cœur Rust.

**WebView** — Moteur de rendu HTML du système (WebView2, WebKitGTK, WKWebView).

## A.4 Données et synchronisation

**Clé primaire** — Identifiant unique d'une ligne.

**Index** — Structure accélérant les recherches, au prix de l'espace et des écritures.

**Index unique partiel** — Index unique ne s'appliquant qu'aux lignes respectant une
condition (`WHERE statut='ACTIF'`).

**Migration** — Script transformant un schéma d'une version à la suivante.

**Offline-first** — Conception où l'application fonctionne sans réseau et synchronise
ensuite.

**PostgREST** — Couche REST automatique au-dessus de PostgreSQL (utilisée par Supabase).

**Pull / Push** — Rapatriement depuis le cloud / envoi vers le cloud.

**RLS (Row Level Security)** — Politiques PostgreSQL restreignant les lignes accessibles
par utilisateur.

**Upsert** — Insertion ou mise à jour si la ligne existe déjà.

**WAL** — *Write-Ahead Logging* : mode SQLite plus performant, produisant des fichiers
`-wal` et `-shm`.

## A.5 Qualité et production

**Audit log** — Journal horodaté des actions sensibles, attribuées à un utilisateur.

**CI (intégration continue)** — Exécution automatique des vérifications à chaque
modification.

**Debounce** — Retarder une action jusqu'à ce qu'un délai se soit écoulé sans nouvel
événement.

**Dette technique** — Coût futur d'un raccourci pris aujourd'hui.

**Fail-open / fail-closed** — Comportement par défaut en cas d'absence d'information
(permissif / restrictif).

**Idempotence** — Propriété d'une opération qui, répétée, produit le même résultat.

**Race condition** — Bug dû à l'ordre imprévisible d'opérations concurrentes.

**Transaction** — Groupe d'écritures appliquées entièrement ou pas du tout.
