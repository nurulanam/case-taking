# Bangla Homeopathic Miasm Analyser

## Functional Specification (Version 1.0)

---

# Purpose

The **Miasm Analyser** is a clinical decision-support module designed for a Bangla web-based Classical Homeopathy application.

Its purpose is to analyze a patient's symptoms using a **rule-based JSON database** and estimate the dominant miasmatic background.

This module **does not prescribe medicine automatically**.

Instead, it provides:

* Miasm analysis
* Disease tendencies
* Supporting evidence
* Confidence score
* Educational explanations
* AI-ready structured output

---

# Objectives

The analyser should:

* Analyze the patient's complete symptom profile.
* Detect dominant and secondary miasms.
* Explain why a miasm was selected.
* Generate weighted scores.
* Produce AI-readable structured data.
* Assist practitioners in case analysis.

---

# Supported Miasms

The analyser should support:

* Psora (সোরা)
* Sycosis (সাইকোসিস)
* Syphilis (সিফিলিস)
* Tubercular (টিউবারকুলার)

Future versions may support:

* Cancer Miasm
* Ringworm Miasm
* Malarial Miasm
* Leprosy Miasm

The architecture should allow additional miasms without changing existing code.

---

# Data Source

The analyser must use a local JSON database.

No AI should determine the miasm directly.

Every symptom should contain weighted values for one or more miasms.

Example structure:

* Symptom ID
* Bangla name
* English name
* Category
* Description
* Weight for each miasm
* Optional notes

The scoring rules should be editable.

---

# Symptom Categories

The database should include symptoms from all major clinical areas.

## Mental Symptoms

Examples:

* Fear
* Anxiety
* Anger
* Sadness
* Irritability
* Depression
* Restlessness
* Jealousy
* Suspicion
* Lack of confidence
* Suicidal thoughts

---

## General Symptoms

Examples:

* Weakness
* Fatigue
* Weight gain
* Weight loss
* Obesity
* Thin body
* Chilly patient
* Hot patient
* Perspiration
* Fever tendency

---

## Thermal State

Examples:

* Chilly
* Hot
* Better by warmth
* Better by cold
* Cannot tolerate heat
* Cannot tolerate cold

---

## Modalities

Examples:

* Morning aggravation
* Evening aggravation
* Night aggravation
* Motion
* Rest
* Open air
* Closed room
* Damp weather
* Dry weather

---

## Appetite

Examples:

* Increased appetite
* Poor appetite
* Easily satisfied
* Never satisfied

---

## Thirst

Examples:

* Thirstless
* Intense thirst
* Frequent sips
* Large quantities

---

## Cravings

Examples:

* Sweet
* Salt
* Sour
* Spicy
* Eggs
* Milk
* Ice
* Cold water

---

## Aversions

Examples:

* Meat
* Milk
* Fat
* Bread
* Water

---

## Sleep

Examples:

* Sleeplessness
* Deep sleep
* Sleepiness
* Difficult waking
* Frequent waking

---

## Dreams

Examples:

* Falling
* Death
* Robbers
* Fire
* Water
* Snakes

---

## Skin

Examples:

* Eczema
* Warts
* Ulcers
* Dry skin
* Itching
* Vesicles
* Boils
* Cracks

---

## Bones

Examples:

* Bone pain
* Deformity
* Necrosis
* Curvature

---

## Glands

Examples:

* Enlarged glands
* Hard glands
* Painful glands

---

## Respiratory

Examples:

* Chronic cough
* Asthma
* Recurrent cold
* Tuberculosis history

---

## Digestive

Examples:

* Constipation
* Diarrhoea
* Acidity
* Flatulence

---

## Urinary

Examples:

* Burning
* Frequent urination
* Kidney stones

---

## Male

Examples:

* Prostate enlargement
* Gonorrhoeal history
* Testicular complaints

---

## Female

Examples:

