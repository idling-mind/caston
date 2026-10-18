import json
import sys
from pathlib import Path

# Add tools directory to path
sys.path.insert(0, str(Path(__file__).parent))

from trivia_data.science import QUESTIONS as science_q
from trivia_data.geography import QUESTIONS as geo_q
from trivia_data.history import QUESTIONS as hist_q
from trivia_data.popculture import QUESTIONS as pop_q
from trivia_data.music import QUESTIONS as music_q
from trivia_data.gaming_tech import QUESTIONS as tech_q
from trivia_data.sports import QUESTIONS as sports_q
from trivia_data.food_drink import QUESTIONS as food_q
from trivia_data.arts_mythology import QUESTIONS as arts_q
from trivia_data.general import QUESTIONS as gen_q

ALL_QUESTIONS = (
    science_q + geo_q + hist_q + pop_q + music_q +
    tech_q + sports_q + food_q + arts_q + gen_q
)

print(f"Total compiled questions: {len(ALL_QUESTIONS)}")

# Validation suite
seen_questions = set()
duplicates = []
errors = []

for idx, q in enumerate(ALL_QUESTIONS):
    # Check question string
    q_text = q.get("q", "").strip()
    if not q_text:
        errors.append(f"Question {idx}: empty text")
    if q_text.lower() in seen_questions:
        duplicates.append(f"Duplicate question at {idx}: '{q_text}'")
    seen_questions.add(q_text.lower())

    # Check options
    opts = q.get("options", [])
    if len(opts) != 4:
        errors.append(f"Question '{q_text}': options count is {len(opts)}, expected 4")
    for opt in opts:
        if not str(opt).strip():
            errors.append(f"Question '{q_text}': empty option in {opts}")

    # Check answer index
    ans = q.get("answer")
    if ans not in (0, 1, 2, 3):
        errors.append(f"Question '{q_text}': invalid answer index {ans}")

    # Check difficulty
    diff = q.get("difficulty")
    if diff not in ("easy", "medium", "hard"):
        errors.append(f"Question '{q_text}': invalid difficulty '{diff}'")

    # Check category
    cat = q.get("category")
    if not cat:
        errors.append(f"Question '{q_text}': missing category")

if duplicates:
    print(f"ERROR: Found {len(duplicates)} duplicate questions:")
    for d in duplicates[:10]:
        print("  -", d)
    sys.exit(1)

if errors:
    print(f"ERROR: Found {len(errors)} validation errors:")
    for e in errors[:10]:
        print("  -", e)
    sys.exit(1)

assert len(ALL_QUESTIONS) >= 500, f"Expected at least 500 questions, got {len(ALL_QUESTIONS)}"

# Count by difficulty
diff_counts = {"easy": 0, "medium": 0, "hard": 0}
cat_counts = {}
for q in ALL_QUESTIONS:
    diff_counts[q["difficulty"]] += 1
    cat_counts[q["category"]] = cat_counts.get(q["category"], 0) + 1

print("\nDifficulty breakdown:")
for d, c in diff_counts.items():
    print(f"  {d.capitalize()}: {c} questions")

print("\nCategory breakdown:")
for cat, count in sorted(cat_counts.items()):
    print(f"  {cat}: {count} questions")

# Output path
out_file = Path(__file__).parent.parent / "static" / "js" / "games" / "trivia-questions.js"
print(f"\nWriting to {out_file}...")

js_content = """/* ==========================================================================
   CastOn — Trivia Question Bank
   Verified dataset of 500+ diverse questions across Easy, Medium, and Hard tiers.
   Auto-generated and validated by tools/build_questions.py
   ========================================================================== */
(function (w) {
'use strict';

const C = (w.CastOn = w.CastOn || {});

C.TRIVIA_QUESTIONS = """ + json.dumps(ALL_QUESTIONS, indent=2, ensure_ascii=False) + """;

})(window);
"""

out_file.write_text(js_content, encoding="utf-8")
print(f"SUCCESS: Successfully generated {out_file.name} with {len(ALL_QUESTIONS)} unique questions!")

