# Annexe B — Aide-mémoire

## B.1 Commandes du projet

```bash
bun install                 # dépendances
bun run dev                 # Next.js seul (UI)
bun run tauri dev           # application de bureau
bun run build               # export statique → out/
bun run tauri build         # installateur
bun run lint                # ESLint
npx tsc --noEmit            # vérification des types
cd src-tauri && cargo check # compilation rapide Rust
cd src-tauri && cargo test  # tests
cd src-tauri && cargo clippy
```

## B.2 TypeScript / React

```ts
// état
const [x, setX] = useState<T>(initial)
const memo = useMemo(() => calcul(a), [a])
const cb = useCallback(() => faire(a), [a])
useEffect(() => { … ; return cleanup }, [deps])

// asynchrone
const res = await tc.listEleves({ page: 1 })
if (res?.success === false) throw new Error(res.error)

// types utiles
type Statut = 'ACTIF' | 'INSCRIT' | 'SUSPENDU' | 'TRANSFERE'
type Option = { id: string; nom: string }
Record<string, number>
Partial<T>, Pick<T, 'id'>, Omit<T, 'id'>

// narrowing
function f(x?: string | null) {
  if (!x) return        // x est string après
}

// liste
items.map((i) => <Row key={i.id} item={i} />)
```

## B.3 Rust (l'essentiel du projet)

```rust
// types
let n: i64 = 0;
let mut s = String::from("x");
let opt: Option<String> = None;
let res: Result<Value, AppError> = Ok(json!({"a": 1}));

// ? propage l'erreur
let conn = db.lock()?;

// Option
if let Some(v) = opt { … }
let n = opt.map(|v| v.len()).unwrap_or(0);

// Result
match res { Ok(v) => v, Err(e) => return Err(e) }

// struct sérialisée en camelCase
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Foo { pub etablissement_id: String }

// requête
let total: i64 = conn.query_row("SELECT COUNT(*) FROM Eleve WHERE statut = ?1",
                                params!["ACTIF"], |r| r.get(0))?;

// plusieurs lignes
let mut stmt = conn.prepare("SELECT id, nom FROM Classe")?;
let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
for row in rows { let (id, nom) = row?; }

// écriture
conn.execute("INSERT INTO X (id) VALUES (?1)", params![id])?;

// transaction
let mut conn = db.lock()?;
let tx = conn.transaction()?;
tx.execute("…", params![…])?;
tx.commit()?;

// itérateurs
let total: f64 = montants.iter().sum();
let ids: Vec<String> = eleves.iter().filter(|e| e.actif).map(|e| e.id.clone()).collect();
```

## B.4 SQL utile (SQLite)

```sql
-- créer / indexer
CREATE TABLE IF NOT EXISTS T (id TEXT PRIMARY KEY, ...);
CREATE INDEX IF NOT EXISTS idx_t_champ ON T(champ);
CREATE UNIQUE INDEX IF NOT EXISTS idx_t_actif ON T(ref) WHERE statut = 'ACTIF';

-- lire
SELECT * FROM Eleve WHERE nom LIKE '%ali%' ORDER BY nom LIMIT 20 OFFSET 0;
SELECT COUNT(*) FROM Echeance WHERE statut = 'EN_ATTENTE';

-- joindre / agréger
SELECT e.nom, SUM(ec.montant_du - ec.montant_paye) AS reste
FROM Echeance ec JOIN Eleve e ON e.id = ec.eleve_id
GROUP BY e.id HAVING reste > 0 ORDER BY reste DESC;

-- dates
SELECT date('now'), strftime('%Y-%m', created_at), date('now','-30 day');

-- upsert
INSERT INTO T (id, x) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET x = excluded.x;

-- maintenance
PRAGMA foreign_keys = ON;
PRAGMA integrity_check;
VACUUM;
VACUUM INTO '/tmp/sauvegarde.db';
.backup '/tmp/sauvegarde.db'
```

## B.5 Tauri : les deux sens

```rust
// Rust
#[tauri::command]
pub fn ma_commande(db: State<'_, DbConn>, id: String) -> Result<Value, AppError> { … }
```

```rust
// lib.rs
commands::mon_module::ma_commande,
```

```ts
// TypeScript
export async function maCommande(id: string) {
  return cmd('ma_commande', { id })
}
```

Correspondance des noms : `etablissement_id` (Rust) ⇄ `etablissementId` (argument JS).
Les clés d'objets **retournés** ne sont pas converties : utilisez
`#[serde(rename_all = "camelCase")]`.

## B.6 Git minimal

```bash
git status
git add -p
git commit -m "module: action"
git push origin arena/5c231ded-amelioration-ecole
git log --oneline -10
git diff
git checkout -b feat/x
```

## B.7 Diagnostiquer vite

| Symptôme | Première commande |
|---|---|
| écran vide | console WebView (`Ctrl+Shift+I`) |
| commande inconnue | `grep commande src-tauri/src/lib.rs` |
| données absentes | `sqlite3 sgfs.db "SELECT COUNT(*) FROM …"` |
| appli figée | chercher un `Mutex` verrouillé (deadlock) |
| sync échoue | `curl` sur l'endpoint + `validate_sync_ready` |
| build échoue | lire la **première** erreur, pas la dernière |
| types cassés | `npx tsc --noEmit` puis aller à la première ligne |
