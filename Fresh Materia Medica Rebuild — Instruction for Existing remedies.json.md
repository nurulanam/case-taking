# Fresh Materia Medica Rebuild Instruction

## 1. Project Context

The project already has a master `remedies.json` containing the shared remedy roster used by all repertories.

This file is structurally important and MUST NOT be redesigned or broken.

Current architecture:

- Total remedies: **725**
- Remedies with full Materia Medica: **686**
- Basic-entry-only remedies: **39**
- Remedies with Bangla name: **589**
- Materia Medica volumes:
  - Volume 1: 116
  - Volume 2: 185
  - Volume 3: 385

The `id` of each remedy is already connected to repertory data.

Therefore:

> **Do NOT create a new remedy roster. Rebuild the Materia Medica content inside the existing remedy records.**

---

# 2. Immutable Fields

The following fields are infrastructure-level data and must not be changed unless explicitly instructed:

```text
id
name
abbr
in_rubrics
mm_volume
```

Changing the remedy `id` or its roster position can break existing repertory references.

Never:

- rename IDs casually
- regenerate IDs
- reorder the master remedy roster
- merge two remedies because their names look similar
- create duplicate remedy IDs
- delete remedies from the shared roster

If a naming correction is required, preserve the existing ID.

---

# 3. Existing Materia Medica Schema

The current schema already contains fields such as:

```text
bangla_name
family
content_status
thermal
thermal_en
miasm
bangla_intro
keynotes
mental
general
modalities
clinical_uses
cravings_aversions
relationships
sleep
potency_notes
```

These fields should be **improved and completed**, not replaced with an unrelated schema.

Additional fields may be added only when genuinely necessary and when they remain backward-compatible with the application.

---

# 4. Main Objective

Rebuild the Materia Medica content **fresh from reliable source material**.

The objective is NOT:

> “Make the existing text prettier.”

The objective is:

> “Create a more accurate, complete, consistent, source-grounded and clinically useful representation of each remedy while preserving the existing application architecture.”

Existing content should therefore be treated as:

```text
CURRENT DATA
      ↓
SOURCE VERIFICATION
      ↓
CORRECTION
      ↓
EXPANSION
      ↓
NORMALIZATION
      ↓
QUALITY VALIDATION
      ↓
FINAL MATERIA MEDICA
```

Do not blindly trust the current content.

---

# 5. Source-First Rule

Every substantive Materia Medica claim should be traceable to a source.

Priority:

1. Original/provings source
2. Reliable primary Materia Medica
3. Established historical Materia Medica
4. Reliable secondary reference
5. Existing project data
6. AI interpretation

AI-generated knowledge must NEVER silently become source-derived fact.

If a statement cannot be verified, mark it internally as:

```text
unverified
```

rather than presenting it as established fact.

---

# 6. Preserve Source Meaning

When converting source material into Bangla:

- preserve the original clinical meaning
- do not exaggerate
- do not simplify away important modalities
- do not convert metaphorical wording into a literal diagnosis
- do not add symptoms merely because they are commonly associated with the remedy
- do not convert an author's opinion into universal fact

Historical terminology may be modernized for readability, but the original meaning must remain intact.

---

# 7. `bangla_intro`

`bangla_intro` should be a concise **remedy essence**, not a full Materia Medica paragraph.

It should ideally communicate:

- central sphere of action
- strongest characteristic
- important modality
- distinctive keynote

Example style:

```text
অমুক — অমুক অঙ্গের উপর প্রধান ক্রিয়া; বিশেষ অনুভূতি ও নির্দিষ্ট modality-র জন্য পরিচিত।
```

Avoid generic statements such as:

```text
এই ওষুধটি বিভিন্ন রোগে ব্যবহৃত হয়।
```

---

# 8. Keynotes

`keynotes` must contain only genuinely characteristic features.

Prioritize:

- Strange, Rare, Peculiar symptoms
- unusual sensations
- striking modalities
- peculiar concomitants
- characteristic causations
- strong constitutional features
- repeatedly emphasized features in reliable sources

Do NOT fill the array with ordinary symptoms simply to make the remedy appear comprehensive.

A keynote should answer:

> “What makes this remedy recognizable?”

---

# 9. Mental Symptoms

`mental` should represent the remedy's characteristic mental/emotional picture.

Do NOT simply convert every psychological symptom into a personality description.

Distinguish between:

```text
ordinary emotion
```

