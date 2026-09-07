from pathlib import Path

path = Path("snorelab/app/src/main/java/com/yamo/snorelab/MainActivity.java")
s = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str):
    global s
    if old not in s:
        raise SystemExit(f"patch target not found: {label}")
    s = s.replace(old, new, 1)


replace_once(
    "    private FrameLayout content;\n    private TextView sleepNav;\n    private TextView settingsNav;\n",
    "    private FrameLayout content;\n    private TextView alarmNav;\n    private TextView sleepNav;\n    private TextView settingsNav;\n",
    "alarm nav field",
)

replace_once(
    """        sleepNav = navItem(\"☾\\n수면\", true, v -> { detailSession = null; screen = \"sleep\"; showSleep(); });\n        settingsNav = navItem(\"⚙\\n설정\", false, v -> { detailSession = null; screen = \"settings\"; showSettings(); });\n        nav.addView(sleepNav, new LinearLayout.LayoutParams(0, dp(56), 1f));\n        nav.addView(settingsNav, new LinearLayout.LayoutParams(0, dp(56), 1f));\n""",
    """        alarmNav = navItem(\"⏰\\n알람\", false, v -> startActivity(new Intent(this, AlarmActivity.class)));\n        sleepNav = navItem(\"☾\\n수면\", true, v -> { detailSession = null; screen = \"sleep\"; showSleep(); });\n        settingsNav = navItem(\"⚙\\n설정\", false, v -> { detailSession = null; screen = \"settings\"; showSettings(); });\n        nav.addView(alarmNav, new LinearLayout.LayoutParams(0, dp(56), 1f));\n        nav.addView(sleepNav, new LinearLayout.LayoutParams(0, dp(56), 1f));\n        nav.addView(settingsNav, new LinearLayout.LayoutParams(0, dp(56), 1f));\n""",
    "alarm nav button",
)

replace_once(
    """    private void updateNav() {\n        sleepNav.setTextColor(\"sleep\".equals(screen) ? PRIMARY2 : MUTED);\n        settingsNav.setTextColor(\"settings\".equals(screen) ? PRIMARY2 : MUTED);\n    }\n""",
    """    private void updateNav() {\n        alarmNav.setTextColor(MUTED);\n        sleepNav.setTextColor(\"sleep\".equals(screen) ? PRIMARY2 : MUTED);\n        settingsNav.setTextColor(\"settings\".equals(screen) ? PRIMARY2 : MUTED);\n    }\n""",
    "alarm nav color",
)

replace_once(
    """        showSleep();\n        requestNotificationPermissionIfHelpful();\n""",
    """        if (\"settings\".equals(getIntent().getStringExtra(\"start_screen\"))) showSettings();\n        else showSleep();\n        requestNotificationPermissionIfHelpful();\n""",
    "settings deep link",
)

path.write_text(s, encoding="utf-8")
print("Applied SnoreLab V0.2 alarm navigation patch")
