#!/usr/bin/env python3
"""Generate docs/case-form-structure.json by parsing case.html directly.

case.html is static, hand-written markup — there is no schema driving it at
runtime (assets/data/case-form.json is unused dead code, not fetched by any
script). So a structure doc that lists fields by hand goes stale the moment
someone edits case.html without also updating the doc. Parsing the real
markup instead means the JSON can never disagree with the form.

Run after editing case.html:
    python3 tools/case_form_structure.py
"""
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
CASE_HTML = ROOT / "case.html"
OUT = ROOT / "docs" / "case-form-structure.json"


def field_from_label(label) -> dict:
    span = label.find("span")
    field_label = span.get_text(strip=True) if span else None
    classes = label.get("class", [])

    control = label.find(["input", "select", "textarea"])
    if control is None:
        return None

    entry = {
        "label": field_label,
        "name": control.get("name"),
        "full_width": "full" in classes,
    }

    if control.name == "input":
        entry["type"] = control.get("type", "text")
        if control.get("placeholder"):
            entry["placeholder"] = control["placeholder"]
        if control.get("required") is not None:
            entry["required"] = True
    elif control.name == "select":
        entry["type"] = "select"
        # <option value="">নির্বাচন করুন</option> is the unset placeholder —
        # detect it by the empty value attribute, not by its Bangla text,
        # which is real (non-empty) text and was slipping through as if it
        # were a genuine choice.
        entry["options"] = [
            o.get_text(strip=True) for o in control.find_all("option")
            if not (o.has_attr("value") and o["value"] == "")
        ]
    elif control.name == "textarea":
        entry["type"] = "textarea"
        if control.get("placeholder"):
            entry["placeholder"] = control["placeholder"]
        if control.get("rows"):
            entry["rows"] = int(control["rows"])
        entry["readonly"] = control.get("readonly") is not None
        if control.get("id"):
            entry["id"] = control["id"]

    return {k: v for k, v in entry.items() if v not in (None, False, [])}


def chip_from_div(div) -> dict:
    field_name = div.get("data-checks")
    options = (div.get("data-options") or "").split("|")
    label = None
    prev = div.find_previous_sibling(["span", "h4", "h5"])
    parent_span = div.parent.find("span") if div.parent else None
    if parent_span and parent_span.get_text(strip=True):
        label = parent_span.get_text(strip=True)
    elif prev:
        label = prev.get_text(strip=True)
    return {
        "widget": "chips",
        "name": field_name,
        "label": label,
        "compact": "compact" in div.get("class", []),
        "options": [o for o in options if o],
    }


def _inside_gender_panel(tag) -> bool:
    return tag.find_parent("div", class_="gender-panel") is not None


def walk_section(card, *, exclude_gender_panels=True) -> list:
    """One step's .card -> ordered list of fields / chip-groups, in the same
    order they appear in the markup.

    Gender-conditional fields are pulled into their own gender_panels() list
    (see below) rather than left in this flat list too — walking the whole
    card with find_all(recursive=True) originally counted every male/female
    field twice, once here and once nested under the step's own panel list.

    Fields and chip-groups were originally collected in two separate passes
    (all labels, then all chip divs), which threw away document order — a
    chip cluster declared before a textarea would still list after it. One
    pass over both tag kinds together, in the order find_all returns them,
    keeps the JSON reading in the same order a person reading case.html sees.
    """
    items = []

    for tag in card.find_all(["label", "div"], recursive=True):
        if exclude_gender_panels and _inside_gender_panel(tag):
            continue
        if tag.name == "label":
            if "field" not in tag.get("class", []):
                continue
            f = field_from_label(tag)
            if f:
                items.append({"widget": f.pop("type", "text"), **f})
        elif tag.name == "div":
            if not tag.has_attr("data-checks"):
                continue
            items.append(chip_from_div(tag))

    return items


def gender_panels(card) -> list:
    panels = []
    for panel in card.find_all("div", class_="gender-panel"):
        h4 = panel.find("h4")
        panels.append({
            "show_for": panel.get("data-show-for"),
            "title": h4.get_text(strip=True) if h4 else None,
            # False here: find_parent() treats the panel itself as its own
            # ancestor's match target, so the default True excluded every
            # field the moment we asked the panel for its own contents.
            "fields": walk_section(panel, exclude_gender_panels=False),
        })
    return panels


