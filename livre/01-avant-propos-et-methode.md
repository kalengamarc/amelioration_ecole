# 1. Avant-propos : apprendre par projet

## 1.1 Pourquoi ce livre existe

On apprend à nager dans l'eau, pas dans un manuel. En programmation, la piscine s'appelle
**un projet réel** : du code imparfait, des contraintes de terrain, des choix à assumer,
des bugs à traquer. SGFS-ME est exactement cela : une application utilisée par un complexe
scolaire à Bujumbura pour encaisser des minervals, suivre des échéances et produire des
reçus. Ce n'est pas un exercice de style.

Ce livre a donc une promesse simple : **à la fin, vous serez capable de lire, modifier,
déboguer et étendre cette application**, et vous aurez acquis les gestes qui se
transposent à n'importe quel logiciel de gestion.

## 1.2 Ce que « apprendre correctement » veut dire

Beaucoup de tutoriels apprennent à *recopier*. Nous visons autre chose, organisé en
quatre niveaux :

1. **Lire** — comprendre un fichier que vous n'avez pas écrit.
2. **Expliquer** — dire pourquoi ce code est là, et ce qui casserait sans lui.
3. **Modifier** — ajouter une fonctionnalité sans effet de bord.
4. **Concevoir** — prendre une décision d'architecture et l'assumer.

Chaque chapitre travaille au moins deux de ces niveaux. Les exercices montent
progressivement du niveau 1 au niveau 4.

> 🧠 **La règle d'or du projet réel**
> Ne demandez jamais « comment on écrit ça en React ? » avant de vous demander
> « que doit-il se passer métier ? ». Le code n'est que la conséquence d'une règle.

Exemple concret tiré du projet : *un élève ne peut avoir qu'une seule inscription
active*. Cette phrase métier devient, au chapitre 12, un index SQL partiel :

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_eleve_classe_one_active_per_eleve
ON EleveClasse(eleve_id) WHERE statut = 'ACTIF';
```

La base de données **refuse** une deuxième inscription active, même si un bug du
front-end essaie d'en créer une. C'est ainsi qu'on écrit un logiciel fiable : la règle est
inscrite au niveau le plus bas possible.

## 1.3 La méthode en cinq gestes

Pour chaque fonctionnalité du projet, appliquez cette séquence. Elle reviendra dans tous
les chapitres.

### Geste 1 — Nommer les objets du métier

Un logiciel de scolarité manipule : `Etablissement`, `AnneeScolaire`, `Classe`, `Eleve`,
`Tuteur`, `FraisScolaire`, `Echeance`, `Paiement`, `Depense`, `User`, `AuditLog`.
Ces noms sont ceux du code, du SQL et de l'interface. Cette homogénéité n'est pas un
détail : elle réduit la charge mentale et évite les traductions approximatives.

### Geste 2 — Dessiner le trajet de la donnée

Avant d'écrire une ligne :

```text
Formulaire React → fonction tauri-commands → invoke('create_paiement')
→ commande Rust → validation → INSERT SQL → réponse JSON → toast + rafraîchissement
```

Si vous ne savez pas dessiner ce chemin, vous ne savez pas encore ce que vous codez.

### Geste 3 — Écrire le plus petit code qui marche

Dans ce projet, chaque écran est un assemblage de briques existantes :
un état local (`useState`), un appel de commande (`tc.listEleves`), une table, une
boîte de dialogue. On n'invente une brique que lorsqu'aucune ne convient.

### Geste 4 — Vérifier par l'observation

Lancez l'application, faites l'action, regardez la base :

```bash
# La base de développement sous Linux/macOS
ls ~/SGFS-ME/data/sgfs.db          # chemin réel utilisé par le code
```

Puis, avec `sqlite3` (ou un outil graphique comme DB Browser for SQLite) :

```sql
SELECT numero_recu, montant, devise, annule FROM Paiement ORDER BY created_at DESC LIMIT 5;
```

Une base de données ne ment pas. C'est votre premier outil de débogage.

### Geste 5 — Consigner ce qu'on a appris

Le dépôt contient `worklog.md` : un journal des tâches réalisées. Tenez le vôtre.
Dans trois mois, vous aurez oublié pourquoi cette condition existe ; le journal, non.

> ⚠️ **Piège réel du dépôt**
> `worklog.md` contient actuellement un mot de passe en clair. Nous y revenons au
> chapitre 21 (exercice 21.2) : un secret ne doit jamais entrer dans un dépôt Git.
> Prenez l'habitude de relire vos journaux avant de committer.

## 1.4 Prérequis et charge de travail

| Notion | Niveau attendu |
|---|---|
| HTML / CSS | savoir ce qu'est une boîte, une classe CSS |
| JavaScript | variables, fonctions, tableaux, objets |
| Ligne de commande | `cd`, `ls`, `git status`, `git commit` |
| Anglais technique | lecture de messages d'erreur |

Rust, React, SQL et Tauri sont enseignés dans le livre. Comptez **30 à 45 heures** pour
lire et faire les exercices, réparties selon le plan de l'annexe E.

## 1.5 Le contrat de lecture

Ce livre assume trois choses, et vous demande de les accepter :

1. **Le code du dépôt est la référence.** Si le livre et le code divergent, le code gagne.
   Le livre explique *pourquoi*, le code dit *comment*.
2. **Tout n'est pas parfait.** Le projet contient des dettes techniques assumées
   (sessions par identifiant, `any` par endroits, absence de tests automatisés).
   Les signaler et les corriger fait partie de l'apprentissage — c'est même le sujet des
   chapitres 19 à 22.
3. **On ne saute pas les erreurs.** Les chapitres 2, 18 et 20 contiennent des listes
   d'incidents réels. Les lire vous fera gagner des heures.

## 1.6 Premier contact avec le code

Avant le chapitre 2, faites ce mini-exercice d'observation (aucune installation).

> **Exercice 1.1 — Cartographier le dépôt**
> Ouvrez le dépôt et notez, sans chercher à comprendre :
> 1. le nombre de fichiers dans `src/components/sgfs/` ;
> 2. le nombre de fichiers `*.rs` dans `src-tauri/src/` ;
> 3. le nombre de composants dans `src/components/ui/`.
> Puis répondez : quelle partie du projet est « écrite à la main » et quelle partie est
> « du matériel standard » ?
>
> **Corrigé (annexe D)** : 14 écrans métier, 28 fichiers Rust, 48 composants UI.
> Les composants `ui/` sont des briques génériques générées par shadcn/ui : on les
> utilise, on ne les réécrit pas. Le code vraiment spécifique, celui qui porte la valeur,
> est ailleurs — et c'est là que vous allez travailler.

## 1.7 Ce que vous saurez faire à la fin

- Installer et lancer une application Tauri complète sur votre machine.
- Expliquer chaque étape entre un clic et un enregistrement SQLite.
- Écrire une commande Rust sécurisée (validation, transaction, audit).
- Ajouter un écran CRUD en React/TypeScript en respectant le style du projet.
- Diagnostiquer une synchronisation bloquée.
- Construire un installateur et poser un plan de mise à jour des données.

Passons à l'installation.
