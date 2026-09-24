#!/usr/bin/env python3
"""Generate data/exercise-guide.json from data/skills.json.

For every skill this assigns:
  - an animation archetype (which Three.js movement the figure plays),
  - the apparatus and camera framing that archetype needs,
  - step-by-step "how to do it" instructions, and
  - the target pulled from the skill's own rep/hold standard.

The archetype rules and the written coaching cues live here, so the whole guide
is regenerated deterministically and hand-tuned from this one file — the same
pattern as tools/build_skills.py. Edit here, run this, then check_data.py.

    python3 tools/build_guide.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / "data" / "skills.json"
OUT = ROOT / "data" / "exercise-guide.json"

# --- archetypes -----------------------------------------------------------
# Each archetype drives one Three.js animation. `motion` is 'reps' (the figure
# cycles) or 'hold' (it settles into the position with a slow tension breath).
# `apparatus` and `view` tell the animator what to draw and where to look from.
ARCHETYPES = {
    "pushup": {
        "label": "Push-up", "apparatus": "floor", "view": "side", "motion": "reps",
        "setup": "Hands under the shoulders, body in one straight line from heels to head, core and glutes tight.",
        "steps": [
            "Lower under control until the chest is a fist off the floor, elbows tracking back at roughly 45°.",
            "Keep the line from heels to head rigid — the hips do not sag or pike.",
            "Press back to full lockout and repeat.",
        ],
        "cue": "Elbows back, not flared. Squeeze the glutes so the hips never lead.",
        "mistake": "Sagging hips or elbows flaring straight out to the sides.",
    },
    "pseudo": {
        "label": "Pseudo push-up", "apparatus": "parallettes", "view": "side", "motion": "reps",
        "setup": "Hands at hip level, fingers turned out, shoulders leaning forward past the wrists.",
        "steps": [
            "Keep the arms straight and lean the shoulders further ahead of the hands to load them.",
            "Lower a few inches while holding that forward lean, then press the floor away.",
            "The further forward the lean, the closer this gets to a planche.",
        ],
        "cue": "Protract the shoulders — round the upper back and push the floor down.",
        "mistake": "Letting the shoulders drift back behind the wrists and losing the lean.",
    },
    "planche": {
        "label": "Planche", "apparatus": "parallettes", "view": "side", "motion": "hold",
        "setup": "Straight arms, shoulders leaned well forward, body horizontal and hollow.",
        "steps": [
            "Lean until the shoulders are far ahead of the hands and the feet leave the floor.",
            "Hold the body parallel to the ground — arms locked, shoulders protracted, glutes tight.",
            "Hips and heels stay level with the shoulders in one flat line.",
        ],
        "cue": "Arms stay dead straight. The lean, not the arms, carries the hold.",
        "mistake": "Bending the arms or letting the hips pike up above the line.",
    },
    "dip": {
        "label": "Dip", "apparatus": "parallettes", "view": "side", "motion": "reps",
        "setup": "Supported on straight arms, shoulders down, slight forward lean of the torso.",
        "steps": [
            "Lower until the shoulders drop just below the elbows, elbows tracking back.",
            "Keep the torso leaned slightly forward and the shoulders away from the ears.",
            "Press back to a strong lockout at the top.",
        ],
        "cue": "Shoulders down and back — never shrug up toward the ears.",
        "mistake": "Shrugging at the bottom or flaring the elbows wide.",
    },
    "pullup": {
        "label": "Pull-up", "apparatus": "bar", "view": "front", "motion": "reps",
        "setup": "Dead hang from the bar, shoulders active, core braced, legs still.",
        "steps": [
            "Pull the elbows down and back, driving the chest toward the bar.",
            "Bring the chin over the bar without kipping or swinging.",
            "Lower all the way to a full dead hang and repeat.",
        ],
        "cue": "Start by pulling the shoulder blades down before the arms bend.",
        "mistake": "Kicking the legs to kip, or stopping short of a full hang.",
    },
    "muscleup": {
        "label": "Muscle-up", "apparatus": "bar", "view": "front", "motion": "reps",
        "setup": "Hang from the bar with a slightly false grip, wrists over the top.",
        "steps": [
            "Pull explosively, bringing the chest high and leaning it over the bar.",
            "Roll the wrists over the top and transition the elbows up as the chest clears.",
            "Press out of the dip to a full support, then lower under control.",
        ],
        "cue": "Pull to the sternum, then turn the wrists over fast — the transition is a roll, not a jump.",
        "mistake": "Pulling only to the chin and having nothing left for the transition.",
    },
    "lever": {
        "label": "Front / back lever", "apparatus": "bar", "view": "side", "motion": "hold",
        "setup": "Hang from the bar with straight arms and a hollow, tight body.",
        "steps": [
            "Pull the bar toward the hips with straight arms and lift the body to horizontal.",
            "Hold the whole body in one rigid line, parallel to the floor.",
            "Keep the shoulders depressed and the lats engaged the entire hold.",
        ],
        "cue": "Straight arms, straight body. Squeeze everything and pull the bar to the waist.",
        "mistake": "Bending at the hips or letting the arms bend to cheat the line.",
    },
    "handstand": {
        "label": "Handstand", "apparatus": "floor", "view": "front", "motion": "hold",
        "setup": "Hands shoulder-width, fingers spread, arms locked overhead.",
        "steps": [
            "Stack the hips over the shoulders and the shoulders over the hands.",
            "Push the floor away hard, ribs tucked and glutes tight in one straight line.",
            "Balance with small pressure changes through the fingertips, not the whole hand.",
        ],
        "cue": "Push tall through the shoulders and grip the floor with the fingertips.",
        "mistake": "Banana back — ribs flared and hips arched behind the hands.",
    },
    "hspu": {
        "label": "Handstand push-up", "apparatus": "wall", "view": "front", "motion": "reps",
        "setup": "Handstand against the wall, hands slightly wider than the shoulders.",
        "steps": [
            "Lower under control until the head is just above the floor.",
            "Keep the elbows tracking slightly forward, body stacked and tight.",
            "Press back to a full lockout overhead.",
        ],
        "cue": "Lower slowly — control the descent rather than dropping into it.",
        "mistake": "Arching the back to press instead of driving straight up.",
    },
    "squat": {
        "label": "Squat", "apparatus": "floor", "view": "side", "motion": "reps",
        "setup": "Stand tall, feet about shoulder-width, chest up and core braced.",
        "steps": [
            "Sit the hips back and down, knees tracking over the toes.",
            "Descend to at least parallel while keeping the heels planted and chest tall.",
            "Drive through the whole foot to stand back up.",
        ],
        "cue": "Knees follow the toes, weight through the heels and mid-foot.",
        "mistake": "Knees caving in or the heels lifting off the floor.",
    },
    "pistol": {
        "label": "Single-leg squat", "apparatus": "floor", "view": "side", "motion": "reps",
        "setup": "Stand on one leg, the other extended in front, arms out for balance.",
        "steps": [
            "Sit down slowly on the working leg, keeping the free leg off the floor.",
            "Descend as far as control allows, heel down and chest up.",
            "Drive back up through the working heel without touching the free foot down.",
        ],
        "cue": "Go slow — control beats depth. Keep the standing heel glued down.",
        "mistake": "Collapsing at the bottom or the standing heel popping up.",
    },
    "nordic": {
        "label": "Nordic curl", "apparatus": "floor", "view": "side", "motion": "reps",
        "setup": "Kneel with the ankles anchored, body upright, hips extended.",
        "steps": [
            "Keep a straight line from knees to head and lower forward slowly.",
            "Resist with the hamstrings the whole way down — fight the fall.",
            "Pull yourself back up, or push off lightly and repeat.",
        ],
        "cue": "Hips stay open — do not bend at the waist to make it easier.",
        "mistake": "Breaking at the hips instead of holding the knee-to-head line.",
    },
    "legext": {
        "label": "Reverse leg extension", "apparatus": "floor", "view": "side", "motion": "reps",
        "setup": "Kneel upright, hips extended, core braced, arms across the chest.",
        "steps": [
            "Lean straight back from the knees, keeping the hips open.",
            "Let the quads control the descent as far as you can hold.",
            "Contract the quads to pull back upright.",
        ],
        "cue": "One straight line from knee to shoulder — no hinging at the hips.",
        "mistake": "Sitting back onto the heels instead of leaning the whole body.",
    },
    "lsit": {
        "label": "L-sit", "apparatus": "parallettes", "view": "side", "motion": "hold",
        "setup": "Support on straight arms, shoulders pressed down away from the ears.",
        "steps": [
            "Press down hard to lift the hips clear of the floor.",
            "Raise straight legs to horizontal, toes pointed.",
            "Hold the L — shoulders depressed, thighs squeezed, no leaning back.",
        ],
        "cue": "Push the ground down and lift the legs by the hip flexors, arms locked.",
        "mistake": "Shrugging the shoulders or bending the knees to hold the height.",
    },
    "dragonflag": {
        "label": "Dragon flag", "apparatus": "bench", "view": "side", "motion": "reps",
        "setup": "Lie back holding a support behind the head, shoulders pinned down.",
        "steps": [
            "Drive the whole body up until only the shoulders rest on the surface.",
            "Lower in one rigid line — no bend at the hips — as slowly as you can.",
            "Stop just short of the floor and drive back up.",
        ],
        "cue": "The body is one plank pivoting at the shoulders. Keep it dead straight.",
        "mistake": "Piking at the hips so the legs drop first.",
    },
    "plank": {
        "label": "Plank", "apparatus": "floor", "view": "side", "motion": "hold",
        "setup": "Forearms or hands down, body in one straight line, core braced.",
        "steps": [
            "Set the elbows under the shoulders and the body in a straight line.",
            "Brace the core and squeeze the glutes so the hips stay level.",
            "Hold — breathing steadily — without letting the hips sag or rise.",
        ],
        "cue": "Pull the belly in and tuck the ribs. Flat back from heels to head.",
        "mistake": "Hips sagging toward the floor or piking up into a tent.",
    },
    "rings_support": {
        "label": "Rings support", "apparatus": "rings", "view": "front", "motion": "hold",
        "setup": "Support on top of the rings, arms straight, rings turned slightly out.",
        "steps": [
            "Press down and turn the rings out to about 45°.",
            "Hold the arms locked and the shoulders down, body tight and tall.",
            "Keep the rings from drifting — steady them with active straight arms.",
        ],
        "cue": "Turn the rings out and lock the elbows. Fight the wobble with the whole arm.",
        "mistake": "Bent arms or letting the rings turn back in and the shoulders shrug.",
    },
    "rings_cross": {
        "label": "Iron cross", "apparatus": "rings", "view": "front", "motion": "hold",
        "setup": "Hang between the rings, arms straight out to the sides.",
        "steps": [
            "Press the arms straight out to the sides until the body hangs level with them.",
            "Hold the arms locked and horizontal, chest up, body vertical.",
            "Resist the rings pulling apart — squeeze them down toward the hips.",
        ],
        "cue": "Straight arms driven down and in. Everything is locked and pulling toward the midline.",
        "mistake": "Bending the arms or dropping the chest to shorten the lever.",
    },
    "rings_dip": {
        "label": "Ring dip", "apparatus": "rings", "view": "front", "motion": "reps",
        "setup": "Support on the rings, arms straight, rings turned out, body tight.",
        "steps": [
            "Lower under control, keeping the rings close to the body.",
            "Descend until the shoulders drop below the elbows without losing tension.",
            "Press back up and turn the rings out at the top.",
        ],
        "cue": "Keep the rings pulled in tight to the ribs the whole descent.",
        "mistake": "Letting the rings drift wide, which throws the shoulders forward.",
    },
}

# --- classification -------------------------------------------------------
# First matching rule wins. (test) is a predicate over the skill dict.
def has(*words):
    def test(name):
        n = name.lower()
        return any(w in n for w in words)
    return test

RULES = [
    ("rings_cross", lambda s: s["branch"] == "rings" and has("cross", "maltese", "victorian", "azarian", "van gelder", "zanetti", "carmona", "planche")(s["name"])),
    ("rings_dip",   lambda s: s["branch"] == "rings" and s["standard"]["type"] == "reps" and has("dip", "mu", "muscle", "push", "pelikan")(s["name"])),
    ("rings_support", lambda s: s["branch"] == "rings"),
    ("hspu",        lambda s: s["branch"] == "handstand" and has("push", "press", "pike")(s["name"])),
    ("handstand",   lambda s: s["branch"] == "handstand"),
    ("dragonflag",  lambda s: has("dragon")(s["name"])),
    ("lsit",        lambda s: s["branch"] == "core" and has("sit", "manna")(s["name"])),
    ("plank",       lambda s: s["branch"] == "core" and has("plank")(s["name"])),
    ("dragonflag",  lambda s: s["branch"] == "core"),
    ("lever",       lambda s: s["branch"] == "pull" and s["standard"]["type"] == "hold"),
    ("muscleup",    lambda s: s["branch"] == "pull" and has("mu", "muscle", "hefesto")(s["name"])),
    ("pullup",      lambda s: s["branch"] == "pull"),
    ("nordic",      lambda s: s["branch"] == "legs" and has("nordic", "hamstring", "curl")(s["name"])),
    ("legext",      lambda s: s["branch"] == "legs" and has("leg ext", "leg press", "matrix", "sissy", "natural")(s["name"])),
    ("pistol",      lambda s: s["branch"] == "legs" and has("pistol", "shrimp", "hawaiian", "single", "ol ", "oa ")(s["name"])),
    ("squat",       lambda s: s["branch"] == "legs"),
    ("planche",     lambda s: s["branch"] == "push" and s["standard"]["type"] == "hold"),
    ("pseudo",      lambda s: s["branch"] == "push" and has("pseudo", "planche")(s["name"])),
    ("dip",         lambda s: s["branch"] == "push" and has("dip")(s["name"])),
    ("pushup",      lambda s: s["branch"] == "push"),
]

# A few skills read better under a hand-picked archetype than the rules give.
OVERRIDES = {
    "l-sit": "lsit", "v-sit": "lsit", "manna": "lsit", "tuck-sit": "lsit",
    "planche-lean": "pseudo", "plank": "plank",
    "back-lever": "lever", "front-lever": "lever",
}



# Muscles each archetype works, as figure.js muscle-group names. These light up
# on the 3D model. primary = prime movers, secondary = assisting.
MUSCLES = {
    "pushup":       {"primary": ["chest", "triceps", "shoulders"], "secondary": ["abs"]},
    "pseudo":       {"primary": ["shoulders", "chest"], "secondary": ["triceps", "abs"]},
    "planche":      {"primary": ["shoulders", "chest"], "secondary": ["abs", "triceps", "forearms"]},
    "dip":          {"primary": ["triceps", "chest", "shoulders"], "secondary": ["abs"]},
    "pullup":       {"primary": ["lats", "biceps"], "secondary": ["forearms", "abs", "shoulders"]},
    "muscleup":     {"primary": ["lats", "biceps", "triceps", "chest"], "secondary": ["abs", "forearms"]},
    "lever":        {"primary": ["lats", "abs"], "secondary": ["shoulders", "forearms", "glutes"]},
    "handstand":    {"primary": ["shoulders", "triceps"], "secondary": ["traps", "abs", "forearms"]},
    "hspu":         {"primary": ["shoulders", "triceps"], "secondary": ["traps", "abs"]},
    "squat":        {"primary": ["quads", "glutes"], "secondary": ["hamstrings", "calves"]},
    "pistol":       {"primary": ["quads", "glutes"], "secondary": ["hamstrings", "calves", "abs"]},
    "nordic":       {"primary": ["hamstrings"], "secondary": ["glutes", "calves", "abs"]},
    "legext":       {"primary": ["quads"], "secondary": ["abs"]},
    "lsit":         {"primary": ["abs"], "secondary": ["quads", "triceps", "shoulders"]},
    "dragonflag":   {"primary": ["abs"], "secondary": ["lats", "glutes", "shoulders"]},
    "plank":        {"primary": ["abs"], "secondary": ["shoulders", "glutes"]},
    "rings_support":{"primary": ["chest", "shoulders", "triceps"], "secondary": ["abs", "forearms"]},
    "rings_dip":    {"primary": ["triceps", "chest", "shoulders"], "secondary": ["abs", "forearms"]},
    "rings_cross":  {"primary": ["chest", "lats", "shoulders"], "secondary": ["biceps", "forearms", "abs"]},
}

# Display labels for the muscle groups, EN + TH.
MUSCLE_LABELS = {
    "chest": ("Chest", "อก"), "shoulders": ("Shoulders", "ไหล่"),
    "triceps": ("Triceps", "หลังแขน"), "biceps": ("Biceps", "หน้าแขน"),
    "forearms": ("Forearms", "แขนท่อนล่าง"), "abs": ("Core", "หน้าท้อง"),
    "lats": ("Lats", "ปีกหลัง"), "traps": ("Traps", "บ่า"),
    "quads": ("Quads", "ต้นขาหน้า"), "hamstrings": ("Hamstrings", "ต้นขาหลัง"),
    "glutes": ("Glutes", "ก้น"), "calves": ("Calves", "น่อง"),
}

# Thai instruction text per archetype — parallel to the English in ARCHETYPES.
ARCHETYPES_TH = {
    "pushup": {"setup": "มืออยู่ใต้หัวไหล่ ลำตัวเป็นเส้นตรงจากส้นเท้าถึงศีรษะ เกร็งแกนกลางและก้น",
        "steps": ["ลงช้า ๆ จนอกห่างพื้นประมาณหนึ่งกำปั้น ศอกชี้ไปด้านหลังราว 45 องศา",
            "รักษาเส้นตรงจากส้นเท้าถึงศีรษะให้มั่นคง สะโพกไม่ตกและไม่ยกขึ้น",
            "ดันขึ้นจนแขนเหยียดสุด แล้วทำซ้ำ"],
        "cue": "ศอกเก็บไปด้านหลัง ไม่กางออก เกร็งก้นเพื่อไม่ให้สะโพกนำ",
        "mistake": "สะโพกตก หรือศอกกางออกด้านข้าง"},
    "pseudo": {"setup": "มืออยู่ระดับสะโพก ปลายนิ้วหันออก ไหล่โน้มไปข้างหน้าเลยข้อมือ",
        "steps": ["เหยียดแขนตรงและโน้มไหล่ไปข้างหน้าให้เลยมือเพื่อลงน้ำหนัก",
            "ลงเล็กน้อยโดยคงการโน้มไหล่ไว้ แล้วดันพื้นออก",
            "ยิ่งโน้มไปข้างหน้ามาก ยิ่งใกล้ท่าแพลนช์"],
        "cue": "ดันสะบักออก (โก่งหลังบน) แล้วดันพื้นลง",
        "mistake": "ปล่อยให้ไหล่ถอยกลับมาหลังข้อมือจนเสียการโน้ม"},
    "planche": {"setup": "แขนเหยียดตรง ไหล่โน้มไปข้างหน้ามาก ลำตัวขนานพื้นและเกร็งกลวง",
        "steps": ["โน้มจนไหล่อยู่หน้ามือมากและเท้าลอยจากพื้น",
            "ค้างลำตัวขนานพื้น แขนล็อก ดันสะบัก เกร็งก้น",
            "สะโพกและส้นเท้าอยู่ระดับเดียวกับไหล่เป็นเส้นตรง"],
        "cue": "แขนต้องตรงตลอด ใช้การโน้มไม่ใช่แขนในการค้าง",
        "mistake": "งอแขน หรือปล่อยสะโพกยกขึ้นเหนือเส้น"},
    "dip": {"setup": "ค้ำตัวบนแขนเหยียด ไหล่กดลง ลำตัวโน้มไปข้างหน้าเล็กน้อย",
        "steps": ["ลงจนไหล่ต่ำกว่าศอกเล็กน้อย ศอกชี้ไปด้านหลัง",
            "คงลำตัวโน้มหน้าเล็กน้อยและไหล่ห่างจากหู",
            "ดันขึ้นจนล็อกแขนที่ด้านบน"],
        "cue": "ไหล่กดลงและถอยหลัง อย่ายกไหล่ขึ้นหาหู",
        "mistake": "ยกไหล่ตอนล่างสุด หรือกางศอกออกกว้าง"},
    "pullup": {"setup": "ห้อยตัวจากบาร์ ไหล่ตื่นตัว เกร็งแกนกลาง ขานิ่ง",
        "steps": ["ดึงศอกลงและไปด้านหลัง ดันอกเข้าหาบาร์",
            "ดึงคางขึ้นเหนือบาร์โดยไม่เหวี่ยงหรือโยกตัว",
            "ลงจนสุดถึงห้อยเต็มที่ แล้วทำซ้ำ"],
        "cue": "เริ่มด้วยการดึงสะบักลงก่อนงอแขน",
        "mistake": "เตะขาเพื่อโยกตัว หรือลงไม่สุด"},
    "muscleup": {"setup": "ห้อยจากบาร์ด้วยกริปเหลื่อมเล็กน้อย ข้อมืออยู่เหนือบาร์",
        "steps": ["ดึงอย่างระเบิดพลัง ดันอกขึ้นสูงและโน้มข้ามบาร์",
            "พลิกข้อมือข้ามด้านบนและเปลี่ยนศอกขึ้นเมื่ออกพ้นบาร์",
            "ดันขึ้นจากท่าดิปจนค้ำตัวเต็ม แล้วลงช้า ๆ"],
        "cue": "ดึงถึงกลางอก แล้วพลิกข้อมือเร็ว — ช่วงเปลี่ยนคือการพลิก ไม่ใช่กระโดด",
        "mistake": "ดึงแค่ถึงคางจนไม่มีแรงเหลือสำหรับช่วงเปลี่ยน"},
    "lever": {"setup": "ห้อยจากบาร์ด้วยแขนตรงและลำตัวเกร็งกลวง",
        "steps": ["ดึงบาร์เข้าหาสะโพกด้วยแขนตรง ยกลำตัวขึ้นให้ขนานพื้น",
            "ค้างทั้งตัวเป็นเส้นตรงเดียวขนานกับพื้น",
            "กดไหล่ลงและเกร็งปีกหลังตลอดการค้าง"],
        "cue": "แขนตรง ลำตัวตรง เกร็งทุกส่วนและดึงบาร์เข้าหาเอว",
        "mistake": "งอสะโพก หรือปล่อยงอแขนเพื่อโกงเส้น"},
    "handstand": {"setup": "มือกว้างเท่าหัวไหล่ กางนิ้ว แขนล็อกเหนือศีรษะ",
        "steps": ["จัดสะโพกให้อยู่เหนือไหล่ และไหล่อยู่เหนือมือ",
            "ดันพื้นออกแรง ๆ เก็บซี่โครง เกร็งก้นเป็นเส้นตรง",
            "ทรงตัวด้วยการกดปลายนิ้วเล็ก ๆ ไม่ใช่ทั้งฝ่ามือ"],
        "cue": "ดันตัวสูงผ่านไหล่และเกาะพื้นด้วยปลายนิ้ว",
        "mistake": "หลังแอ่นกล้วย — ซี่โครงบานและสะโพกแอ่นหลังมือ"},
    "hspu": {"setup": "ตั้งมือพิงกำแพง มือกว้างกว่าหัวไหล่เล็กน้อย",
        "steps": ["ลงช้า ๆ จนศีรษะเกือบแตะพื้น",
            "ศอกชี้ไปข้างหน้าเล็กน้อย ลำตัวเรียงตรงและเกร็ง",
            "ดันขึ้นจนล็อกแขนเหนือศีรษะ"],
        "cue": "ลงช้า ๆ ควบคุมจังหวะลง ไม่ปล่อยตก",
        "mistake": "แอ่นหลังเพื่อดันแทนที่จะดันตรงขึ้น"},
    "squat": {"setup": "ยืนตัวตรง เท้ากว้างประมาณหัวไหล่ อกตั้ง เกร็งแกนกลาง",
        "steps": ["ดันสะโพกไปด้านหลังและลง เข่าไปตามแนวปลายเท้า",
            "ลงอย่างน้อยให้ต้นขาขนานพื้น ส้นเท้าติดพื้น อกตั้ง",
            "ดันขึ้นผ่านทั้งฝ่าเท้าเพื่อยืนขึ้น"],
        "cue": "เข่าตามปลายเท้า ลงน้ำหนักที่ส้นและกลางเท้า",
        "mistake": "เข่าหุบเข้า หรือส้นเท้ายกจากพื้น"},
    "pistol": {"setup": "ยืนขาเดียว อีกขาเหยียดไปด้านหน้า กางแขนช่วยทรงตัว",
        "steps": ["นั่งลงช้า ๆ บนขาที่ยืน ขาอีกข้างลอยไม่แตะพื้น",
            "ลงเท่าที่ควบคุมได้ ส้นเท้าติดพื้น อกตั้ง",
            "ดันขึ้นผ่านส้นเท้าโดยไม่วางขาอีกข้างลง"],
        "cue": "ทำช้า ๆ การควบคุมสำคัญกว่าความลึก ส้นเท้าติดพื้นตลอด",
        "mistake": "ทรุดตอนล่างสุด หรือส้นเท้าที่ยืนยกขึ้น"},
    "nordic": {"setup": "คุกเข่าโดยล็อกข้อเท้าไว้ ลำตัวตั้งตรง สะโพกเหยียด",
        "steps": ["รักษาเส้นตรงจากเข่าถึงศีรษะ แล้วลงไปข้างหน้าช้า ๆ",
            "ต้านด้วยกล้ามต้นขาหลังตลอดทาง สู้กับแรงล้ม",
            "ดึงตัวกลับขึ้น หรือดันพื้นเบา ๆ แล้วทำซ้ำ"],
        "cue": "สะโพกเปิดค้างไว้ อย่างอเอวเพื่อให้ง่ายขึ้น",
        "mistake": "งอที่สะโพกแทนที่จะคงเส้นเข่าถึงศีรษะ"},
    "legext": {"setup": "คุกเข่าตัวตรง สะโพกเหยียด เกร็งแกนกลาง แขนไขว้อก",
        "steps": ["เอนตัวตรงไปด้านหลังจากเข่า สะโพกเปิดค้างไว้",
            "ให้กล้ามต้นขาหน้าควบคุมการลงเท่าที่ค้างได้",
            "เกร็งต้นขาหน้าดึงตัวกลับขึ้นมาตั้ง"],
        "cue": "เป็นเส้นตรงจากเข่าถึงไหล่ ไม่งอที่สะโพก",
        "mistake": "นั่งถอยไปบนส้นเท้าแทนที่จะเอนทั้งตัว"},
    "lsit": {"setup": "ค้ำตัวบนแขนเหยียด กดไหล่ลงห่างจากหู",
        "steps": ["กดพื้นลงแรง ๆ เพื่อยกสะโพกพ้นพื้น",
            "ยกขาตรงขึ้นให้ขนานพื้น ปลายเท้าชี้",
            "ค้างท่า L ไหล่กดลง เกร็งต้นขา ไม่เอนหลัง"],
        "cue": "ดันพื้นลงและยกขาด้วยกล้ามสะโพก แขนล็อก",
        "mistake": "ยกไหล่ หรืองอเข่าเพื่อค้างความสูง"},
    "dragonflag": {"setup": "นอนหงายจับที่ยึดไว้เหนือศีรษะ กดไหล่ติดพื้น",
        "steps": ["ยกทั้งตัวขึ้นจนเหลือแค่ไหล่แตะพื้น",
            "ลงเป็นเส้นตรงเดียว ไม่งอสะโพก ช้าที่สุดเท่าที่ทำได้",
            "หยุดก่อนถึงพื้นแล้วยกกลับขึ้น"],
        "cue": "ลำตัวเป็นแผ่นเดียวหมุนที่ไหล่ เกร็งให้ตรงตลอด",
        "mistake": "งอสะโพกจนขาตกลงก่อน"},
    "plank": {"setup": "วางแขนหรือมือลง ลำตัวเป็นเส้นตรง เกร็งแกนกลาง",
        "steps": ["วางศอกใต้ไหล่และลำตัวเป็นเส้นตรง",
            "เกร็งแกนกลางและก้นให้สะโพกอยู่ระดับเดียว",
            "ค้างไว้ หายใจสม่ำเสมอ สะโพกไม่ตกและไม่ยก"],
        "cue": "ดึงหน้าท้องเข้าและเก็บซี่โครง หลังเรียบจากส้นถึงศีรษะ",
        "mistake": "สะโพกตกลงพื้น หรือยกโด่งเป็นภูเขา"},
    "rings_support": {"setup": "ค้ำตัวเหนือห่วง แขนเหยียด หมุนห่วงออกเล็กน้อย",
        "steps": ["กดลงและหมุนห่วงออกราว 45 องศา",
            "ค้างแขนล็อกและไหล่กดลง ลำตัวเกร็งและตั้งตรง",
            "ประคองไม่ให้ห่วงส่าย ด้วยแขนตรงที่ตื่นตัว"],
        "cue": "หมุนห่วงออกและล็อกศอก สู้กับการส่ายด้วยทั้งแขน",
        "mistake": "งอแขน หรือปล่อยห่วงหมุนเข้าและยกไหล่"},
    "rings_dip": {"setup": "ค้ำตัวบนห่วง แขนเหยียด หมุนห่วงออก ลำตัวเกร็ง",
        "steps": ["ลงช้า ๆ โดยเก็บห่วงชิดลำตัว",
            "ลงจนไหล่ต่ำกว่าศอกโดยไม่เสียการเกร็ง",
            "ดันขึ้นและหมุนห่วงออกที่ด้านบน"],
        "cue": "เก็บห่วงชิดซี่โครงตลอดการลง",
        "mistake": "ปล่อยห่วงกางออกจนไหล่ทิ้งไปข้างหน้า"},
    "rings_cross": {"setup": "ห้อยระหว่างห่วง แขนกางตรงออกด้านข้าง",
        "steps": ["ดันแขนตรงออกด้านข้างจนลำตัวห้อยระดับเดียวกับแขน",
            "ค้างแขนล็อกและขนานพื้น อกตั้ง ลำตัวตั้งตรง",
            "ต้านแรงที่ดึงห่วงแยกออก บีบห่วงลงเข้าหาสะโพก"],
        "cue": "แขนตรงกดลงและเข้าใน ทุกส่วนล็อกและดึงเข้าหากลางลำตัว",
        "mistake": "งอแขน หรือทิ้งอกลงเพื่อย่นระยะคาน"},
}

def target_line_th(skill):
    std = skill["standard"]
    if std["type"] == "hold":
        return f"เป้าหมาย: ค้าง {std['sets']} × {std['amount']} วินาที ด้วยฟอร์มที่ดี"
    return f"เป้าหมาย: {std['sets']} เซ็ต เซ็ตละ {std['amount']} ครั้ง อย่างมีคุณภาพ"


def classify(skill):
    if skill["id"] in OVERRIDES:
        return OVERRIDES[skill["id"]]
    for name, test in RULES:
        if test(skill):
            return name
    return "pushup"


def target_line(skill):
    std = skill["standard"]
    if std["type"] == "hold":
        return f"Target: hold {std['sets']} × {std['amount']}s with clean form."
    return f"Target: {std['sets']} sets of {std['amount']} controlled reps."


def build():
    data = json.loads(SKILLS.read_text())
    by_id = {s["id"]: s for s in data["skills"]}
    guide = {}
    dist = {}

    for skill in data["skills"]:
        arch_name = classify(skill)
        arch = ARCHETYPES[arch_name]
        dist[arch_name] = dist.get(arch_name, 0) + 1

        prereqs = [by_id[p]["name"] for p in skill["prereqs"] if p in by_id]
        steps = list(arch["steps"])
        closing = target_line(skill)
        if prereqs:
            closing += f" Requires: {', '.join(prereqs)}."
        steps.append(closing)

        arch_th = ARCHETYPES_TH[arch_name]
        steps_th = list(arch_th["steps"])
        closing_th = target_line_th(skill)
        if prereqs:
            closing_th += f" ต้องผ่าน: {', '.join(prereqs)} ก่อน"
        steps_th.append(closing_th)

        guide[skill["id"]] = {
            "archetype": arch_name,
            "apparatus": arch["apparatus"],
            "view": arch["view"],
            "motion": arch["motion"],
            "muscles": MUSCLES[arch_name],
            "setup": arch["setup"],
            "steps": steps,
            "cue": arch["cue"],
            "mistake": arch["mistake"],
            "setupTh": arch_th["setup"],
            "stepsTh": steps_th,
            "cueTh": arch_th["cue"],
            "mistakeTh": arch_th["mistake"],
        }

    payload = {
        "version": 1,
        "generatedFrom": "skills.json",
        "notes": [
            "Generated by tools/build_guide.py — edit the archetype tables there, not this file.",
            "archetype selects the Three.js animation; apparatus/view/motion drive how it is drawn and framed.",
            "steps/cue/mistake are archetype coaching text; the last step is skill-specific (target + prerequisites).",
        ],
        "archetypes": {k: {"label": v["label"], "apparatus": v["apparatus"],
                           "view": v["view"], "motion": v["motion"]}
                       for k, v in ARCHETYPES.items()},
        "muscleLabels": {k: {"en": en, "th": th} for k, (en, th) in MUSCLE_LABELS.items()},
        "skills": guide,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1))

    print(f"guide for {len(guide)} skills -> {OUT.relative_to(ROOT)}")
    for name in sorted(dist, key=lambda k: -dist[k]):
        print(f"  {name:14s} {dist[name]}")


if __name__ == "__main__":
    sys.exit(build())
