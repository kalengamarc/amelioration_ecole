#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Diagnostic d'intégrité des données SGFS-ME (base locale + comparaison cloud).

But : comprendre pourquoi les effectifs (classe, dashboard, détail élève) sont
incomplets et pourquoi des élèves apparaissent « sans classe » / des paiements
sans classe. Le script vérifie les incohérences liées à EleveClasse, Eleve,
Classe et Paiement, localement puis (option) contre Supabase.

Usage (Windows, depuis le dossier du projet) :
    python tools/diagnostic_sync.py                # diagnostic local uniquement
    python tools/diagnostic_sync.py --cloud        # + comparaison avec Supabase
                                                   #   (lit SUPABASE_URL/KEY dans ConfigSysteme)
    python tools/diagnostic_sync.py --db "C:\\chemin\\vers\\sgfs.db"

⚠️  FERMEZ l'application SGFS-ME avant d'exécuter ce script
    (la base est verrouillée tant que l'app tourne).
    Le script ne modifie RIEN : lecture seule.
"""

import argparse
import json
import os
import sqlite3
import sys
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def default_db_path() -> str:
    """Même chemin que src-tauri/src/db/mod.rs::get_db_path()."""
    if sys.platform.startswith("win"):
        base = os.environ.get("APPDATA", ".")
    else:
        base = os.environ.get("HOME", ".")
    return os.path.join(base, "SGFS-ME", "data", "sgfs.db")


def q(conn, sql, params=()):
    """Exécute une requête et retourne toutes les lignes."""
    try:
        return conn.execute(sql, params).fetchall()
    except sqlite3.Error as e:
        return [("ERREUR", str(e))]


def q1(conn, sql, params=()):
    """Exécute une requête et retourne la première valeur (ou None)."""
    try:
        return conn.execute(sql, params).fetchone()[0]
    except Exception:
        return None


def section(title):
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def cloud_credentials(conn):
    url = q1(conn, "SELECT valeur FROM ConfigSysteme WHERE cle='SUPABASE_URL'") or ""
    key = q1(conn, "SELECT valeur FROM ConfigSysteme WHERE cle='SUPABASE_KEY'") or ""
    url = url.strip().rstrip("/")
    if not url.startswith("http"):
        url = "https://" + url
    return url, key


def fetch_all_rows(url, key, table, select_cols, page_size=500, max_pages=200):
    """Récupère toutes les lignes d'une table Supabase via Range pagination."""
    rows = []
    offset = 0
    for _ in range(max_pages):
        req = urllib.request.Request(
            f"{url}/rest/v1/{table}?select={select_cols}",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Range": f"{offset}-{offset + page_size - 1}",
                "Range-Unit": "items",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                chunk = json.loads(resp.read().decode("utf-8", errors="replace"))
        except Exception as e:
            print(f"  ⚠️  Erreur réseau sur {table} (offset {offset}) : {e}")
            return None
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description="Diagnostic d'intégrité SGFS-ME (lecture seule).")
    ap.add_argument("--db", help="Chemin de la base SQLite (défaut : %APPDATA%\\SGFS-ME\\data\\sgfs.db)")
    ap.add_argument("--cloud", action="store_true", help="Compare aussi avec Supabase")
    args = ap.parse_args()

    path = args.db or default_db_path()
    if not os.path.exists(path):
        print(f"❌ Base introuvable : {path}")
        print("   Vérifiez que SGFS-ME a été lancé au moins une fois sur cette machine.")
        return 1
    print(f"📁 Base locale : {path}")

    try:
        conn = sqlite3.connect(path, timeout=5)
        conn.execute("PRAGMA busy_timeout=5000;")
    except sqlite3.Error as e:
        print(f"❌ Impossible d'ouvrir la base (l'app est-elle ouverte ?) : {e}")
        return 1

    # =====================================================================
    # 1. VUE D'ENSEMBLE
    # =====================================================================
    section("1. Vue d'ensemble (local)")
    for label, sql in [
        ("Élèves (total)", "SELECT COUNT(*) FROM Eleve"),
        ("  → ACTIF", "SELECT COUNT(*) FROM Eleve WHERE statut='ACTIF'"),
        ("  → INSCRIT", "SELECT COUNT(*) FROM Eleve WHERE statut='INSCRIT'"),
        ("  → TRANSFERE", "SELECT COUNT(*) FROM Eleve WHERE statut='TRANSFERE'"),
        ("  → autres statuts", "SELECT COUNT(*) FROM Eleve WHERE statut NOT IN ('ACTIF','INSCRIT','TRANSFERE')"),
        ("Inscriptions EleveClasse (total)", "SELECT COUNT(*) FROM EleveClasse"),
        ("  → ACTIF", "SELECT COUNT(*) FROM EleveClasse WHERE statut='ACTIF'"),
        ("  → TRANSFERE", "SELECT COUNT(*) FROM EleveClasse WHERE statut='TRANSFERE'"),
        ("Classes (actives)", "SELECT COUNT(*) FROM Classe WHERE actif=1"),
        ("Paiements (total)", "SELECT COUNT(*) FROM Paiement"),
        ("Établissements (actifs)", "SELECT COUNT(*) FROM Etablissement WHERE actif=1"),
    ]:
        print(f"  {label:<38} {q1(conn, sql)}")

    # =====================================================================
    # 2. ÉLÈVES ACTIFS/INSCRITS SANS AUCUNE INSCRIPTION
    # =====================================================================
    section("2. Élèves ACTIF/INSCRIT sans AUCUNE inscription (ni ACTIF ni TRANSFERE)")
    rows = q(
        conn,
        "SELECT e.id, e.matricule, e.nom, e.prenom, e.statut, e.annee_scolaire_id "
        "FROM Eleve e WHERE e.statut IN ('ACTIF','INSCRIT') "
        "AND NOT EXISTS (SELECT 1 FROM EleveClasse ec WHERE ec.eleve_id = e.id) "
        "ORDER BY e.nom, e.prenom",
    )
    print(f"  ➜ {len(rows)} élève(s) — ces élèves n'apparaîtront dans AUCUNE classe "
          f"et leur paiement affichera « — » comme classe.")
    for r in rows[:25]:
        print(f"    - {r[2]} {r[3]} (matricule {r[1]}, statut {r[4]}, annee {r[5]})")
    if len(rows) > 25:
        print(f"    … et {len(rows) - 25} autres (voir SyncLog/rapport complet)")

    # =====================================================================
    # 3. ÉLÈVES ACTIFS/INSCRITS AVEC INSCRIPTIONS MAIS AUCUNE ACTIVE
    # =====================================================================
    section("3. Élèves ACTIF/INSCRIT dont les inscriptions sont TOUTES TRANSFERE")
    rows = q(
        conn,
        "SELECT e.id, e.matricule, e.nom, e.prenom, e.statut, "
        "       ec.classe_id, c.nom, ec.date_sortie "
        "FROM Eleve e "
        "JOIN EleveClasse ec ON ec.eleve_id = e.id AND ec.statut = 'TRANSFERE' "
        "LEFT JOIN Classe c ON c.id = ec.classe_id "
        "WHERE e.statut IN ('ACTIF','INSCRIT') "
        "AND NOT EXISTS (SELECT 1 FROM EleveClasse ec2 WHERE ec2.eleve_id = e.id AND ec2.statut = 'ACTIF') "
        "ORDER BY e.nom, e.prenom",
    )
    print(f"  ➜ {len(rows)} inscription(s) TRANSFERE pour des élèves encore ACTIF/INSCRIT "
          f"et sans inscription ACTIF (cause possible : bug « TRANSFERE fantôme »).")
    seen = set()
    for r in rows[:30]:
        key = r[0]
        if key in seen:
            continue
        seen.add(key)
        print(f"    - {r[2]} {r[3]} (matricule {r[1]}) → classe {r[6] or r[5]} (sortie {r[7]})")
    if len(seen) > 30:
        print(f"    … et {len(seen) - 30} autres élèves")

    # =====================================================================
    # 3b. ÉLÈVES DONT L'INSCRIPTION ACTIF EST DANS UNE AUTRE ANNÉE
    # =====================================================================
    section("3b. Élèves dont l'inscription ACTIF est dans une autre année")
    rows = q(
        conn,
        "SELECT e.id, e.matricule, e.nom, e.prenom, e.statut, "
        "       c.nom, c.annee_scolaire_id, e.annee_scolaire_id "
        "FROM Eleve e "
        "JOIN EleveClasse ec ON ec.eleve_id = e.id AND ec.statut = 'ACTIF' "
        "JOIN Classe c ON c.id = ec.classe_id "
        "WHERE e.statut IN ('ACTIF','INSCRIT') "
        "AND c.annee_scolaire_id <> e.annee_scolaire_id "
        "ORDER BY e.nom, e.prenom",
    )
    print(f"  ➜ {len(rows)} élève(s) ACTIF/INSCRIT dont la classe ACTIF est dans une "
          f"AUTRE année scolaire que leur fiche (cas « changement d'année »).")
    for r in rows[:15]:
        print(f"    - {r[2]} {r[3]} ({r[1]}) → classe {r[5]} (année {r[6]}) mais fiche en année {r[7]}")

    # =====================================================================
    # 4. INSCRIPTIONS ORPHELINES
    # =====================================================================
    section("4. Inscriptions orphelines (parent absent)")
    n1 = q1(conn, "SELECT COUNT(*) FROM EleveClasse ec LEFT JOIN Eleve e ON e.id = ec.eleve_id WHERE e.id IS NULL")
    print(f"  ➜ {n1} inscription(s) EleveClasse dont l'élève n'existe pas dans Eleve")
    if n1:
        for r in q(
            conn,
            "SELECT ec.eleve_id, ec.classe_id, c.nom, ec.statut "
            "FROM EleveClasse ec LEFT JOIN Eleve e ON e.id = ec.eleve_id "
            "LEFT JOIN Classe c ON c.id = ec.classe_id "
            "WHERE e.id IS NULL LIMIT 15",
        )[:15]:
            print(f"    - eleve_id={r[0]} classe={r[2] or r[1]} statut={r[3]}")
    n2 = q1(conn, "SELECT COUNT(*) FROM EleveClasse ec LEFT JOIN Classe c ON c.id = ec.classe_id WHERE c.id IS NULL")
    print(f"  ➜ {n2} inscription(s) EleveClasse dont la classe n'existe pas dans Classe")
    n3 = q1(conn, "SELECT COUNT(*) FROM TuteurEleve te LEFT JOIN Eleve e ON e.id = te.eleve_id WHERE e.id IS NULL")
    print(f"  ➜ {n3} relation(s) TuteurEleve dont l'élève n'existe pas dans Eleve")

    # =====================================================================
    # 5. CLASSES ACTIVES SANS EFFECTIF
    # =====================================================================
    section("5. Classes actives sans aucun élève ACTIF/INSCRIT")
    rows = q(
        conn,
        "SELECT c.id, c.nom, c.annee_scolaire_id FROM Classe c WHERE c.actif = 1 "
        "AND NOT EXISTS (SELECT 1 FROM EleveClasse ec JOIN Eleve e ON e.id = ec.eleve_id "
        "                WHERE ec.classe_id = c.id AND ec.statut = 'ACTIF' "
        "                AND e.statut IN ('ACTIF','INSCRIT')) "
        "ORDER BY c.nom",
    )
    print(f"  ➜ {len(rows)} classe(s) active(s) sans effectif")
    for r in rows[:20]:
        print(f"    - {r[1]} (annee {r[2]})")
    if len(rows) > 20:
        print(f"    … et {len(rows) - 20} autres")

    # =====================================================================
    # 6. PAIEMENTS SANS CLASSE AFFICHABLE
    # =====================================================================
    section("6. Paiements (classe affichée « — » = élève sans inscription ACTIF)")
    n_missing = q1(
        conn,
        "SELECT COUNT(*) FROM Paiement p LEFT JOIN Eleve e ON e.id = p.eleve_id WHERE e.id IS NULL",
    )
    n_noactif = q1(
        conn,
        "SELECT COUNT(*) FROM Paiement p JOIN Eleve e ON e.id = p.eleve_id "
        "WHERE NOT EXISTS (SELECT 1 FROM EleveClasse ec WHERE ec.eleve_id = p.eleve_id AND ec.statut = 'ACTIF')",
    )
    print(f"  ➜ {n_missing} paiement(s) dont l'élève n'existe pas (élève supprimé ?)")
    print(f"  ➜ {n_noactif} paiement(s) dont l'élève n'a AUCUNE inscription ACTIF → classe « — »")
    if n_noactif:
        print("  Échantillon :")
        for r in q(
            conn,
            "SELECT p.numero_recu, e.matricule, e.nom, e.prenom, p.montant "
            "FROM Paiement p JOIN Eleve e ON e.id = p.eleve_id "
            "WHERE NOT EXISTS (SELECT 1 FROM EleveClasse ec WHERE ec.eleve_id = p.eleve_id AND ec.statut = 'ACTIF') "
            "ORDER BY p.created_at DESC LIMIT 15",
        )[:15]:
            print(f"    - reçu {r[0]} | {r[2]} {r[3]} ({r[1]}) | {r[4]}")

    # =====================================================================
    # 7. MATRICULES EN DOUBLE / ANOMALIES DIVERSES
    # =====================================================================
    section("7. Anomalies diverses (local)")
    dups = q(conn, "SELECT matricule, COUNT(*) c FROM Eleve GROUP BY matricule HAVING c > 1")
    print(f"  ➜ {len(dups)} matricule(s) en double : {dups[:10]}")
    multi = q(
        conn,
        "SELECT e.id, e.matricule, e.nom, e.prenom FROM Eleve e WHERE e.statut IN ('ACTIF','INSCRIT') "
        "AND (SELECT COUNT(*) FROM EleveClasse ec WHERE ec.eleve_id = e.id AND ec.statut = 'ACTIF') > 1",
    )
    print(f"  ➜ {len(multi)} élève(s) ACTIF/INSCRIT avec PLUSIEURS inscriptions ACTIF "
          f"(anomalie : un seul ACTIF autorisé) : {[(r[1], r[2], r[3]) for r in multi[:10]]}")
    date_na = q1(conn, "SELECT COUNT(*) FROM Eleve WHERE date_naissance IS NULL OR date_naissance = ''")
    print(f"  ➜ {date_na} élève(s) sans date de naissance (non bloquant)")

    # =====================================================================
    # 8. COMPARAISON CLOUD (--cloud)
    # =====================================================================
    if args.cloud:
        url, key = cloud_credentials(conn)
        if not url or not key or "supabase" not in url:
            print("\n❌ URL/KEY Supabase introuvables ou invalides dans ConfigSysteme — mode cloud ignoré.")
        else:
            section("8. Comparaison cloud (Supabase)")
            print(f"  Projet : {url}")
            cloud_eleves = fetch_all_rows(url, key, "Eleve", "id,statut")
            cloud_ec = fetch_all_rows(url, key, "EleveClasse", "eleve_id,classe_id,statut")
            if cloud_eleves is None or cloud_ec is None:
                print("  ⚠️  Récupération cloud incomplète — comparaison partielle.")
            else:
                cloud_eleve_ids = {r["id"] for r in cloud_eleves}
                cloud_actifs = [r for r in cloud_eleves if r.get("statut") in ("ACTIF", "INSCRIT")]
                cloud_ec_actifs = [r for r in cloud_ec if r.get("statut") == "ACTIF"]
                cloud_ec_eleve_ids = {r["eleve_id"] for r in cloud_ec}
                cloud_ec_actif_eleve_ids = {r["eleve_id"] for r in cloud_ec_actifs}

                local_eleves = q1(conn, "SELECT COUNT(*) FROM Eleve") or 0
                local_actifs = q1(conn, "SELECT COUNT(*) FROM Eleve WHERE statut IN ('ACTIF','INSCRIT')") or 0
                local_ec = q1(conn, "SELECT COUNT(*) FROM EleveClasse") or 0
                local_ec_actifs = q1(conn, "SELECT COUNT(*) FROM EleveClasse WHERE statut='ACTIF'") or 0

                print(f"  Élèves cloud : {len(cloud_eleves)} (local : {local_eleves})  "
                      f"→ {'✅' if len(cloud_eleves) == local_eleves else '⚠️ écart'}")
                print(f"  Élèves ACTIF/INSCRIT cloud : {len(cloud_actifs)} (local : {local_actifs})")
                print(f"  EleveClasse cloud : {len(cloud_ec)} (local : {local_ec})")
                print(f"  EleveClasse ACTIF cloud : {len(cloud_ec_actifs)} (local : {local_ec_actifs})")

                # Orphelins côté cloud
                cloud_orphans = [r for r in cloud_ec if r["eleve_id"] not in cloud_eleve_ids]
                print(f"  ➜ {len(cloud_orphans)} inscription(s) cloud dont l'élève n'existe pas côté cloud")
                for r in cloud_orphans[:10]:
                    print(f"      - eleve_id={r['eleve_id']} classe_id={r['classe_id']} statut={r.get('statut')}")

                # Élèves cloud actifs sans inscription ACTIF
                cloud_no_actif = [r for r in cloud_actifs if r["id"] not in cloud_ec_actif_eleve_ids]
                cloud_no_any = [r for r in cloud_actifs if r["id"] not in cloud_ec_eleve_ids]
                print(f"  ➜ {len(cloud_no_actif)} élève(s) cloud ACTIF/INSCRIT sans inscription ACTIF "
                      f"(dont {len(cloud_no_any)} sans aucune inscription)")
                print(f"      (à comparer avec les sections 2 et 3 du diagnostic local)")

    conn.close()
    print()
    print("✅ Diagnostic terminé (lecture seule, rien n'a été modifié).")
    print("   Collez cette sortie dans la conversation pour analyser l'état des données.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