and:

```text
characteristic pathological mental symptom
```

Where possible, preserve:

- trigger
- intensity
- circumstances
- accompanying physical symptoms
- modality
- peculiar expression

Avoid unsupported labels such as:

```text
jealous
angry
depressed
anxious
```

unless supported by the source context.

---

# 10. General Symptoms

`general` should contain important general/systemic features that help distinguish the remedy.

Examples:

- weakness
- thermal state
- perspiration
- constitutional tendencies
- general pains
- periodicity
- sleep-related generalities
- food effects
- weather effects
- whole-body sensations

Do not duplicate every local symptom here.

---

# 11. Modalities

Modalities are extremely important and must be preserved accurately.

Use a consistent structure:

```text
বৃদ্ধি: ...
উপশম: ...
```

Whenever possible distinguish:

### Time

- morning
- noon
- afternoon
- evening
- night
- midnight

### Environment

- heat
- cold
- damp
- dry weather
- open air
- closed room

### Activity

- motion
- rest
- lying
- sitting
- standing
- walking

### Physiological circumstances

- before eating
- after eating
- during menstruation
- during perspiration
- after stool
- after urination
- during sleep

Do not infer a modality simply because another symptom suggests it.

---

# 12. Thermal State

If thermal information exists, verify it against source material.

Do not force every remedy into:

```text
hot
```

or

```text
chilly
```

If the source contains contradictory or context-dependent thermal information, preserve that nuance.

For example:

```text
গরমে বৃদ্ধি — কিন্তু উষ্ণ পানিতে নির্দিষ্ট symptom উপশম
```

is not automatically contradictory.

---

# 13. Miasm

The existing:

```text
miasm
```

field must be treated carefully.

Miasmatic classification is author/system dependent.

Therefore:

- do not invent a miasm
- do not infer one merely from symptoms
- do not present an author's interpretation as universal fact
- if different sources disagree, preserve the distinction

If unsupported, leave it empty rather than guessing.

---

# 14. Clinical Uses

`clinical_uses` should NOT become a generic disease list.

A clinical use should have meaningful Materia Medica correspondence.

Bad:

```text
["headache", "fever", "skin disease"]
```

Better:

```text
["নির্দিষ্ট modality-সহ migraine",
 "বিশেষ ধরনের chronic eczema",
 "নির্দিষ্ট characteristic cough"]
```

where supported by the source.

The presence of a disease name alone does not prove that the remedy is indicated for every case of that disease.

---

# 15. Food Cravings and Aversions

Use:

```json
{
  "cravings": [],
  "aversions": []
}
```

only when source-supported.

Do not infer food preferences from general constitutional stereotypes.

Preserve unusual food cravings because they may be highly characteristic.

---

# 16. Relationships

Existing:

```text
relationships
```

must be preserved.

Possible categories:

```text
complementary
antidotes
inimical
follows_well
followed_by
similar
```

However, only populate categories that are actually supported by reliable source material.

Do not automatically generate relationships.

Example:

```json
"relationships": {
  "complementary": [
    "Abies Nigra"
  ]
}
```

must have source justification.

---

# 17. Sleep and Dreams

If `sleep` exists, use it for:

- difficulty falling asleep
- waking pattern
- sleep position
- sleep aggravations
- sleep ameliorations

Dreams should be separated conceptually from ordinary sleep disturbance.

Important peculiar dreams should be preserved when source-supported.

---

# 18. Potency Notes

`potency_notes` must NOT be treated as a universal prescription instruction.

Historical potency information can be retained as:

```text
source-derived historical usage
```

but must not be converted into:

> “Take X potency every Y hours.”

Do not create dosage schedules from Materia Medica text.

---

# 19. System-Wise Completeness

A full remedy should ideally cover the important available information across:

```text
Mind
Head
Eyes
Ears
Nose
Face
Mouth
Throat
Stomach
Abdomen
Rectum
Stool
Urinary
Male
Female
Respiratory
Chest
Heart
Back
Extremities
Skin
Sleep
Dreams
Fever
Generals
```

However:

> **Do not manufacture missing symptoms to make every remedy structurally complete.**

If a source does not provide meaningful information for a system, leave it absent.

---

# 20. Do Not Overcompress

Avoid reducing a large Materia Medica into:

```text
5 keynotes + 3 mental + 5 general + 5 clinical uses
```

just to keep JSON small.