* Leucorrhoea
* Menstrual irregularity
* Fibroids
* Ovarian cyst

---

## Children

Examples:

* Delayed growth
* Frequent infections
* Enlarged tonsils

---

## Family History

Examples:

* Tuberculosis
* Diabetes
* Cancer
* Mental illness
* Hypertension
* Autoimmune disorders

---

## Past History

Examples:

* Suppressed skin disease
* Repeated antibiotics
* Surgery
* Vaccination reactions

---

## Pathological Findings

Examples:

* Tumours
* Cysts
* Polyps
* Ulcers
* Degeneration
* Calcification
* Fibrosis

---

# Scoring Engine

Each selected symptom contributes weighted values.

The engine should:

* Add scores
* Normalize totals
* Rank miasms
* Calculate percentages
* Calculate confidence

---

# Analysis Workflow

1. Load symptom database.
2. Read patient selections.
3. Apply weighted scoring.
4. Calculate total scores.
5. Rank all miasms.
6. Detect dominant miasm.
7. Detect secondary miasm.
8. Detect mixed miasm patterns.
9. Generate reasoning.
10. Produce structured output.

---

# Mixed Miasm Detection

The analyser should detect combinations such as:

* Psoro-Sycotic
* Psoro-Tubercular
* Psoro-Syphilitic
* Syco-Syphilitic
* Tubercular-Sycotic
* Tubercular-Syphilitic

Mixed miasms should only be reported when configurable score thresholds are met.

---

# Scoreboard

The analyser should display:

* Total score
* Percentage
* Ranking
* Dominant miasm
* Secondary miasm
* Confidence score

The scoreboard should clearly indicate the relative contribution of each miasm.

---

# Reasoning Engine

Every result must explain:

* Which symptoms increased each miasm.
* Which categories contributed most.
* Why the dominant miasm was selected.
* Why secondary miasms were considered.

No result should be presented without supporting evidence.

---

# Educational Module

Each miasm should include:

* Definition
* Historical overview
* General characteristics
* Mental characteristics
* Physical characteristics
* Disease tendencies
* Common pathological changes
* Clinical notes
* Learning points

---

# Miasm Comparison

Provide side-by-side comparisons of all supported miasms, including:

* Mental picture
* Physical tendencies
* Thermal state
* Skin manifestations
* Glandular involvement
* Bone pathology
* Disease progression
* Typical modalities
* Common clinical presentations

---

# Disease Pattern

Based on the analysis, classify the case into patterns such as:

* Functional predominance
* Overgrowth tendency
* Destructive tendency
* Mixed pathology
* Chronic recurring tendency

These patterns should be derived from the scoring model and explained to the user.

---

# Remedy Suggestions

After completing the analysis, the module may list remedies commonly associated with the dominant miasm.

This list is educational only and should never replace full case analysis.

No automatic prescription should be generated.

---

# Search

Support searching by:

* Bangla symptom name
* English symptom name
* Category
* Keyword

---

# Filtering

Allow filtering by:

* Category
* Miasm
* Body system
* Mental
* Physical
* History
* Pathology

---

# AI Integration

Export structured analysis including:

* Selected symptoms
* Category totals
* Miasm scores
* Dominant miasm
* Secondary miasm
* Mixed miasm
* Confidence score
* Reasoning
* Suggested remedies

The exported data should be suitable for AI-assisted case analysis.

---

# Extensibility

The module should be designed so future additions require minimal changes.

Examples:

* New miasms
* Additional symptom categories
* New weighting rules
* Expanded remedy relationships
* Materia Medica integration
* Repertory engine integration
* Case history integration
* Follow-up analysis
* Prescription module integration

---

# Clinical Disclaimer

This analyser is intended as a **clinical decision-support and educational tool**. It should assist practitioners in understanding possible miasmatic tendencies based on configurable symptom weighting. Final diagnosis, miasmatic interpretation, and remedy selection remain the responsibility of the qualified homeopathic practitioner.
