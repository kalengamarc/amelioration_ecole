#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Réactive les élèves TRANSFERE de la base locale SGFS-ME.

Usage (Windows, depuis le dossier du projet) :
    python tools/reactiver_eleves.py            # mode par défaut : uniquement
                                                # les TRANSFERE sans archivage documenté
    python tools/reactiver_eleves.py --all      # réactive TOUS les TRANSFERE
                                                # (y compris archivés manuellement)
    python tools/reactiver_eleves.py --dry-run  # affiche seulement (ne modifie rien)
    python tools/reactiver_eleves.py --db "C:\\chemin\\vers\\sgfs.db"  # base ailleurs

⚠️  FERMEZ l'application SGFS-ME avant d'exécuter ce script
    (la base est verrouillée tant que l'app tourne).
"""

import os
import sqlite3
import sys


def db_path() -> str:
    """Même chemin que src-tauri/src/db/mod.rs::get_db_path()."""
    if "--db" in sys.argv:
        return sys.argv[sys.argv.index("--db") + 1]
    if sys.platform.startswith("win"):
        base = os.environ.get("APPDATA", ".")
    else:
        base = os.environ.get("HOME", ".")
    return os.path.join(base, "SGFS-ME", "data", "sgfs.db")


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    all_transfere = "--all" in sys.argv

    path = db_path()
    if not os.path.exists(path):
        print(f"❌ Base introuvable : {path}")
        print("   Vérifiez que SGFS-ME a été lancé au moins une fois sur cette machine.")
        return 1

    print(f"📁 Base : {path}")
    try:
        conn = sqlite3.connect(path, timeout=5)
        conn.execute("PRAGMA busy_timeout=5000;")
    except sqlite3.Error as e:
        print(f"❌ Impossible d'ouvrir la base (l'app est-elle ouverte ?) : {e}")
        return 1

    # --- Comptage ---------------------------------------------------------
    total_transfere = conn.execute(
        "SELECT COUNT(*) FROM Eleve WHERE statut = 'TRANSFERE'"
    ).fetchone()[0]
    documentes = conn.execute(
        "SELECT COUNT(*) FROM AuditLog "
        "WHERE action='DELETE' AND entite IN ('eleve','Eleve') AND entite_id IS NOT NULL"
    ).fetchone()[0]

    print(f"🧑‍🎓 Élèves au statut TRANSFERE : {total_transfere}")
    if not all_transfere:
        print(f"   (dont {documentes} archivé(s) manuellement — resteront archivés en mode par défaut)")

    if total_transfere == 0:
        print("✅ Aucun élève à réactiver.")
        conn.close()
        return 0

    if dry_run:
        print("\n🔍 Mode dry-run : voici ce qui SERAIT fait (aucune modification).")
        if all_transfere:
            sql = "SELECT id, nom, prenom, matricule FROM Eleve WHERE statut='TRANSFERE'"
        else:
            sql = (
                "SELECT id, nom, prenom, matricule FROM Eleve WHERE statut='TRANSFERE' "
                "AND id NOT IN (SELECT entite_id FROM AuditLog "
                "WHERE action='DELETE' AND entite IN ('eleve','Eleve') AND entite_id IS NOT NULL)"
            )
        for row in conn.execute(sql):
            print(f"   ↳ {row[3]} — {row[1]} {row[2]}  ({row[0]})")
        conn.close()
        return 0

    # --- Réactivation -----------------------------------------------------
    now = "strftime('%Y-%m-%dT%H:%M:%SZ','now')"
    if all_transfere:
        sql = f"UPDATE Eleve SET statut='ACTIF', updated_at={now} WHERE statut='TRANSFERE'"
        label = "TOUS les élèves TRANSFERE"
    else:
        sql = (
            f"UPDATE Eleve SET statut='ACTIF', updated_at={now} WHERE statut='TRANSFERE' "
            "AND id NOT IN (SELECT entite_id FROM AuditLog "
            "WHERE action='DELETE' AND entite IN ('eleve','Eleve') AND entite_id IS NOT NULL)"
        )
        label = f"les élèves TRANSFERE SANS archivage documenté ({total_transfere - documentes} attendus)"

    print(f"\n🔄 Réactivation de {label} ...")
    try:
        cur = conn.execute(sql)
        conn.commit()
        print(f"✅ {cur.rowcount} élève(s) réactivé(s) en ACTIF.")
    except sqlite3.Error as e:
        print(f"❌ Erreur : {e}")
        conn.close()
        return 1

    # --- Récapitulatif ----------------------------------------------------
    restants = conn.execute(
        "SELECT COUNT(*) FROM Eleve WHERE statut='TRANSFERE'"
    ).fetchone()[0]
    actifs = conn.execute(
        "SELECT COUNT(*) FROM Eleve WHERE statut IN ('ACTIF','INSCRIT')"
    ).fetchone()[0]
    print(f"   → Reste TRANSFERE : {restants}")
    print(f"   → Actifs/Inscrits : {actifs}")

    print("\n💡 Astuce : à la prochaine synchronisation, ces élèves seront")
    print("   repoussés en ACTIF vers Supabase (convergence automatique).")
    print("   Si certains doivent rester archivés, utilisez le bouton 'Archiver' de l'app.")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
