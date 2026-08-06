# -*- coding: utf-8 -*-
"""Bangla for Bönninghausen's Characteristics Repertory chapter names.

Rubric-name segments reuse Kent's own glossary (tools/kent_bn.py) — the
vocabulary of modalities, times, and body words is the same across both
books, and Kent's `bn_rubric` already knows how to compose a comma-joined
rubric name segment by segment.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kent_bn import bn_rubric  # noqa: F401  (re-exported for build_boenninghausen.py)

CHAPTER_BN = {
    'Mind': 'মন',
    'Sensorium': 'সংজ্ঞা ও বোধশক্তি',
    'Vertigo': 'মাথা ঘোরা',
    'Head, internal': 'মাথা, ভিতরের',
    'Head, external': 'মাথা, বাইরের',
    'Eyes': 'চোখ',
    'Eyes, vision': 'চোখ, দৃষ্টি',
    'Ears': 'কান',
    'Nose': 'নাক',
    'Nose, coryza': 'নাক, সর্দি',
    'Face': 'মুখমণ্ডল',
    'Teeth': 'দাঁত',
    'Mouth': 'মুখগহ্বর',
    'Appetite': 'ক্ষুধা',
    'Thirst': 'তৃষ্ণা',
    'Taste': 'স্বাদ',
    'Eructation': 'ঢেঁকুর',
    'Waterbrash and heartburn': 'মুখে জল ওঠা ও বুকজ্বালা',
    'Hiccough': 'হেঁচকি',
    'Nausea and vomiting': 'বমিভাব ও বমি',
    'Stomach and epigastrium': 'পাকস্থলী ও জঠর অঞ্চল',
    'Hypochondria': 'পাঁজরের নিচের অঞ্চল',
    'Abdomen': 'উদর',
    'Abdomen, external': 'উদর, বাইরের',
    'Inguinal and pubic region': 'কুঁচকি ও তলপেটের অঞ্চল',
    'Flatulence': 'পেটে বায়ু',
    'Stool': 'মল',
    'Anus and rectum': 'পায়ু ও মলদ্বার',
    'Perineum': 'পেরিনিয়াম',
    'Prostate gland': 'প্রস্টেট গ্রন্থি',
    'Urine': 'প্রস্রাব',
    'Urinary organs': 'মূত্র অঙ্গ',
    'Genitalia': 'জননাঙ্গ',
    'Male organs': 'পুরুষ জননাঙ্গ',
    'Female organs': 'নারী জননাঙ্গ',
    'Sexual impulse': 'যৌন কামনা',
    'Menstruation': 'ঋতুস্রাব',
    'Respiration': 'শ্বাস',
    'Cough': 'কাশি',
    'Larynx and trachea': 'কণ্ঠনালি ও শ্বাসনালি',
    'Voice and speech': 'কণ্ঠস্বর ও কথা',
    'Neck and external throat': 'ঘাড় ও বাইরের গলা',
    'Chest': 'বুক',
    'Back': 'পিঠ',
    'Upper extremities': 'ঊর্ধ্বাঙ্গ (হাত)',
    'Lower extremities': 'নিম্নাঙ্গ (পা)',
    'Sensations and complaints in general': 'সাধারণ অনুভূতি ও উপসর্গ',
    'Skin and exterior body': 'ত্বক ও শরীরের বাইরের অংশ',
    'Sleep': 'ঘুম',
    'Dreams': 'স্বপ্ন',
    'Fever': 'জ্বর',
    'Blood': 'রক্ত',
    'Circulation': 'রক্তসঞ্চালন',
    'Fever, chill, etc': 'জ্বর, শীত ইত্যাদি',
    'Heat and fever in general': 'সাধারণভাবে উত্তাপ ও জ্বর',
    'Sweat': 'ঘাম',
    'Compound fever': 'যৌগিক জ্বর',
    'Conditions in general, time': 'সাধারণ অবস্থা, সময়',
    'Conditions of aggravation and amelioration in general': 'সাধারণ বৃদ্ধি ও উপশমের অবস্থা',
}

if __name__ == '__main__':
    from boen_html import CHAPTERS
    missing = [name for name, _ in CHAPTERS if name not in CHAPTER_BN]
    print('chapters:', len(CHAPTERS), '| translated:', len(CHAPTER_BN), '| missing:', missing)
