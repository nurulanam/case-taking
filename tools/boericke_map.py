# -*- coding: utf-8 -*-
"""Boericke abbreviation -> our remedy id.

Boericke abbreviates differently from Kent — 'Sul.' not 'Sulph.', 'Calc. c.'
not 'Calc.', 'Cinch.' not 'Chin.', 'Thuya' not 'Thuj.' — so most of his 1,700
distinct tokens need an explicit bridge before they can point at the same remedy
table the Kent data uses. Sharing that table is what lets a Boericke result open
the same Bangla materia medica.

ALIAS is keyed by the normalised token (lower-cased, dots dropped, spaces to
hyphens, æ/œ folded). AMBIGUOUS lists abbreviations that genuinely stand for
more than one remedy in Boericke's own usage: they are dropped and counted, not
guessed, because attributing a symptom to the wrong remedy is the one error a
repertory must never make.
"""

# Abbreviations Boericke uses for two or more different remedies, with no
# sibling form in the text to disambiguate them.
AMBIGUOUS = {
    'sab',    # Sabina or Sabadilla — both exist, neither spelled out anywhere
    'kal',    # bare Kali; the text also has 'Kali bich.', so this is not one salt
    'arn-ac', 'ac',
}

ALIAS = {
    # ---- different stem entirely
    'sul': 'sulph', 'sulph': 'sulph', 'sul-ac': 'sul-ac', 'sul-iod': 'sul-i',
    'cinch': 'chin', 'cinchona': 'chin', 'chin-s': 'chin-s', 'chin-ars': 'chin-a',
    'thuya': 'thuj', 'ipec': 'ip', 'petrol': 'petr', 'col': 'coloc',
    'pod': 'podo', 'tereb': 'ter', 'helleb': 'hell', 'selen': 'sel',
    'plumb': 'plb', 'plumb-m': 'plb', 'plumb-ac': 'plb', 'plumb-iod': 'plb',
    'diosc': 'dios', 'euphras': 'euphr', 'cepa': 'all-c', 'pyr': 'pyrog',
    'guaiac': 'guai', 'val': 'valer', 'physost': 'phys', 'oleand': 'olnd',
    'scilla': 'squil', 'collins': 'coll', 'onosm': 'onos', 'verbasc': 'verb',
    'tellur': 'tell', 'cinnab': 'cinnb', 'echin': 'echi', 'senega': 'seneg',
    'millef': 'mill', 'santon': 'santin', 'ustil': 'ust', 'calend': 'calen',
    'atrop': 'atro', 'ced': 'cedr', 'urt': 'urt-u', 'absinth': 'absin',
    'strych': 'stry', 'strych-p': 'stry', 'piloc': 'pilo', 'arum': 'arum-t',
    'radium': 'rad', 'lob-infl': 'lob', 'lob-erin': 'lob',
    'apis-mel': 'apis', 'apoc': 'apoc',
    'cocaine': 'cocain-m',
    # Boericke's 'Chimaph.' is the common species, Chimaphila umbellata
    'chimaph': 'chim',
    # our roster carries a few remedies twice under variant spellings, which
    # makes the prefix test ambiguous; these pick the entry Boericke means
    'nat-ars': 'nat-a',      # Natrum arsenicatum (also listed as Arsenicosum)
    'amyl': 'aml-n',         # Amyl nitrite (also listed as Amylenum nitrosum)
    'euphorb': 'eupho',      # Euphorbium (also listed as Officinarum)
    'euphorbia': 'eupho',

    # ---- Boericke names the salt where Kent's key is the bare stem
    'calc-c': 'calc', 'merc-s': 'merc', 'merc-v': 'merc', 'cupr-m': 'cupr',
    'ferr-m': 'ferr', 'zinc-m': 'zinc', 'mang-ac': 'mang', 'kali-bich': 'kali-bi',
    'ver-a': 'verat', 'ver-v': 'verat-v', 'crot': 'crot-h', 'crot-t': 'crot-t',
    'crot-casc': 'crot-c', 'ars-iod': 'ars-i', 'ars-m': 'ars-m',
    'calc-fl': 'calc-f', 'calc-iod': 'calc-i', 'calc-ars': 'calc-ar',
    'calc-sil': 'calc-sil', 'calc-s': 'calc-s', 'calc-p': 'calc-p',
    'cupr-ars': 'cupr-ar', 'cupr-ac': 'cupr-ac', 'aur-mur': 'aur-m',
    'aur-m-n': 'aur-m-n', 'kali-iod': 'kali-i', 'kali-bi': 'kali-bi',
    'nat-sulph': 'nat-s', 'nat-mur': 'nat-m', 'nat-c': 'nat-c',
    'eup-perf': 'eup-per', 'eup-purp': 'eup-pur', 'tar-h': 'tarent',
    'tar-c': 'tarent-c', 'can-ind': 'cann-i', 'can-s': 'cann-s',
    'vib-op': 'vib', 'vib-pr': 'vib', 'prun-sp': 'prun-s',
    'merc-i-r': 'merc-i-r', 'merc-i-fl': 'merc-i-f', 'merc-c': 'merc-c',
    'merc-cy': 'merc-cy', 'merc-d': 'merc-d',

    # ---- acids: Boericke puts the acid second, Kent's key often abbreviates it
    'phos-ac': 'ph-ac', 'fluor-ac': 'fl-ac', 'picr-ac': 'pic-ac',
    'nit-ac': 'nit-ac', 'mur-ac': 'mur-ac', 'benz-ac': 'benz-ac',
    'hydroc-ac': 'hydr-ac', 'acet-ac': 'acet-ac', 'ox-ac': 'ox-ac',
    'lac-ac': 'lact-ac', 'salic-ac': 'sal-ac', 'carbol-ac': 'carb-ac',
    'form-ac': 'form', 'oxal-ac': 'ox-ac', 
    'gall-ac': 'gall-ac', 'tart-ac': 'tart-ac',

    # ---- carbons / plant stems Boericke spells out
    'carbo-v': 'carb-v', 'carbon-an': 'carb-an', 'carbo-an': 'carb-an',
    'carbon-s': 'carb-s', 'carb-s': 'carb-s',
    'berb-v': 'berb', 
    'rhus-t': 'rhus-t', 'rhus-v': 'rhus-v', 'rhus-r': 'rhus-r',
    'nux-v': 'nux-v', 'nux-m': 'nux-m',
    'am-c': 'am-c', 'am-m': 'am-m', 'am-caust': 'am-caust',
    'bapt': 'bapt', 'bell': 'bell', 'cham': 'cham', 'cim': 'cimic',
    'cimicif': 'cimic', 'gels': 'gels', 'graph': 'graph', 'hep': 'hep',
    'hydr': 'hydr', 'hyos': 'hyos', 'ign': 'ign', 'iod': 'iod',
    'lach': 'lach', 'lyc': 'lyc', 'op': 'op', 'phos': 'phos',
    'puls': 'puls', 'sep': 'sep', 'sil': 'sil', 'spig': 'spig',
    'stram': 'stram', 'sang': 'sang', 'squil': 'squil', 'staph': 'staph',
    'sabad': 'sabad', 'sabin': 'sabin',
    'agar': 'agar', 'alum': 'alum', 'alumn': 'alumn', 'anac': 'anac',
    'ant-c': 'ant-c', 'ant-t': 'ant-t', 'apis': 'apis', 'arg-n': 'arg-n',
    'arg-m': 'arg-m', 'arn': 'arn', 'ars': 'ars', 'asaf': 'asaf',
    'aur': 'aur', 'bar-c': 'bar-c', 'bar-m': 'bar-m', 'bism': 'bism',
    'bor': 'bor', 'bov': 'bov', 'brom': 'brom', 'bry': 'bry',
    'cact': 'cact', 'camph': 'camph', 'canth': 'canth', 'caps': 'caps',
    'caust': 'caust', 'chel': 'chel', 'cic': 'cic', 'clem': 'clem',
    'cocc': 'cocc', 'coff': 'coff', 'colch': 'colch', 'coloc': 'coloc',
    'con': 'con', 'croc': 'croc', 'cycl': 'cycl', 'dig': 'dig',
    'dros': 'dros', 'dulc': 'dulc', 'ferr': 'ferr', 'glon': 'glon',
    'kreos': 'kreos', 'laur': 'laur', 'led': 'led', 'mag-c': 'mag-c',
    'mag-m': 'mag-m', 'mang': 'mang', 'meny': 'meny', 'mez': 'mez',
    'mosch': 'mosch', 'mur': 'mur-ac', 'naja': 'naja', 'nat-p': 'nat-p',
    'nit': 'nit-ac', 'olnd': 'olnd', 'par': 'par', 'phyt': 'phyt',
    'plat': 'plat', 'psor': 'psor', 'ran-b': 'ran-b', 'ran-s': 'ran-s',
    'rheum': 'rheum', 'rhod': 'rhod', 'rumx': 'rumx', 'ruta': 'ruta',
    'samb': 'samb', 'sars': 'sars', 'sec': 'sec', 'seneg': 'seneg',
    'spong': 'spong', 'stann': 'stann', 'stront': 'stront', 'sumb': 'sumb',
    'tab': 'tab', 'tarax': 'tarax', 'teucr': 'teucr', 'thuj': 'thuj',
    'tub': 'tub', 'valer': 'valer', 'verat': 'verat', 'viol-o': 'viol-o',
    'viol-t': 'viol-t', 'zinc': 'zinc',
}
