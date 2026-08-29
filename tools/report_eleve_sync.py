import os
import sqlite3

path = os.path.join(os.environ.get("APPDATA", "."), "SGFS-ME", "data", "sgfs.db")
conn = sqlite3.connect(path)
conn.row_factory = sqlite3.Row

print("DB", path)
print("ELEVE_TOTAL", conn.execute("SELECT COUNT(*) FROM Eleve").fetchone()[0])
print("ELEVE_BY_STATUT")
for row in conn.execute("SELECT statut, COUNT(*) AS n FROM Eleve GROUP BY statut ORDER BY statut"):
    print(dict(row))
print("ELEVE_BAD_ETABLISSEMENT", conn.execute("SELECT COUNT(*) FROM Eleve e LEFT JOIN Etablissement x ON x.id=e.etablissement_id WHERE x.id IS NULL").fetchone()[0])
print("ELEVE_BAD_ANNEE", conn.execute("SELECT COUNT(*) FROM Eleve e LEFT JOIN AnneeScolaire a ON a.id=e.annee_scolaire_id WHERE e.annee_scolaire_id IS NOT NULL AND a.id IS NULL").fetchone()[0])
print("ELEVE_DUPLICATE_MATRICULE", conn.execute("SELECT COUNT(*) FROM (SELECT matricule FROM Eleve GROUP BY matricule HAVING COUNT(*) > 1)").fetchone()[0])
print("SYNCS_ELEVE")
for row in conn.execute("SELECT table_name, status, details, created_at FROM SyncLog WHERE table_name IN ('Eleve','ORPHANS') ORDER BY created_at DESC LIMIT 10"):
    print(dict(row))
print("LAST_SYNC_KEYS")
for row in conn.execute("SELECT cle, valeur FROM ConfigSysteme WHERE cle LIKE 'LAST_SYNC%' ORDER BY cle"):
    print(dict(row))
conn.close()
