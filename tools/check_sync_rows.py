import os
import sqlite3

path = os.path.join(os.environ.get("APPDATA", "."), "SGFS-ME", "data", "sgfs.db")
student_id = "5c4d5bda-241e-452e-af95-8d8efb6fd6aa"
payment_id = "7c9346bd-c5ef-465c-9dae-5042fe58d3ee"

print(f"DB={path}")
conn = sqlite3.connect(path)
conn.row_factory = sqlite3.Row
for label, table, column, value in [
    ("ELEVE", "Eleve", "id", student_id),
    ("PAIEMENT", "Paiement", "id", payment_id),
]:
    row = conn.execute(f'SELECT * FROM "{table}" WHERE "{column}" = ?', (value,)).fetchone()
    print(label, "PRESENT" if row else "ABSENT")
    if row:
        print(label + "_KEYS", {k: row[k] for k in row.keys() if k.endswith("_id") or k == "id"})

payment = conn.execute('SELECT eleve_id, echeance_id, etablissement_id, annee_scolaire_id, user_id FROM Paiement WHERE id = ?', (payment_id,)).fetchone()
if payment:
    print("PAYMENT_FKS", {k: payment[k] for k in payment.keys()})
    for table, key in [("Etablissement", "etablissement_id"), ("AnneeScolaire", "annee_scolaire_id"), ("User", "user_id"), ("Echeance", "echeance_id")]:
        value = payment[key]
        if value:
            row = conn.execute(f'SELECT id FROM "{table}" WHERE id = ?', (value,)).fetchone()
            print(f"{table}({value})", "PRESENT" if row else "ABSENT")

print("PAYMENTS_FOR_FAILING_STUDENT")
for row in conn.execute('SELECT id, eleve_id FROM Paiement WHERE eleve_id = ?', (student_id,)).fetchall():
    print(dict(row))
print("CANCELLATIONS_FOR_FAILING_PAYMENT")
for row in conn.execute('SELECT id, paiement_id FROM AnnulationRecu WHERE paiement_id = ?', (payment_id,)).fetchall():
    print(dict(row))
conn.close()

