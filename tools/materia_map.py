# -*- coding: utf-8 -*-
"""Source-abbreviation -> roster-id overrides for the materia medica sources.

Kept in its own module with **no side effects** so both the builder
(build_materia_src.py, which runs a full parse at import time) and the shard
re-keyer (fix_materia_keys.py) can read the same table without one triggering
the other's work.

Each entry was verified by reading the source page against the roster name.
They are listed explicitly rather than handled by a looser matching heuristic
because a fuzzy rule wide enough to bridge these would also silently fuse
genuinely different species, and a drug picture filed under the wrong remedy is
worse than no drug picture at all.

Almost all are Latin gender/spelling drift between editions ('Europaea' vs
'Europaeus', 'Nitricus' vs 'Nitrosus', 'Cyanatum' vs 'Cyanidum'). The builder's
prefix test only compares roster-startswith-source, so a roster word *shorter*
than the source word never matched.
"""

FORCE_ID = {
    'a_lycoct': 'acon-l',          # Aconitum Lycoctonum == our "Lycotonum"
    'ant-saur': 'ant-s',           # Antimonium Sulphuratum Auratum
    'antim_sul_aur': 'ant-s',      # ditto, Clarke spells it "Aureum"
    'arg_cy': 'arg-c',             # Argentum Cyanatum == our "Cyanidum"
    'aur_ars': 'aur-a',            # Aurum Arsenicicum == our "Arsenicum"
    'euon_europ': 'euon',          # Euonymus Europaea == our "Europaeus"
    'jun_v': 'juni',               # Juniperus Virginianus == our "Virginiana"
    'kali_fcy': 'kali-fer',        # Kali Ferrocyanatum == our "Ferrocyanicum"
    'lin_cath': 'linu-c',          # Linum Catharticum == our "Linum Cathar"
    'merc_nit': 'merc-n',          # Mercurius Nitricus == our "Nitrosus"
    'puls_nutt': 'puls-n',         # Pulsatilla Nuttaliana == our "Nuttalliana"
    'arist_serp': 'serp',          # Aristolochia Serpentaria == our "Serpentaria"
    'culex': 'culx',               # Culex Musca == our "Culex Moscae"
    'cocain': 'cocain-m',          # Cocainum Hydrochloricum == our "Muriaticum"
    'oxy': 'ozone',                # Clarke files Ozone under Oxygenium
    # Clarke's own provenance line reads "Sugar. (Including Saccharum album,
    # White Sugar.)", so Officinale is the right source for our two Album rows
    'sacch': 'sacc',
    'sac_off': 'sacc',
}


def shard_of(key):
    """First character of the key, so the page derives the file from the id."""
    c = (key[1:] if key.startswith('~') else key)[:1].lower()
    return c if c.isalpha() else '_'
