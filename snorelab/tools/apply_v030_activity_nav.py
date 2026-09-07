from pathlib import Path

main_path = Path("snorelab/app/src/main/java/com/yamo/snorelab/MainActivity.java")
s = main_path.read_text(encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str):
    if old not in text:
        raise SystemExit(f"patch target not found: {label}")
    return text.replace(old, new, 1)

s = replace_once(
    s,
    "    private TextView alarmNav;\n    private TextView sleepNav;\n    private TextView settingsNav;\n",
    "    private TextView alarmNav;\n    private TextView sleepNav;\n    private TextView activityNav;\n    private TextView settingsNav;\n",
    "main activity nav field",
)

s = replace_once(
    s,
    """        alarmNav = navItem(\"⏰\\n알람\", false, v -> startActivity(new Intent(this, AlarmActivity.class)));\n        sleepNav = navItem(\"☾\\n수면\", true, v -> { detailSession = null; screen = \"sleep\"; showSleep(); });\n        settingsNav = navItem(\"⚙\\n설정\", false, v -> { detailSession = null; screen = \"settings\"; showSettings(); });\n        nav.addView(alarmNav, new LinearLayout.LayoutParams(0, dp(56), 1f));\n        nav.addView(sleepNav, new LinearLayout.LayoutParams(0, dp(56), 1f));\n        nav.addView(settingsNav, new LinearLayout.LayoutParams(0, dp(56), 1f));\n""",
    """        alarmNav = navItem(\"⏰\\n알람\", false, v -> startActivity(new Intent(this, AlarmActivity.class)));\n        sleepNav = navItem(\"☾\\n수면\", true, v -> { detailSession = null; screen = \"sleep\"; showSleep(); });\n        activityNav = navItem(\"🏃\\n활동\", false, v -> startActivity(new Intent(this, ExerciseActivity.class)));\n        settingsNav = navItem(\"⚙\\n설정\", false, v -> { detailSession = null; screen = \"settings\"; showSettings(); });\n        nav.addView(alarmNav, new LinearLayout.LayoutParams(0, dp(56), 1f));\n        nav.addView(sleepNav, new LinearLayout.LayoutParams(0, dp(56), 1f));\n        nav.addView(activityNav, new LinearLayout.LayoutParams(0, dp(56), 1f));\n        nav.addView(settingsNav, new LinearLayout.LayoutParams(0, dp(56), 1f));\n""",
    "main activity nav button",
)

s = replace_once(
    s,
    """    private void updateNav() {\n        alarmNav.setTextColor(MUTED);\n        sleepNav.setTextColor(\"sleep\".equals(screen) ? PRIMARY2 : MUTED);\n        settingsNav.setTextColor(\"settings\".equals(screen) ? PRIMARY2 : MUTED);\n    }\n""",
    """    private void updateNav() {\n        alarmNav.setTextColor(MUTED);\n        sleepNav.setTextColor(\"sleep\".equals(screen) ? PRIMARY2 : MUTED);\n        activityNav.setTextColor(MUTED);\n        settingsNav.setTextColor(\"settings\".equals(screen) ? PRIMARY2 : MUTED);\n    }\n""",
    "main activity nav color",
)

main_path.write_text(s, encoding="utf-8")

alarm_path = Path("snorelab/app/src/main/java/com/yamo/snorelab/AlarmActivity.java")
a = alarm_path.read_text(encoding="utf-8")
a = replace_once(
    a,
    """        nav.addView(navItem(\"⏰\\n알람\", PRIMARY2, v -> showList()), new LinearLayout.LayoutParams(0, dp(56), 1f));\n        nav.addView(navItem(\"☾\\n수면\", MUTED, v -> { startActivity(new Intent(this, MainActivity.class)); finish(); }), new LinearLayout.LayoutParams(0, dp(56), 1f));\n        nav.addView(navItem(\"⚙\\n설정\", MUTED, v -> { startActivity(new Intent(this, MainActivity.class).putExtra(\"start_screen\", \"settings\")); finish(); }), new LinearLayout.LayoutParams(0, dp(56), 1f));\n""",
    """        nav.addView(navItem(\"⏰\\n알람\", PRIMARY2, v -> showList()), new LinearLayout.LayoutParams(0, dp(56), 1f));\n        nav.addView(navItem(\"☾\\n수면\", MUTED, v -> { startActivity(new Intent(this, MainActivity.class)); finish(); }), new LinearLayout.LayoutParams(0, dp(56), 1f));\n        nav.addView(navItem(\"🏃\\n활동\", MUTED, v -> { startActivity(new Intent(this, ExerciseActivity.class)); finish(); }), new LinearLayout.LayoutParams(0, dp(56), 1f));\n        nav.addView(navItem(\"⚙\\n설정\", MUTED, v -> { startActivity(new Intent(this, MainActivity.class).putExtra(\"start_screen\", \"settings\")); finish(); }), new LinearLayout.LayoutParams(0, dp(56), 1f));\n""",
    "alarm activity nav button",
)
alarm_path.write_text(a, encoding="utf-8")

print("Applied SnoreLab V0.3 activity navigation patch")
