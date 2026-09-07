from pathlib import Path

path = Path("snorelab/app/src/main/java/com/yamo/snorelab/MainActivity.java")
s = path.read_text(encoding="utf-8")

# Track the last recording state that the sleep screen rendered.
old_field = "    private SharedPreferences prefs;\n"
new_field = "    private SharedPreferences prefs;\n    private Boolean lastSleepRecordingUiState;\n"
if old_field not in s:
    raise SystemExit("prefs field not found")
s = s.replace(old_field, new_field, 1)

old_refresher = '''    private final Runnable refresher = new Runnable() {
        @Override public void run() {
            if ("sleep".equals(screen) && detailSession == null && prefs != null &&
                    prefs.getBoolean(SleepRecorderService.KEY_RECORDING, false)) showSleep();
            handler.postDelayed(this, 1500);
        }
    };
'''
new_refresher = '''    private final Runnable refresher = new Runnable() {
        @Override public void run() {
            if ("sleep".equals(screen) && detailSession == null && prefs != null) {
                boolean recording = prefs.getBoolean(SleepRecorderService.KEY_RECORDING, false);
                boolean changed = lastSleepRecordingUiState == null || lastSleepRecordingUiState != recording;
                if (changed || recording) {
                    lastSleepRecordingUiState = recording;
                    showSleep();
                }
            }
            handler.postDelayed(this, 1000);
        }
    };
'''
if old_refresher not in s:
    raise SystemExit("refresher block not found")
s = s.replace(old_refresher, new_refresher, 1)

old_resume = "    @Override protected void onResume() { super.onResume(); handler.removeCallbacks(refresher); handler.post(refresher); }\n"
new_resume = '''    @Override protected void onResume() {
        super.onResume();
        lastSleepRecordingUiState = null;
        handler.removeCallbacks(refresher);
        if ("sleep".equals(screen) && detailSession == null) showSleep();
        handler.post(refresher);
    }
'''
if old_resume not in s:
    raise SystemExit("onResume block not found")
s = s.replace(old_resume, new_resume, 1)

# Android 15+ edge-to-edge: reserve the real status-bar inset plus a small comfort gap.
old_insets = '''        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                int bottomInset;
                if (Build.VERSION.SDK_INT >= 30) {
                    bottomInset = insets.getInsets(WindowInsets.Type.navigationBars()).bottom;
                } else {
                    bottomInset = insets.getSystemWindowInsetBottom();
                }
                v.setPadding(0, 0, 0, bottomInset);
                return insets;
            });
            root.requestApplyInsets();
        }
'''
new_insets = '''        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                int topInset;
                int bottomInset;
                if (Build.VERSION.SDK_INT >= 30) {
                    topInset = insets.getInsets(WindowInsets.Type.statusBars()).top;
                    bottomInset = insets.getInsets(WindowInsets.Type.navigationBars()).bottom;
                } else {
                    topInset = insets.getSystemWindowInsetTop();
                    bottomInset = insets.getSystemWindowInsetBottom();
                }
                v.setPadding(0, topInset + dp(8), 0, bottomInset);
                return insets;
            });
            root.requestApplyInsets();
        }
'''
if old_insets not in s:
    raise SystemExit("root inset block not found")
s = s.replace(old_insets, new_insets, 1)

# The status-bar inset now provides the main safety gap; keep the fixed header calm and compact.
s = s.replace(
    "        header.setPadding(dp(18), dp(20), dp(18), dp(12));\n",
    "        header.setPadding(dp(18), dp(14), dp(18), dp(12));\n",
    1,
)

old_recording = "        boolean recording = prefs.getBoolean(SleepRecorderService.KEY_RECORDING, false);\n"
new_recording = "        boolean recording = prefs.getBoolean(SleepRecorderService.KEY_RECORDING, false);\n        lastSleepRecordingUiState = recording;\n"
if old_recording not in s:
    raise SystemExit("sleep recording state line not found")
s = s.replace(old_recording, new_recording, 1)

path.write_text(s, encoding="utf-8")
print("Applied Yamone V0.3.5 status-bar spacing and sleep state refresh patch")