def main():
    soup = BeautifulSoup(CASE_HTML.read_text(encoding="utf-8"), "lxml")

    steps = []
    for section in soup.find_all("section", class_="form-step"):
        step_title = section.get("data-step-title")
        card = section.find("div", class_="card")
        heading = card.find("div", class_="section-heading")
        h3 = heading.find("h3") if heading else None
        p = heading.find("p") if heading else None
        num = heading.find("span", class_="section-number") if heading else None

        tab = soup.find("button", class_="step-tab", attrs={"data-step": True},
                         string=None)
        step_index = len(steps) + 1
        tab_btn = soup.select_one(f'.step-tab[data-step="{step_index}"] span')

        # gender-conditional sub-cards are pulled out separately so the flat
        # field list below doesn't duplicate them under two shapes
        gp = gender_panels(card)
        gp_panel_ids = {id(p) for gender in gp for p in
                        card.find_all("div", class_="gender-panel")}

        fields = walk_section(card)

        steps.append({
            "step": step_index,
            "nav_label": tab_btn.get_text(strip=True) if tab_btn else None,
            "title": h3.get_text(strip=True) if h3 else step_title,
            "subtitle": p.get_text(strip=True) if p else None,
            "section_number_bn": num.get_text(strip=True) if num else None,
            "fields": fields,
            **({"gender_conditional_panels": gp} if gp else {}),
        })

    doc = {
        "$schema_note": (
            "Generated from case.html by tools/case_form_structure.py — "
            "do not hand-edit; re-run the script after changing the form."
        ),
        "source_of_truth": "case.html (static markup, not schema-driven at runtime)",
        "unused_legacy_file": (
            "assets/data/case-form.json is not fetched by any script — "
            "an older schema kept in the repo but not wired to anything."
        ),
        "behavior_file": "assets/js/case-form.js",
        "total_steps": len(steps),
        "patterns": {
            "field": "label.field > span (label text) + input|select|textarea; "
                     ".field.full spans both grid columns",
            "chips": "div.chips[.compact][data-checks=name][data-options='a|b|c'] "
                     "renders one toggle button per option; case-form.js reads "
                     "data-checks as the field name and collects ticked options "
                     "into an array under that name",
            "sub_card": "div.sub-card groups a themed cluster of fields inside a "
                        "step's .card; .sub-card.warning-card is the same, styled "
                        "for the step-3 red-flag block",
            "gender_conditional": "div.sub-card.gender-panel[data-show-for=value] "
                                  "stays mounted at all times; case-form.js shows "
                                  "only the panel matching the #gender select",
            "complaint_repeater": "step 2's #complaintsContainer starts empty and "
                                  "is filled by addComplaint() in case-form.js on "
                                  "load and on '+ আরও অভিযোগ যোগ করুন' — the one "
                                  "part of the form templated in JS, not static "
                                  "HTML. Fields per complaint: comp_desc_N, "
                                  "comp_duration_N, comp_severity_N.",
        },
        "data_flow": {
            "autosave": "every field change serialized to localStorage under "
                        "'homeoCaseDraft', restored by restoreDraft() on load",
            "repertory_handoff": "#toRepertoryBtn (step 9) sends current "
                                 "complaints to repertory.html; rubric1..rubric6 "
                                 "are filled back in on return",
            "prescription_handoff": "#toRxFromCase links to "
                                    "prescription.html?from=case, which reads "
                                    "the same draft",
            "report_generation": "submitting the form (#generateBtn, "
                                 "type=submit) calls generateReport(), which "
                                 "writes a plain-Bangla-text summary of every "
                                 "filled field into #aiOutput; #copyBtn / "
                                 "#downloadBtn export it",
        },
        "steps": steps,
    }

    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")

    total_fields = sum(len(s["fields"]) for s in steps)
    total_chips = sum(1 for s in steps for f in s["fields"] if f["widget"] == "chips")
    print(f"steps: {len(steps)}")
    print(f"fields (incl. chip groups): {total_fields}  ·  chip groups: {total_chips}")
    print(f"written: {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
