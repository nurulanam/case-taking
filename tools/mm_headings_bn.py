# -*- coding: utf-8 -*-
"""Bangla for the section headings used by Boericke and Clarke.

The two source books carry ~1.3 million words of English clinical prose between
them, which cannot be hand-translated and must not be machine-translated — a
mistranslated symptom is indistinguishable from a real one. Their *headings*,
though, are a closed set of 101 labels, so those are translated in full: the
English panel becomes navigable in Bangla even where the prose stays English,
and a reader can find "মন" or "পাকস্থলী" without reading English at all.

Every heading in both books is covered; the build asserts that, so a new heading
appearing in a re-crawl fails loudly instead of silently showing English.
"""

HEAD_BN = {
    # ---- Clarke's prose sections
    'Clinical': 'ক্লিনিক্যাল প্রয়োগ',
    'Characteristics': 'চারিত্রিক লক্ষণ',
    'Relations': 'সম্পর্ক',
    'Relationship': 'সম্পর্ক',
    'Relationships': 'সম্পর্ক',
    'Causation': 'কারণ',
    'Causations': 'কারণ',
    'Antidotes': 'প্রতিষেধক',
    'Dose': 'মাত্রা',
    'Doses': 'মাত্রা',
    'Physiologic Dosage': 'শারীরবৃত্তীয় মাত্রা',
    'Uses': 'ব্যবহার',
    'Non-Homeopathic Uses': 'হোমিওপ্যাথি-বহির্ভূত ব্যবহার',
    'Non-homeopathic Uses': 'হোমিওপ্যাথি-বহির্ভূত ব্যবহার',
    'Modalities': 'মোডালিটি',
    'Modality': 'মোডালিটি',

    # ---- mind and head
    'Mind': 'মন',
    'Mental': 'মানসিক',
    'Mind and Head': 'মন ও মাথা',
    'Head': 'মাথা',
    'Head and Stomach': 'মাথা ও পাকস্থলী',

    # ---- senses
    'Eyes': 'চোখ',
    'Eye': 'চোখ',
    'Eyes and Ears': 'চোখ ও কান',
    'Ears': 'কান',
    'Ear': 'কান',
    'Nose': 'নাক',
    'Nose and throat': 'নাক ও গলা',
    'Face': 'মুখমণ্ডল',
    'Mouth': 'মুখগহ্বর',
    'Tongue': 'জিহ্বা',
    'Teeth': 'দাঁত',
    'Teeth and Gums': 'দাঁত ও মাড়ি',
    'Throat': 'গলা',

    # ---- digestion
    'Appetite': 'ক্ষুধা',
    'Appetite and Taste': 'ক্ষুধা ও স্বাদ',
    'Stomach': 'পাকস্থলী',
    'Gastric': 'পাকস্থলী-সংক্রান্ত',
    'Stomach and Abdomen': 'পাকস্থলী ও উদর',
    'Abdomen': 'উদর',
    'Abdomen and Liver': 'উদর ও যকৃৎ',
    'Abdomen and Stool': 'উদর ও মল',
    'Bowels': 'অন্ত্র',
    'Alimentary Canal': 'পাচননালি',
    'Gastro-enteric Symptoms': 'পাকস্থলী ও অন্ত্রের লক্ষণ',
    'Gastro-intestinal': 'পাকস্থলী ও অন্ত্র',
    'Gastro-Intestinal': 'পাকস্থলী ও অন্ত্র',
    'Liver': 'যকৃৎ',
    'Spleen': 'প্লীহা',
    'Stool': 'মল',
    'Stools': 'মল',
    'Stool and Anus': 'মল ও পায়ু',
    'Stool and Rectum': 'মল ও মলদ্বার',
    'Rectum': 'মলদ্বার',
    'Rectum and Stool': 'মলদ্বার ও মল',
    'Anus': 'পায়ু',

    # ---- urinary and genital
    'Urinary': 'মূত্রতন্ত্র',
    'Urinary Organs': 'মূত্র অঙ্গ',
    'Urine': 'প্রস্রাব',
    'Kidney': 'কিডনি',
    'Genito-urinary': 'মূত্র ও জননাঙ্গ',
    'Male': 'পুরুষ জননাঙ্গ',
    'Male Sexual Organs': 'পুরুষ জননাঙ্গ',
    'Female': 'নারী জননাঙ্গ',
    'Female Sexual Organs': 'নারী জননাঙ্গ',
    'Sexual': 'যৌন অঙ্গ',
    'Breast': 'স্তন',

    # ---- chest, heart, respiration
    'Respiration': 'শ্বাস',
    'Respiratory': 'শ্বাসতন্ত্র',
    'Respiratory Organs': 'শ্বাস অঙ্গ',
    'Chest': 'বুক',
    'Heart': 'হৃদয়',
    'Heart and Pulse': 'হৃদয় ও নাড়ি',
    'Heart and Circulation': 'হৃদয় ও রক্তসঞ্চালন',
    'Cardio-Vascular': 'হৃদয় ও রক্তনালি',
    'Circulatory Organs': 'রক্তসঞ্চালন অঙ্গ',
    'Pulse': 'নাড়ি',
    'Blood': 'রক্ত',

    # ---- back and limbs
    'Neck': 'ঘাড়',
    'Neck and Back': 'ঘাড় ও পিঠ',
    'Neck, Back, and Trunk': 'ঘাড়, পিঠ ও ধড়',
    'Back': 'পিঠ',
    'Spine': 'মেরুদণ্ড',
    'Back and Extremities': 'পিঠ ও হাত-পা',
    'Back and extremities': 'পিঠ ও হাত-পা',
    'Extremities': 'হাত-পা',
    'Limbs': 'অঙ্গপ্রত্যঙ্গ',
    'Limbs in General': 'সাধারণভাবে অঙ্গপ্রত্যঙ্গ',
    'Upper Limbs': 'ঊর্ধ্বাঙ্গ (হাত)',
    'Lower Limbs': 'নিম্নাঙ্গ (পা)',
    'Bones': 'অস্থি',

    # ---- nerves, skin, general
    'Nerves': 'স্নায়ু',
    'Nervous': 'স্নায়বিক',
    'Nervous System': 'স্নায়ুতন্ত্র',
    'Skin': 'ত্বক',
    'Skin and Tissues': 'ত্বক ও কোষকলা',
    'Tissues': 'কোষকলা',
    'Sleep': 'ঘুম',
    'Fever': 'জ্বর',
    'Generalities': 'সাধারণ লক্ষণ',
    'General Symptoms': 'সাধারণ লক্ষণ',
}