The goal is a **usable Materia Medica**, not merely a remedy summary.

At the same time, do not dump entire books into a single remedy field.

The data should represent:

```text
structured knowledge
```

rather than:

```text
unstructured book text
```

---

# 21. Preserve Important Peculiar Wording

When a symptom has a distinctive traditional expression, preserve its meaning.

For example:

```text
“যেন শক্ত সিদ্ধ ডিম আটকে আছে”
```

may be more clinically useful than replacing it with:

```text
“গলায় অস্বস্তি”
```

The peculiar sensation is the important information.

---

# 22. Normalization

Normalize equivalent concepts while preserving original wording.

Example:

```text
itching
চুলকানি
itch
```

should map to the same normalized concept.

But the original source wording should not be destroyed.

Use:

```text
source wording
+
normalized concept
```

rather than replacing one with the other.

---

# 23. Duplicate Detection

Before adding a new symptom:

1. Check whether the same concept already exists.
2. Check wording variations.
3. Check synonyms.
4. Check whether the information belongs under another field.
5. Merge only when semantic equivalence is clear.

Do not merge merely because two symptoms sound similar.

---

# 24. Contradiction Detection

If sources disagree:

```text
Source A → heat aggravates
Source B → heat ameliorates
```

do NOT silently choose one.

Flag it for verification.

Possible internal status:

```text
conflict
```

The final data may preserve both source-specific observations.

---

# 25. Translation Rules

Bangla translation must be:

- medically understandable
- natural Bengali
- faithful to source meaning
- consistent across remedies
- terminology-consistent

Avoid unnecessary literal translation.

For example:

```text
burning
```

should consistently map to:

```text
জ্বালাপোড়া
```

unless context requires a more precise term.

Maintain a project-wide medical terminology glossary.

---

# 26. No Hallucination Rule

The following are strictly prohibited:

- invented keynote
- invented modality
- invented clinical use
- invented miasm
- invented complementary remedy
- invented antidote
- invented food craving
- invented potency
- invented mental symptom
- invented source attribution

If uncertain:

```text
leave empty
```

or mark:

```text
unverified
```

---

# 27. Existing Data Is Not Automatically Correct

The current 686 full entries should be treated as **legacy structured content**.

For every remedy:

```text
Existing data
     ↓
Audit
     ↓
Source comparison
     ↓
Correct errors
     ↓
Remove unsupported claims
     ↓
Add missing important information
     ↓
Normalize terminology
     ↓
Finalize
```

Do not preserve a statement merely because it already exists in `remedies.json`.

---

# 28. Remedy-by-Remedy Workflow

Process one remedy at a time.

For each remedy:

### Step 1
Load existing entry.

### Step 2
Identify all current claims.

### Step 3
Collect permitted source material.

### Step 4
Extract source-supported information.

### Step 5
Compare source data with existing data.

### Step 6
Remove unsupported or incorrect information.

### Step 7
Add missing characteristic information.

### Step 8
Normalize Bangla terminology.

### Step 9
Validate fields.

### Step 10
Save the rebuilt remedy.

### Step 11
Run JSON/schema validation.

---

# 29. Quality Levels

Each rebuilt remedy should internally be classified as:

```text
verified
partially_verified
needs_review
```

Do not expose this field to the application unless required.

---

# 30. Final Validation

After each batch, validate:

```text
✓ Valid JSON
✓ Existing remedy ID preserved
✓ Remedy count unchanged
✓ No duplicate IDs
✓ No missing mandatory identity fields
✓ Existing repertory references intact
✓ No broken relationships
✓ No invalid arrays
✓ No accidental English/Bangla corruption
✓ No unsupported claims
✓ No duplicate symptoms
✓ No contradictory data silently merged
✓ No source information lost
```

At project completion:

```text
725 remedies must remain
686 existing full-Materia-Medica remedies must remain identifiable
39 basic entries must remain intact unless explicitly upgraded
```

---

# 31. Final Principle

This project is NOT about producing a short list of popular remedy keynotes.

The target is:

> **A fresh, structured, source-grounded Bangla Materia Medica built on the existing 725-remedy master roster, while preserving every repertory reference and improving the quality, completeness, consistency and reliability of the existing 686 full remedy entries.**

The golden rule is:

**Never add information because it “sounds like” the remedy.  
Add it only because the source supports it.**

And:

**Never break the existing remedy IDs or roster structure while rebuilding the Materia Medica.**