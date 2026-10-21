#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Génère les diagrammes UML du projet SGFS-ME pour le Complexe Scolaire AGAPE :
  1. Diagramme de classes        (diagramme-classes-agape.png / .svg / .pdf)
  2. Diagramme de cas d'utilisation (diagramme-cas-utilisation-agape.*)

Les diagrammes sont dessinés avec matplotlib (rendu vectoriel + PNG haute
définition). Les sources PlantUML équivalentes (*.puml, même dossier) restent
la référence complète (tous les attributs / toutes les associations).

Données tirées du code réel :
  - src-tauri/src/db/models.rs et src-tauri/src/db/mod.rs  (classes/attributs)
  - src-tauri/src/commands/*.rs                            (méthodes)
  - src/lib/store.ts, Sidebar.tsx, UtilisateursPage.tsx    (rôles/permissions)

Usage :  python3 generer_diagrammes.py
"""

import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import (
    Circle,
    Ellipse,
    FancyBboxPatch,
    Polygon,
    Rectangle,
)

OUT = Path(__file__).resolve().parent

# ----------------------------------------------------------------------------
# Palette AGAPE (bleu, voir worklog.md tache 9)
# ----------------------------------------------------------------------------
AGAPE = "#1e3a8a"        # bleu principal AGAPE
AGAPE_DARK = "#172554"   # bleu très foncé (textes)
AGAPE_LIGHT = "#eff6ff"  # fond des classes
AGAPE_MID = "#1d4ed8"    # bordures secondaires
AGAPE_SOFT = "#dbeafe"   # fond acteurs / packages
ENUM_BG = "#fffbeb"
ENUM_HD = "#f59e0b"
ENUM_BD = "#d97706"
NOTE_BG = "#fef9c3"
NOTE_BD = "#ca8a04"
GREY_LINE = "#334155"

plt.rcParams["font.family"] = "DejaVu Sans"
plt.rcParams["svg.fonttype"] = "none"  # texte sélectionnable dans le SVG


def save(fig, basename):
    for ext, kw in (("png", {"dpi": 200}), ("svg", {}), ("pdf", {})):
        fig.savefig(OUT / f"{basename}.{ext}", bbox_inches="tight",
                    facecolor="white", **kw)
    plt.close(fig)
    print("OK ->", basename + ".png/.svg/.pdf")


# ============================================================================
#  DIAGRAMME DE CLASSES
# ============================================================================

LH = 2.05          # hauteur d'une ligne (attribut / méthode)
PAD = 1.4          # marge intérieure verticale
HDR = 5.2          # hauteur de l'en-tête
HDR2 = 8.0         # en-tête avec stéréotype (2 lignes)


class Box:
    def __init__(self, key, title, attrs, methods, x, ytop, w, stereo=None,
                 header=AGAPE, body=AGAPE_LIGHT, border=AGAPE, small=False):
        self.key, self.title = key, title
        self.attrs, self.methods = attrs, methods
        self.x, self.ytop, self.w = x, ytop, w
        self.stereo = stereo
        self.header_c, self.body_c, self.border_c = header, body, border
        self.small = small
        hdr = HDR2 if stereo else HDR
        n = len(attrs) + len(methods)
        self.h = hdr + PAD * 2 + n * LH + (1.6 if (attrs and methods) else 0)
        self.ybot = ytop - self.h
        self.hdr_h = hdr

    # point d'ancrage sur un côté (frac : 0..1 le long du côté)
    def port(self, side, frac):
        if side == "L":
            return (self.x, self.ytop - frac * self.h)
        if side == "R":
            return (self.x + self.w, self.ytop - frac * self.h)
        if side == "T":
            return (self.x + frac * self.w, self.ytop)
        return (self.x + frac * self.w, self.ybot)  # "B"

    def draw(self, ax):
        # corps
        ax.add_patch(Rectangle((self.x, self.ybot), self.w, self.h,
                               facecolor=self.body_c, edgecolor=self.border_c,
                               lw=1.3, zorder=3))
        # en-tête
        ax.add_patch(Rectangle((self.x, self.ytop - self.hdr_h), self.w,
                               self.hdr_h, facecolor=self.header_c,
                               edgecolor=self.border_c, lw=1.3, zorder=4))
        cx = self.x + self.w / 2
        tfs = 9.8 if len(self.title) <= 18 else (8.9 if len(self.title) <= 22 else 8.2)
        if self.stereo:
            ax.text(cx, self.ytop - 2.5, self.stereo, ha="center", va="center",
                    fontsize=6.8, style="italic", color="white", zorder=5)
            ax.text(cx, self.ytop - 5.9, self.title, ha="center", va="center",
                    fontsize=tfs - 0.5, fontweight="bold", color="white",
                    zorder=5)
        else:
            ax.text(cx, self.ytop - self.hdr_h / 2, self.title, ha="center",
                    va="center", fontsize=tfs, fontweight="bold",
                    color="white", zorder=5)
        fs = 7.4 if self.small else 7.9
        y = self.ytop - self.hdr_h - PAD - LH / 2
        for a in self.attrs:
            kw = {"fontweight": "bold"} if "{PK}" in a else {}
            ax.text(self.x + 1.6, y, a, ha="left", va="center", fontsize=fs,
                    color=AGAPE_DARK, zorder=5, **kw)
            y -= LH
        if self.attrs and self.methods:
            ax.plot([self.x, self.x + self.w], [y + LH / 2 - 0.2] * 2,
                    color=self.border_c, lw=0.9, zorder=4)
            y -= 1.6
        for m in self.methods:
            ax.text(self.x + 1.6, y, m, ha="left", va="center", fontsize=fs,
                    style="italic", color=AGAPE_DARK, zorder=5)
            y -= LH


# colonnes / lignes de la grille principale
CX = [4, 56, 108, 160, 212]
BW = 44
RY = [236, 190, 144, 98]  # y du haut des boîtes, rangées 1..4


def build_classes():
    B = {}

    def add(key, title, attrs, methods, col, row, **kw):
        B[key] = Box(key, title, attrs, methods,
                     kw.pop("x", CX[col]), kw.pop("ytop", RY[row]),
                     kw.pop("w", BW), **kw)

    add("Etab", "Établissement", [
        "− id : String {PK}", "− nom : String", "− type : TypeEtablissement",
        "− adresse : String", "− telephone : String", "− email : String",
        "− logoUrl : String", "− couleurPrincipale : String",
        "− rccm : String", "− idNat : String", "− devise : String",
        "− actif : Boolean"], [
        "+ creer()", "+ modifier()", "+ desactiver()", "+ lister()"], 0, 0)

    add("Annee", "AnnéeScolaire", [
        "− id : String {PK}", "− libelle : String", "− dateDebut : Date",
        "− dateFin : Date", "− active : Boolean"], [
        "+ creer()", "+ activer()", "+ modifier()", "+ supprimer()"], 1, 0)

    add("Classe", "Classe", [
        "− id : String {PK}", "− nom : String", "− niveau : NiveauClasse",
        "− effectifMax : Integer", "− actif : Boolean",
        "− /effectifActuel : Integer"], [
        "+ creer()", "+ modifier()", "+ supprimer()",
        "+ compterElevesActifs()"], 2, 0)

    add("User", "Utilisateur", [
        "− id : String {PK}", "− username : String {unique}",
        "− passwordHash : String", "− nomComplet : String",
        "− role : RoleUtilisateur", "− actif : Boolean",
        "− dernierLogin : DateTime"], [
        "+ sAuthentifier()", "+ creerCompte()", "+ modifierCompte()",
        "+ desactiverCompte()", "+ estCoordinateur()"], 3, 0)

    add("Audit", "JournalAudit", [
        "− id : String {PK}", "− action : ActionAudit", "− entite : String",
        "− entiteId : String", "− details : String (JSON)",
        "− adresseIp : String"], [
        "+ journaliser(action, entite)", "+ consulter()"], 4, 0,
        stereo="« AuditLog »")

    add("Param", "ParamètreÉtablissement", [
        "− id : String {PK}", "− mentionsLegales : String",
        "− piedPageRecu : String", "− nomImprimante : String",
        "− tauxChangeUsdBif : Decimal", "− deviseDefaut : String"], [
        "+ configurer()", "+ definirPositionLogoRecu()"], 0, 1)

    add("Frais", "FraisScolaire", [
        "− id : String {PK}", "− libelle : String", "− type : TypeFrais",
        "− montant : Decimal", "− devise : String", "− tranche : Integer",
        "− dateEcheance : Date", "− actif : Boolean"], [
        "+ definirFrais()", "+ affecterAuxClasses()",
        "+ modifier()", "+ supprimer()"], 1, 1)

    add("FraisClasse", "FraisClasse", [
        "− createdAt : DateTime"], [], 2, 1, x=108, w=34,
        stereo="« classe d'association »", small=True)

    add("Eleve", "Élève", [
        "− id : String {PK}", "− matricule : String {unique}",
        "− nom : String", "− prenom : String", "− dateNaissance : Date",
        "− lieuNaissance : String", "− sexe : String",
        "− adresse : String", "− ecoleDeProvenance : String",
        "− photoUrl : String", "− statut : StatutEleve"], [
        "+ inscrire()", "+ modifier()", "+ archiver()",
        "+ changerDeClasse()", "+ recupererSolde()"], 3, 1)

    add("Tuteur", "Tuteur", [
        "− id : String {PK}", "− nom : String", "− prenom : String",
        "− telephone : String", "− telephone2 : String",
        "− adresse : String", "− profession : String",
        "− relation : String"], [
        "+ ajouter()", "+ modifier()"], 4, 1)

    add("Depense", "Dépense", [
        "− id : String {PK}", "− categorie : CategorieDepense",
        "− libelle : String", "− montant : Decimal", "− devise : String",
        "− beneficiaire : String", "− dateDepense : Date",
        "− referencePiece : String", "− justificatifUrl : String",
        "− statut : StatutDepense"], [
        "+ enregistrer()", "+ modifier()", "+ supprimer()"], 0, 2)

    add("Echeance", "Échéance", [
        "− id : String {PK}", "− montantDu : Decimal",
        "− montantPaye : Decimal", "− /montantRestant : Decimal",
        "− statut : StatutEcheance", "− dateEcheance : Date",
        "− datePaiementComplet : DateTime"], [
        "+ recalculerMontantPaye()", "+ calculerStatut()",
        "+ estEnRetard()"], 1, 2)

    add("Inscr", "Inscription", [
        "− dateInscription : DateTime", "− dateSortie : DateTime",
        "− statut : StatutInscription"], [
        "+ activer()", "+ cloturer()"], 2, 2, x=108, w=40,
        stereo="« EleveClasse · classe d'association »", small=True)

    add("Paiement", "Paiement", [
        "− id : String {PK}", "− numeroRecu : String {unique}",
        "− motif : String", "− montant : Decimal", "− devise : String",
        "− montantAffecte : Decimal", "− deviseEcheance : String",
        "− modePaiement : ModePaiement",
        "− referencePaiement : String", "− tauxChange : Decimal",
        "− montantOriginal : Decimal", "− annule : Boolean",
        "− dateAnnulation : DateTime"], [
        "+ encaisser()", "+ imprimerRecuPOS()",
        "+ modifier()", "+ annuler(motif)"], 3, 2)

    add("LienTE", "LienTuteurÉlève", [
        "− isPrincipal : Boolean", "− createdAt : DateTime"], [], 4, 2,
        x=216, w=40, stereo="« TuteurEleve · classe d'association »",
        small=True)

    add("ServiceSync", "ServiceSynchronisation", [], [
        "+ pousserVersCloud()  (push)", "+ tirerDepuisCloud()  (pull)",
        "+ synchroniser()", "+ verifierCoherence()",
        "+ propagerSuppressions()"], 0, 3, stereo="« service »")

    add("Config", "ConfigurationSystème", [
        "− id : String {PK}", "− cle : String {unique}",
        "− valeur : String"], [
        "+ lire(cle)", "+ ecrire(cle, valeur)"], 1, 3,
        stereo="« ConfigSysteme »")

    add("SyncLog", "JournalSynchronisation", [
        "− id : String {PK}", "− nomTable : String",
        "− derniereSynchroLe : DateTime",
        "− direction : DirectionSynchro", "− statut : String",
        "− details : String"], [], 1, 3, ytop=74,
        stereo="« SyncLog »")

    add("Annul", "AnnulationReçu", [
        "− id : String {PK}", "− motif : String",
        "− dateAnnulation : DateTime"], [
        "+ enregistrerAnnulation()"], 3, 3)

    return B


ENUMS = [
    ("TypeÉtablissement", ["MATERNELLE", "PRIMAIRE", "SECONDAIRE",
                            "HUMANITE", "COMPLEXE"]),
    ("NiveauClasse", ["MATERNELLE", "PRIMAIRE", "SECONDAIRE", "HUMANITE"]),
    ("RôleUtilisateur", ["COORDINATEUR", "SECRETAIRE_MATERNELLE",
                         "SECRETAIRE_PRIMAIRE", "SECRETAIRE_SECONDAIRE"]),
    ("StatutÉlève", ["INSCRIT", "ACTIF", "SUSPENDU", "TRANSFERE"]),
    ("StatutInscription", ["ACTIF", "SUSPENDU", "TRANSFERE"]),
    ("TypeFrais", ["SCOLARITE", "INSCRIPTION", "ANNEXE"]),
    ("StatutÉchéance", ["EN_ATTENTE", "PARTIELLEMENT_PAYE", "PAYE",
                        "EN_RETARD"]),
    ("ModePaiement", ["ESPECES", "CHEQUE", "VIREMENT"]),
    ("CatégorieDépense", ["SALAIRES", "FOURNITURES", "REPARATIONS",
                          "LOYER", "ENERGIE", "AUTRE"]),
    ("StatutDépense", ["EN_ATTENTE", "VALIDE", "REJETE"]),
    ("ActionAudit", ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT",
                     "ANNULATION"]),
    ("DirectionSynchro", ["PUSH", "PULL", "BIDIRECTIONAL"]),
]


def draw_diamond(ax, p, q, size=2.2):
    """Losange d'agrégation (vide) en p, orienté vers q."""
    ang = math.atan2(q[1] - p[1], q[0] - p[0])
    ux, uy = math.cos(ang), math.sin(ang)
    vx, vy = -uy, ux
    c = (p[0] + ux * size, p[1] + uy * size)
    pts = [p, (c[0] + vx * size * 0.45, c[1] + vy * size * 0.45),
           (p[0] + ux * size * 2, p[1] + uy * size * 2),
           (c[0] - vx * size * 0.45, c[1] - vy * size * 0.45)]
    ax.add_patch(Polygon(pts, closed=True, facecolor="white",
                         edgecolor=GREY_LINE, lw=1.2, zorder=6))


def card_label(ax, p, q, txt, dx=0.0, dy=0.0):
    ax.text(p[0] + dx, p[1] + dy, txt, fontsize=8.2, fontweight="bold",
            color=AGAPE_DARK, ha="center", va="center", zorder=7,
            bbox=dict(facecolor="white", edgecolor="none", pad=0.6,
                      alpha=0.85))


def edge(ax, pts, dashed=False, agg=False, color=GREY_LINE, lw=1.15):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    ax.plot(xs, ys, color=color, lw=lw, zorder=2,
            linestyle=(0, (4, 2.4)) if dashed else "-",
            solid_capstyle="round")
    if agg:
        draw_diamond(ax, pts[0], pts[1])


def mid_label(ax, p, txt, dy=1.6, rot=0):
    va = "center" if rot else "bottom"
    ax.text(p[0], p[1] + dy, txt, fontsize=7.6, style="italic",
            color=GREY_LINE, ha="center", va=va, zorder=7, rotation=rot,
            bbox=dict(facecolor="white", edgecolor="none", pad=0.8,
                      alpha=0.85))


def diagramme_classes():
    B = build_classes()
    fig, ax = plt.subplots(figsize=(26, 25.8))
    ax.set_xlim(-4, 262)
    ax.set_ylim(-2, 260)
    ax.axis("off")
    ax.set_aspect("equal")

    # ---- titre -------------------------------------------------------------
    ax.text(130, 256.5, "Diagramme de classes — SGFS-ME / Complexe Scolaire AGAPE",
            ha="center", va="center", fontsize=19, fontweight="bold",
            color=AGAPE)
    ax.text(130, 251.8, "Système de gestion financière et scolaire — application "
            "desktop (SQLite local) synchronisée avec Supabase (cloud)",
            ha="center", va="center", fontsize=10.5, style="italic",
            color=GREY_LINE)

    P = lambda k, s, f: B[k].port(s, f)  # raccourci ports

    # ---- associations (dessinées sous les boîtes) ---------------------------
    # Structure de l'école
    edge(ax, [P("Etab", "R", .30), P("Annee", "L", .30)], agg=True)
    card_label(ax, P("Etab", "R", .30), None, "1", 1.8, 1.6)
    card_label(ax, P("Annee", "L", .30), None, "0..*", -2.4, 1.6)
    mid_label(ax, (52, P("Etab", "R", .30)[1]), "organise", dy=-4.8)

    p1, p2 = P("Etab", "T", .55), P("Classe", "T", .30)
    edge(ax, [p1, (p1[0], 239.6), (p2[0], 239.6), p2], agg=True)
    card_label(ax, p1, None, "1", -2.2, 1.8)
    card_label(ax, p2, None, "0..*", -3.0, 1.8)
    mid_label(ax, ((p1[0] + p2[0]) / 2, 239.6), "possède")

    edge(ax, [P("Annee", "R", .30), P("Classe", "L", .30)], agg=True)
    card_label(ax, P("Annee", "R", .30), None, "1", 1.8, 1.6)
    card_label(ax, P("Classe", "L", .30), None, "0..*", -2.4, 1.6)
    mid_label(ax, (104, P("Annee", "R", .30)[1]), "regroupe", dy=-4.8)

    p1, p2 = P("Etab", "T", .85), P("User", "T", .30)
    edge(ax, [p1, (p1[0], 241.8), (p2[0], 241.8), p2])
    card_label(ax, p1, None, "0..1", 3.2, 1.6)
    card_label(ax, p2, None, "0..*", -3.0, 1.8)
    mid_label(ax, (152, 241.8), "affecte (vide = toutes les écoles)")

    edge(ax, [P("User", "R", .35), P("Audit", "L", .35)])
    card_label(ax, P("User", "R", .35), None, "0..1", 2.6, 1.8)
    card_label(ax, P("Audit", "L", .35), None, "0..*", -2.4, 1.8)
    mid_label(ax, (208, P("User", "R", .35)[1]), "déclenche", dy=-4.8)

    # Établissement -> Paramètre (1-1) et Année -> Paramètre
    edge(ax, [P("Etab", "B", .28), P("Param", "T", .28)])
    card_label(ax, P("Etab", "B", .28), None, "1", -1.8, -1.6)
    card_label(ax, P("Param", "T", .28), None, "1", -1.8, 1.6)
    mid_label(ax, (P("Etab", "B", .28)[0] + 6, 191.5), "configuré par", dy=0)

    p1, p2 = P("Param", "T", .78), P("Annee", "B", .22)
    edge(ax, [p1, (p1[0], 195.8), (p2[0], 195.8), p2])
    card_label(ax, p1, None, "0..1", 3.0, 1.6)
    card_label(ax, p2, None, "0..1", 3.2, -1.8)

    # Établissement / Année -> Élève
    p1, p2 = P("Etab", "B", .70), P("Eleve", "T", .72)
    edge(ax, [p1, (p1[0], 193.6), (p2[0], 193.6), p2], agg=True)
    card_label(ax, p1, None, "1", 1.8, -1.8)
    card_label(ax, p2, None, "0..*", 3.2, 1.6)
    mid_label(ax, (110, 193.6), "scolarise")

    p1, p2 = P("Annee", "B", .80), P("Eleve", "T", .14)
    edge(ax, [p1, (p1[0], 192.2), (p2[0], 192.2), p2])
    card_label(ax, p1, None, "0..1", 3.2, -1.8)
    card_label(ax, p2, None, "0..*", -3.4, 1.4)
    mid_label(ax, (132, 192.2), "année en cours", dy=-2.6)

    # Frais : Établissement / Année -> FraisScolaire, Frais <-> Classe
    p1, p2 = P("Etab", "R", .82), P("Frais", "L", .30)
    edge(ax, [p1, (52, p1[1]), (52, p2[1]), p2], agg=True)
    card_label(ax, p1, None, "1", 1.6, 1.8)
    card_label(ax, p2, None, "0..*", -2.6, 1.8)
    mid_label(ax, (52, (p1[1] + p2[1]) / 2), "définit", dy=0, rot=90)

    edge(ax, [P("Annee", "B", .42), P("Frais", "T", .42)], agg=True)
    card_label(ax, P("Annee", "B", .42), None, "1", -1.8, -1.8)
    card_label(ax, P("Frais", "T", .42), None, "0..*", -3.2, 1.6)

    p1, p2 = P("Frais", "T", .82), P("Classe", "B", .88)
    edge(ax, [p1, (p1[0], 195.0), (p2[0], 195.0), p2])
    card_label(ax, p1, None, "0..*", 3.2, 1.7)
    card_label(ax, p2, None, "0..*", 3.2, -1.9)
    mid_label(ax, ((p1[0] + p2[0]) / 2 + 6, 195.0), "s'applique à")

    # liaison pointillée FraisClasse <-> association Frais-Classe
    p1 = P("FraisClasse", "T", .32)
    edge(ax, [p1, (p1[0], 195.0)], dashed=True, color=AGAPE_MID)

    # Élève <-> Classe (Inscription)
    p1, p2 = P("Eleve", "T", .42), P("Classe", "B", .60)
    edge(ax, [p1, (p1[0], 197.2), (p2[0], 197.2), p2])
    card_label(ax, p1, None, "0..*", -3.4, 2.6)
    card_label(ax, p2, None, "0..*", -3.2, -1.9)
    mid_label(ax, ((p1[0] + p2[0]) / 2, 197.2), "est inscrit dans")

    p1 = P("Inscr", "R", .45)
    edge(ax, [p1, (156.5, p1[1]), (156.5, 197.2)], dashed=True,
         color=AGAPE_MID)

    # Élève <-> Tuteur (LienTuteurÉlève)
    p1, p2 = P("Eleve", "R", .35), P("Tuteur", "L", .35)
    edge(ax, [p1, p2])
    card_label(ax, p1, None, "0..*", 2.6, 1.8)
    card_label(ax, p2, None, "0..*", -2.4, 1.8)
    mid_label(ax, (208, p1[1]), "représenté par", dy=-4.8)

    p1 = P("LienTE", "L", .50)
    pmid = (208, P("Eleve", "R", .35)[1])
    edge(ax, [p1, (208.8, p1[1]), (208.8, pmid[1])], dashed=True,
         color=AGAPE_MID)

    # Échéances
    edge(ax, [P("Frais", "B", .42), P("Echeance", "T", .42)], agg=True)
    card_label(ax, P("Frais", "B", .42), None, "1", -1.8, -1.8)
    card_label(ax, P("Echeance", "T", .42), None, "0..*", -3.2, 1.6)
    mid_label(ax, (P("Frais", "B", .42)[0] - 6.5, 145.5), "génère", dy=0)

    p1, p2 = P("Eleve", "B", .28), P("Echeance", "T", .78)
    edge(ax, [p1, (p1[0], 147.6), (p2[0], 147.6), p2], agg=True)
    card_label(ax, p1, None, "1", -1.8, -1.8)
    card_label(ax, p2, None, "0..*", 3.2, 1.6)
    mid_label(ax, (126, 147.6), "doit")

    # Paiements
    edge(ax, [P("Eleve", "B", .62), P("Paiement", "T", .62)], agg=True)
    card_label(ax, P("Eleve", "B", .62), None, "1", -1.8, -1.8)
    card_label(ax, P("Paiement", "T", .62), None, "0..*", -3.2, 1.6)
    mid_label(ax, (P("Eleve", "B", .62)[0] + 5.5, 145.5), "effectue", dy=0)

    p1, p2 = P("Echeance", "B", .55), P("Paiement", "B", .30)
    edge(ax, [p1, (p1[0], 101.0), (p2[0], 101.0), p2])
    card_label(ax, p1, None, "0..1", -3.4, -1.8)
    card_label(ax, p2, None, "0..*", -3.2, -2.0)
    mid_label(ax, (126, 101.0), "est réglée par")

    p1, p2 = P("User", "R", .62), P("Paiement", "R", .28)
    edge(ax, [p1, (209.6, p1[1]), (209.6, p2[1]), p2])
    card_label(ax, p1, None, "1", 1.6, 1.8)
    card_label(ax, p2, None, "0..*", 2.8, 1.8)
    mid_label(ax, (209.6, 165), "encaisse", dy=0, rot=90)

    edge(ax, [P("Paiement", "B", .68), P("Annul", "T", .68)])
    card_label(ax, P("Paiement", "B", .68), None, "1", -1.8, -1.8)
    card_label(ax, P("Annul", "T", .68), None, "0..1", 3.2, 1.6)
    mid_label(ax, (P("Paiement", "B", .68)[0] + 8.5, 99.5), "annulé par", dy=0)

    p1, p2 = P("User", "R", .85), P("Annul", "R", .45)
    edge(ax, [p1, (210.6, p1[1]), (210.6, p2[1]), p2])
    card_label(ax, p2, None, "0..*", 2.6, 1.8)
    mid_label(ax, (210.6, 118), "prononce", dy=0, rot=90)

    # Dépenses
    p1, p2 = P("Etab", "L", .55), P("Depense", "L", .35)
    edge(ax, [p1, (1.6, p1[1]), (1.6, p2[1]), p2], agg=True)
    card_label(ax, p1, None, "1", 0.5, 2.2)
    card_label(ax, p2, None, "0..*", -0.5, 2.4)
    mid_label(ax, (1.6, 175), "engage", dy=0, rot=90)

    p1, p2 = P("Annee", "L", .68), P("Depense", "T", .80)
    edge(ax, [p1, (53.2, p1[1]), (53.2, 148.8), (p2[0], 148.8), p2], agg=True)
    card_label(ax, p1, None, "1", -1.8, 1.8)
    card_label(ax, p2, None, "0..*", 3.2, 1.7)
    mid_label(ax, (53.2, 170), "imputée à", dy=0, rot=90)

    p1, p2 = P("User", "T", .78), P("Depense", "L", .68)
    edge(ax, [p1, (p1[0], 242.6), (2.9, 242.6), (2.9, p2[1]), p2], lw=0.95)
    card_label(ax, p1, None, "0..1", 3.4, 1.8)
    card_label(ax, p2, None, "0..*", -0.5, 2.4)
    mid_label(ax, (58, 242.6), "saisit (créée par)")

    # Synchronisation
    edge(ax, [P("ServiceSync", "R", .30), P("Config", "L", .45)],
         dashed=True, color=AGAPE_MID)
    mid_label(ax, (52, P("ServiceSync", "R", .30)[1] - 6.5),
              "lit URL / clé Supabase", dy=0)

    p1, p2 = P("ServiceSync", "R", .72), P("SyncLog", "L", .50)
    edge(ax, [p1, (52, p1[1]), (52, p2[1]), p2], dashed=True,
         color=AGAPE_MID)
    mid_label(ax, (52, (p1[1] + p2[1]) / 2), "consigne", dy=0, rot=90)

    # ---- boîtes -------------------------------------------------------------
    for b in B.values():
        b.draw(ax)

    # ---- notes --------------------------------------------------------------
    def note(x, y, w, txt, title=None):
        lines = txt.split("\n")
        n = len(lines) + (1 if title else 0)
        h = n * 2.2 + 2.4
        ax.add_patch(FancyBboxPatch((x, y - h), w, h,
                                    boxstyle="round,pad=0.15,rounding_size=1.2",
                                    facecolor=NOTE_BG, edgecolor=NOTE_BD,
                                    lw=1.0, zorder=8))
        ty = y - 2.7
        if title:
            ax.text(x + 1.8, ty, title, fontsize=8.3, fontweight="bold",
                    color="#713f12", va="center", zorder=9)
            ty -= 2.3
        for ln in lines:
            ax.text(x + 1.8, ty, ln, fontsize=7.7, color="#713f12",
                    va="center", zorder=9)
            ty -= 2.2

    note(108, 96, 48,
         "Dette individuelle : UNIQUE(élève, frais).\n"
         "Matérialisée par élève × frais de sa classe\n"
         "ou reconstruite à la volée ; statut recalculé\n"
         "(EN_RETARD si date dépassée et solde > 0).",
         title="Note — Échéance")

    note(108, 77, 48,
         "Au plus UNE inscription ACTIF par élève.\n"
         "Changement de classe = ancienne inscription\n"
         "TRANSFERE (+ dateSortie) + nouvelle ACTIF.\n"
         "Archiver un élève ⇒ statut TRANSFERE\n"
         "(suppression logique, jamais d'effacement).",
         title="Règles métier — Inscription / Élève")

    note(212, 93, 48,
         "Coordonnateur : établissement vide ⇒ accès\n"
         "à toutes les écoles. Secrétaire : limité à\n"
         "son établissement et à son niveau\n"
         "(maternelle, primaire, secondaire &\n"
         "Humanités).",
         title="Note — Utilisateur / rôles")

    note(212, 73, 48,
         "{PK} : clé primaire (texte / CUID en SQLite)\n"
         "/attribut : valeur dérivée (calculée)\n"
         "Toutes les classes persistées portent aussi\n"
         "createdAt / updatedAt (omis pour lisibilité).\n"
         "Liaisons dénormalisées non dessinées :\n"
         "Échéance et Paiement recopient aussi\n"
         "etablissement_id et annee_scolaire_id.",
         title="Légende")

    # ---- énumérations ---------------------------------------------------------
    ax.text(108, 53.5, "Énumérations (valeurs stockées en TEXT — référencées par le type des attributs ci-dessus)",
            fontsize=10, fontweight="bold", color=ENUM_BD, va="center")
    ew, gap, rows_y = 41.5, 1.6, [49.5, 25]
    for i, (name, vals) in enumerate(ENUMS):
        col = i % 6
        row = i // 6
        b = Box(f"enum{i}", name, vals, [], 4 + col * (ew + gap),
                rows_y[row], ew, stereo="« enumeration »", header=ENUM_HD,
                body=ENUM_BG, border=ENUM_BD, small=True)
        b.draw(ax)

    save(fig, "diagramme-classes-agape")


# ============================================================================
#  DIAGRAMME DE CAS D'UTILISATION
# ============================================================================

def stick_actor(ax, x, y, label, sub=None, color=AGAPE):
    """Dessine un acteur (bonhomme) centré en (x, y) ; renvoie son port droit/gauche."""
    ax.add_patch(Circle((x, y + 4.6), 1.9, fill=False, edgecolor=color,
                        lw=1.6, zorder=6))
    ax.plot([x, x], [y + 2.7, y - 1.6], color=color, lw=1.6, zorder=6)
    ax.plot([x - 3.0, x + 3.0], [y + 1.2, y + 1.2], color=color, lw=1.6,
            zorder=6)
    ax.plot([x, x - 2.8], [y - 1.6, y - 5.4], color=color, lw=1.6, zorder=6)
    ax.plot([x, x + 2.8], [y - 1.6, y - 5.4], color=color, lw=1.6, zorder=6)
    bb = dict(facecolor="white", edgecolor="none", pad=0.9, alpha=0.88)
    ax.text(x, y - 7.6, label, ha="center", va="top", fontsize=8.6,
            fontweight="bold", color=AGAPE_DARK, zorder=7, bbox=bb)
    if sub:
        n = label.count("\n") + 1
        ax.text(x, y - 7.6 - n * 2.6, sub, ha="center", va="top",
                fontsize=7.4, style="italic", color=GREY_LINE, zorder=7,
                bbox=bb)
    return {"R": (x + 3.2, y + 1.2), "L": (x - 3.2, y + 1.2),
            "T": (x, y + 6.7), "B": (x, y - 5.6), "C": (x, y)}


def package(ax, x, y, w, h, title):
    ax.add_patch(Rectangle((x, y), w, h, facecolor="#f8fafc",
                           edgecolor="#93c5fd", lw=1.1, zorder=1))
    ax.text(x + 1.2, y + h - 2.3, title, fontsize=8.8, fontweight="bold",
            color=AGAPE, va="center", zorder=8,
            bbox=dict(facecolor="#f8fafc", edgecolor="none", pad=1.0))


def usecase(ax, UC, key, cx, cy, w, label):
    h = 4.6 + 2.25 * label.count("\n") + 3.4
    ax.add_patch(Ellipse((cx, cy), w, h, facecolor=AGAPE_LIGHT,
                         edgecolor=AGAPE_MID, lw=1.25, zorder=4))
    ax.text(cx, cy, label, ha="center", va="center", fontsize=7.9,
            color=AGAPE_DARK, zorder=5)
    UC[key] = {"C": (cx, cy), "L": (cx - w / 2, cy), "R": (cx + w / 2, cy),
               "T": (cx, cy + h / 2), "B": (cx, cy - h / 2)}


def assoc(ax, p, q, color=GREY_LINE, lw=1.0, alpha=0.85):
    ax.plot([p[0], q[0]], [p[1], q[1]], color=color, lw=lw, alpha=alpha,
            zorder=2, solid_capstyle="round")


def rel(ax, p, q, kind, via=None, label_at=None, label_dy=1.1):
    """Relation <<include>> / <<extend>> : trait pointillé p -> q (dessiné
    SOUS les ellipses), pointe de flèche pleine sur la cible.
    `via` permet un trajet coudé (points intermédiaires)."""
    pts = [p] + list(via or []) + [q]
    ax.plot([t[0] for t in pts], [t[1] for t in pts], color=AGAPE_MID,
            lw=1.15, linestyle=(0, (4, 2.2)), zorder=3,
            solid_capstyle="round")
    (x1, y1), (x2, y2) = pts[-2], pts[-1]
    ang = math.atan2(y2 - y1, x2 - x1)
    ux, uy = math.cos(ang), math.sin(ang)
    vx, vy = -uy, ux
    tip = (x2 - ux * 0.4, y2 - uy * 0.4)
    base = (tip[0] - ux * 2.6, tip[1] - uy * 2.6)
    ax.add_patch(Polygon([tip,
                          (base[0] + vx * 1.05, base[1] + vy * 1.05),
                          (base[0] - vx * 1.05, base[1] - vy * 1.05)],
                         closed=True, facecolor=AGAPE_MID,
                         edgecolor=AGAPE_MID, lw=0.8, zorder=6))
    if label_at is None:
        seg = max(zip(pts, pts[1:]),
                  key=lambda sg: (sg[1][0] - sg[0][0]) ** 2
                  + (sg[1][1] - sg[0][1]) ** 2)
        label_at = ((seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2)
    ax.text(label_at[0], label_at[1] + label_dy, f"«{kind}»", fontsize=7.2,
            style="italic", color=AGAPE_MID, ha="center",
            va="bottom" if label_dy >= 0 else "top", zorder=7,
            bbox=dict(facecolor="white", edgecolor="none", pad=0.7,
                      alpha=0.92))


def generalization(ax, enfant, parent):
    """Généralisation d'acteur : ligne + triangle vide côté parent."""
    ax.plot([enfant[0], parent[0]], [enfant[1], parent[1]], color=AGAPE,
            lw=1.3, zorder=3)
    ang = math.atan2(parent[1] - enfant[1], parent[0] - enfant[0])
    ux, uy = math.cos(ang), math.sin(ang)
    vx, vy = -uy, ux
    base = (parent[0] - ux * 3.4, parent[1] - uy * 3.4)
    pts = [parent,
           (base[0] + vx * 1.5, base[1] + vy * 1.5),
           (base[0] - vx * 1.5, base[1] - vy * 1.5)]
    ax.add_patch(Polygon(pts, closed=True, facecolor="white",
                         edgecolor=AGAPE, lw=1.3, zorder=5))


def diagramme_cas_utilisation():
    fig, ax = plt.subplots(figsize=(27, 19.5))
    ax.set_xlim(-2, 268)
    ax.set_ylim(-6, 208)
    ax.axis("off")
    ax.set_aspect("equal")

    ax.text(133, 204.5, "Diagramme de cas d'utilisation — SGFS-ME / Complexe Scolaire AGAPE",
            ha="center", va="center", fontsize=17.5, fontweight="bold",
            color=AGAPE)
    ax.text(133, 199.8, "Gestion financière et scolaire — qui fait quoi dans l'application "
            "(rôles réels du code : COORDINATEUR et SECRETAIRE par niveau)",
            ha="center", va="center", fontsize=10, style="italic",
            color=GREY_LINE)

    # ---- frontière du système ----------------------------------------------
    ax.add_patch(FancyBboxPatch((46, 10), 186, 182,
                                boxstyle="round,pad=0.2,rounding_size=2.0",
                                facecolor="white", edgecolor=AGAPE, lw=1.8,
                                zorder=0))
    ax.text(139, 187.5, "SGFS-ME — Complexe Scolaire AGAPE", ha="center",
            va="center", fontsize=11.5, fontweight="bold", color=AGAPE,
            zorder=2)

    UC = {}

    # ---- packages et cas d'utilisation --------------------------------------
    # Authentification
    package(ax, 50, 168, 84, 16, "Authentification")
    usecase(ax, UC, "auth", 70, 175.5, 34, "S'authentifier")
    usecase(ax, UC, "verif", 110, 175.5, 40,
            "Vérifier les identifiants\n(username / mot de passe)")
    ax.text(139, 175.5, "Précondition de tous les autres cas :\nchaque cas «include» S'authentifier\n(flèches omises pour lisibilité)",
            fontsize=7.8, style="italic", color=GREY_LINE, va="center",
            zorder=2)

    # Administration (coordonnateur)
    package(ax, 50, 140, 178, 26,
            "Administration — Coordonnateur uniquement")
    usecase(ax, UC, "etab", 71, 157.5, 38, "Gérer les\nétablissements")
    usecase(ax, UC, "annees", 114, 157.5, 42,
            "Gérer les années scolaires\n(créer, activer)")
    usecase(ax, UC, "classes", 160, 157.5, 44,
            "Gérer les classes\n(Maternelle → Humanités)")
    usecase(ax, UC, "users", 204, 157.5, 42,
            "Gérer les comptes\nutilisateurs (rôles)")
    usecase(ax, UC, "config", 82, 146.5, 58,
            "Configurer les paramètres de l'école\n(logo AGAPE, reçu, taux, imprimante)")
    usecase(ax, UC, "configsync", 138, 146.5, 52,
            "Configurer la synchronisation\n(URL & clé Supabase)")
    usecase(ax, UC, "audit", 192, 146.5, 52, "Consulter le journal d'audit")

    # Scolarité
    package(ax, 50, 110, 178, 28, "Scolarité — Élèves")
    usecase(ax, UC, "inscrire", 71, 129.5, 36, "Inscrire\nun élève")
    usecase(ax, UC, "tuteur", 112, 129.5, 40,
            "Associer un tuteur\nà l'élève")
    usecase(ax, UC, "affecter", 156, 129.5, 42,
            "Affecter l'élève\nà une classe")
    usecase(ax, UC, "consult", 201, 129.5, 46,
            "Consulter / rechercher\nun élève (fiche, solde)")
    usecase(ax, UC, "modif", 74, 118.5, 36, "Modifier\nun élève")
    usecase(ax, UC, "archiver", 119, 118.5, 46,
            "Archiver un élève\n(statut : Transféré)")
    usecase(ax, UC, "chgclasse", 164, 118.5, 42,
            "Changer un élève\nde classe")

    # Frais & échéances
    package(ax, 50, 90, 178, 20, "Frais & Échéances")
    usecase(ax, UC, "frais", 74, 99, 44,
            "Définir les frais scolaires\n(tranches, dates) — Coord.")
    usecase(ax, UC, "affectfrais", 122, 99, 42,
            "Affecter les frais\naux classes")
    usecase(ax, UC, "suivi", 168, 99, 46,
            "Suivre les échéances\net les soldes")
    usecase(ax, UC, "relance", 212, 99, 34,
            "Relancer les parents\nen retard")

    # Encaissements
    package(ax, 50, 57, 178, 31, "Encaissements")
    usecase(ax, UC, "encaiss", 80, 79.5, 52,
            "Encaisser un paiement\n(espèces, chèque, virement)")
    usecase(ax, UC, "majEch", 136, 79.5, 48,
            "Mettre à jour l'échéance\n(montant payé, statut)")
    usecase(ax, UC, "imprRecu", 192, 79.5, 56,
            "Imprimer le reçu POS\n(n° reçu, code-barres, logo)")
    usecase(ax, UC, "histo", 80, 66.5, 52,
            "Consulter l'historique\ndes encaissements")
    usecase(ax, UC, "annuler", 136, 66.5, 48,
            "Annuler un reçu\n(motif obligatoire)")
    usecase(ax, UC, "journal", 192, 66.5, 48,
            "Journaliser l'opération\n(audit)")

    # Dépenses / rapports / synchronisation
    package(ax, 50, 14, 112, 44, "Dépenses, Pilotage & Rapports")
    usecase(ax, UC, "depense", 76, 48, 44, "Enregistrer\nune dépense")
    usecase(ax, UC, "dash", 128, 48, 52,
            "Consulter le tableau de bord\n(effectifs, recouvrements, retards)")
    usecase(ax, UC, "rapports", 76, 30, 54,
            "Produire les rapports\n(financier, élèves, journalier)")
    usecase(ax, UC, "export", 128, 30, 48,
            "Exporter en Excel /\nImprimer (PDF)")

    package(ax, 166, 14, 62, 44, "Synchronisation")
    usecase(ax, UC, "sync", 197, 42, 54,
            "Synchroniser les données\navec le cloud (Push / Pull)")
    ax.text(197, 24, "Bidirectionnel : Pull puis Push,\navec réparation de cohérence.\nL'appli fonctionne aussi hors ligne.",
            fontsize=7.6, style="italic", color=GREY_LINE, ha="center",
            va="center", zorder=2)

    # ---- acteurs --------------------------------------------------------------
    A = {}
    A["coord"] = stick_actor(ax, 20, 170, "Coordonnateur", "(COORDINATEUR)")
    A["user"] = stick_actor(ax, 20, 128, "Utilisateur", "« acteur général »")
    A["secr"] = stick_actor(ax, 20, 88, "Secrétaire", "« acteur général »")
    A["sm"] = stick_actor(ax, 9, 54, "Secrétaire\nMaternelle")
    A["sp"] = stick_actor(ax, 31, 38, "Secrétaire\nPrimaire")
    A["ss"] = stick_actor(ax, 12, 18, "Secrétaire\nSecondaire\n& Humanités")

    generalization(ax, (20, 163), (20, 135))      # Coordonnateur -> Utilisateur
    generalization(ax, (20, 95.5), (20, 121))    # Secrétaire -> Utilisateur
    J = (20, 68)  # jonction commune des 3 secrétaires -> Secrétaire
    for src in ((9, 60.7), (31, 44.7), (12, 24.7)):
        ax.plot([src[0], J[0]], [src[1], J[1]], color=AGAPE, lw=1.3,
                zorder=3)
    generalization(ax, J, (20, 82.2))

    A["parent"] = stick_actor(ax, 250, 74, "Parent / Tuteur", "« secondaire »")
    A["impr"] = stick_actor(ax, 250, 118, "Imprimante POS",
                            "« secondaire »")
    A["wa"] = stick_actor(ax, 250, 152, "WhatsApp", "(relances) « secondaire »")
    A["cloud"] = stick_actor(ax, 250, 28, "Supabase Cloud\n(PostgreSQL)",
                             "« secondaire »")

    # ---- associations acteurs -> cas -------------------------------------------
    U = A["user"]["R"]
    for k in ("inscrire", "consult", "modif", "suivi", "encaiss", "histo",
              "depense", "dash", "rapports", "sync"):
        assoc(ax, U, UC[k]["L"])
    assoc(ax, A["user"]["R"], UC["auth"]["L"])

    C = A["coord"]["R"]
    for k in ("etab", "annees", "classes", "users", "config", "audit",
              "configsync", "frais"):
        assoc(ax, C, UC[k]["L"], color=AGAPE_MID)

    # acteurs secondaires
    assoc(ax, A["parent"]["L"], UC["encaiss"]["R"])
    ax.text(238, 78, "paie les frais,\nreçoit le reçu", fontsize=7.4,
            style="italic", color=GREY_LINE, ha="center", zorder=3)
    assoc(ax, UC["relance"]["R"], A["parent"]["L"])
    ax.text(238, 92, "reçoit l'avis\nde relance", fontsize=7.4,
            style="italic", color=GREY_LINE, ha="center", zorder=3)
    assoc(ax, UC["imprRecu"]["R"], A["impr"]["L"])
    assoc(ax, UC["relance"]["R"], A["wa"]["L"])
    assoc(ax, UC["sync"]["R"], A["cloud"]["L"])

    # ---- relations <<include>> / <<extend>> --------------------------------------
    rel(ax, UC["auth"]["R"], UC["verif"]["L"], "include")
    rel(ax, UC["inscrire"]["R"], UC["tuteur"]["L"], "include")
    rel(ax, UC["tuteur"]["R"], UC["affecter"]["L"], "include")
    rel(ax, UC["chgclasse"]["T"], UC["affecter"]["B"], "include",
        label_at=(160, 124.2), label_dy=0.9)
    rel(ax, UC["chgclasse"]["B"], UC["modif"]["B"], "extend",
        via=[(164, 111.3), (74, 111.3)], label_at=(119, 111.3),
        label_dy=-1.0)
    rel(ax, UC["archiver"]["L"], UC["modif"]["R"], "extend",
        label_dy=1.3)
    rel(ax, UC["frais"]["R"], UC["affectfrais"]["L"], "include")
    rel(ax, UC["relance"]["L"], UC["suivi"]["R"], "extend")
    rel(ax, UC["encaiss"]["R"], UC["majEch"]["L"], "include")
    rel(ax, UC["majEch"]["R"], UC["imprRecu"]["L"], "include")
    rel(ax, UC["encaiss"]["L"], UC["journal"]["B"], "include",
        via=[(52.3, 79.5), (52.3, 59.2), (192, 59.2)],
        label_at=(122, 59.2), label_dy=-1.0)
    rel(ax, UC["annuler"]["L"], UC["histo"]["R"], "extend")
    rel(ax, UC["annuler"]["R"], UC["journal"]["L"], "include")
    rel(ax, UC["export"]["L"], UC["rapports"]["R"], "extend")
    rel(ax, UC["configsync"]["L"], UC["config"]["R"], "extend")

    # ---- note bas de page -----------------------------------------------------------
    ax.text(46, 4.5,
            "Lecture : un Secrétaire n'accède qu'à son établissement et à son niveau "
            "(maternelle, primaire, ou secondaire & Humanités) ;\n"
            "le Coordonnateur dispose en plus de tout le package « Administration » et "
            "de la définition des frais. «include» = toujours exécuté, «extend» = optionnel sous condition.",
            fontsize=8.2, style="italic", color=GREY_LINE, va="top", zorder=2)

    save(fig, "diagramme-cas-utilisation-agape")


if __name__ == "__main__":
    diagramme_classes()
    diagramme_cas_utilisation()
