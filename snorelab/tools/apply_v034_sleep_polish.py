from pathlib import Path

path = Path("snorelab/app/src/main/java/com/yamo/snorelab/MainActivity.java")
s = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str):
    global s
    if old not in s:
        raise SystemExit(f"patch target not found: {label}")
    s = s.replace(old, new, 1)

# Keep the sleep title/settings header fixed while the body scrolls.
old_sleep_start = '''        content.removeAllViews();
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
        LinearLayout page = page(); scroll.addView(page); content.addView(scroll);

        LinearLayout header = new LinearLayout(this); header.setOrientation(LinearLayout.HORIZONTAL); header.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout headerText = new LinearLayout(this); headerText.setOrientation(LinearLayout.VERTICAL);
        headerText.addView(text("수면", 27, TEXT, true));
        headerText.addView(text("잘 자는 것이, 더 좋은 나를 만들어요.", 12, MUTED, false));
        header.addView(headerText, new LinearLayout.LayoutParams(0, dp(58), 1f));
        TextView gear = text("⚙", 25, TEXT, false); gear.setGravity(Gravity.CENTER); gear.setBackground(round(CARD2, 18, 0, 0));
        gear.setOnClickListener(v -> showSettings()); header.addView(gear, new LinearLayout.LayoutParams(dp(48), dp(48)));
        page.addView(header);
'''
new_sleep_start = '''        content.removeAllViews();
        LinearLayout screenRoot = new LinearLayout(this); screenRoot.setOrientation(LinearLayout.VERTICAL); screenRoot.setBackgroundColor(BG);
        LinearLayout fixedHeader = new LinearLayout(this); fixedHeader.setOrientation(LinearLayout.HORIZONTAL); fixedHeader.setGravity(Gravity.CENTER_VERTICAL);
        fixedHeader.setPadding(dp(18), dp(18), dp(18), dp(12)); fixedHeader.setBackgroundColor(BG);
        LinearLayout headerText = new LinearLayout(this); headerText.setOrientation(LinearLayout.VERTICAL);
        headerText.addView(text("수면", 27, TEXT, true));
        headerText.addView(text("잘 자는 것이, 더 좋은 나를 만들어요.", 12, MUTED, false));
        fixedHeader.addView(headerText, new LinearLayout.LayoutParams(0, dp(62), 1f));
        TextView gear = text("⚙", 25, TEXT, false); gear.setGravity(Gravity.CENTER); gear.setBackground(round(CARD2, 18, 0, 0));
        gear.setOnClickListener(v -> showSettings()); fixedHeader.addView(gear, new LinearLayout.LayoutParams(dp(48), dp(48)));
        screenRoot.addView(fixedHeader, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
        LinearLayout page = page(); page.setPadding(dp(18), dp(6), dp(18), dp(34)); scroll.addView(page);
        screenRoot.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        content.addView(screenRoot);
'''
replace_once(old_sleep_start, new_sleep_start, "fixed sleep header")

# Replace the sensitivity area with explanation + precise minus/plus controls.
old_sens = '''        int sensitivity = prefs.getInt("sensitivity", 65); TextView sensLabel = text("감지 민감도  " + sensitivity, 12, MUTED, true); sensLabel.setPadding(0, dp(14), 0, 0); measure.addView(sensLabel);
        SeekBar seek = new SeekBar(this); seek.setMax(100); seek.setProgress(sensitivity);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int progress, boolean fromUser) { sensLabel.setText("감지 민감도  " + progress); }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) { prefs.edit().putInt("sensitivity", s.getProgress()).apply(); }
        }); measure.addView(seek, match(dp(46)));
'''
new_sens = '''        int sensitivity = prefs.getInt("sensitivity", 65);
        TextView sensLabel = text(sensitivityTitle(sensitivity), 13, TEXT, true); sensLabel.setPadding(0, dp(14), 0, 0); measure.addView(sensLabel);
        TextView sensHelp = text(sensitivityHelp(sensitivity), 11, MUTED, false); sensHelp.setPadding(0, dp(4), 0, dp(8)); measure.addView(sensHelp);
        SeekBar seek = new SeekBar(this); seek.setMax(100); seek.setProgress(sensitivity);
        LinearLayout precise = new LinearLayout(this); precise.setOrientation(LinearLayout.HORIZONTAL); precise.setGravity(Gravity.CENTER_VERTICAL);
        Button minus = choiceButton("−", false, null); Button plus = choiceButton("+", false, null);
        TextView sensValue = text(String.valueOf(sensitivity), 18, TEXT, true); sensValue.setGravity(Gravity.CENTER); sensValue.setBackground(round(CARD2, 16, 0, 0));
        precise.addView(minus, new LinearLayout.LayoutParams(dp(52), dp(44)));
        LinearLayout.LayoutParams vp = new LinearLayout.LayoutParams(0, dp(44), 1f); vp.leftMargin = dp(8); vp.rightMargin = dp(8); precise.addView(sensValue, vp);
        precise.addView(plus, new LinearLayout.LayoutParams(dp(52), dp(44))); measure.addView(precise);
        TextView scale = text("낮음  ·  큰/뚜렷한 소리 위주       보통       높음  ·  작은 소리도 후보", 10, MUTED, false); scale.setGravity(Gravity.CENTER); scale.setPadding(0, dp(7), 0, 0); measure.addView(scale);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int progress, boolean fromUser) { sensValue.setText(String.valueOf(progress)); sensLabel.setText(sensitivityTitle(progress)); sensHelp.setText(sensitivityHelp(progress)); if (fromUser) prefs.edit().putInt("sensitivity", progress).apply(); }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) { prefs.edit().putInt("sensitivity", s.getProgress()).apply(); }
        });
        minus.setOnClickListener(v -> { int value = Math.max(0, seek.getProgress() - 1); seek.setProgress(value); prefs.edit().putInt("sensitivity", value).apply(); });
        plus.setOnClickListener(v -> { int value = Math.min(100, seek.getProgress() + 1); seek.setProgress(value); prefs.edit().putInt("sensitivity", value).apply(); });
        measure.addView(seek, match(dp(42)));
'''
replace_once(old_sens, new_sens, "precise sensitivity")

# Add helper descriptions near the bottom of MainActivity.
marker = '''    private static String formatClockDuration(long ms) {'''
helpers = '''    private String sensitivityTitle(int value) {
        if (value <= 39) return "감지 민감도  " + value + "  ·  낮음";
        if (value <= 74) return "감지 민감도  " + value + "  ·  보통";
        return "감지 민감도  " + value + "  ·  높음";
    }
    private String sensitivityHelp(int value) {
        if (value <= 39) return "큰 소리와 특징이 뚜렷한 코골이 후보를 중심으로 감지해 오탐을 줄여요.";
        if (value <= 74) return "일반적인 환경에 권장해요. 작은 소리와 오탐 사이의 균형을 맞춥니다.";
        return "작은 코골이 소리까지 더 많이 후보로 잡지만 주변 소음도 함께 잡힐 수 있어요.";
    }

'''
replace_once(marker, helpers + marker, "sensitivity helper methods")

path.write_text(s, encoding="utf-8")
print("Applied Yamone sleep polish patch")
