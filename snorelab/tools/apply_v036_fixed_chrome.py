from pathlib import Path

path = Path("snorelab/app/src/main/java/com/yamo/snorelab/MainActivity.java")
s = path.read_text(encoding="utf-8")

# Add a reusable fixed top bar for detail/sub screens.
marker = "    private LinearLayout bodyPage() {\n"
helper = '''    private LinearLayout fixedBackHeader(String title, String subtitle, View.OnClickListener backClick) {
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(12), dp(14), dp(18), dp(12));
        header.setBackgroundColor(BG);

        TextView back = text("‹", 34, TEXT, false);
        back.setGravity(Gravity.CENTER);
        back.setOnClickListener(backClick);
        header.addView(back, new LinearLayout.LayoutParams(dp(48), dp(58)));

        LinearLayout words = new LinearLayout(this);
        words.setOrientation(LinearLayout.VERTICAL);
        words.addView(text(title, 22, TEXT, true));
        if (subtitle != null && !subtitle.isEmpty()) {
            TextView sub = text(subtitle, 11, MUTED, false);
            sub.setPadding(0, dp(2), 0, 0);
            words.addView(sub);
        }
        header.addView(words, new LinearLayout.LayoutParams(0, dp(58), 1f));
        return header;
    }

'''
if marker not in s:
    raise SystemExit("bodyPage marker not found")
s = s.replace(marker, helper + marker, 1)

old_detail = '''    private void showSessionDetail(File dir) {
        screen = "sleep"; updateNav(); content.removeAllViews(); stopPlayer();
        ScrollView scroll = new ScrollView(this); LinearLayout page = page(); scroll.addView(page); content.addView(scroll);
        JSONObject meta = SessionStore.readMeta(dir); JSONArray events = SessionStore.readEvents(dir);
        long start = meta.optLong("startEpochMs", 0); long duration = meta.optLong("durationMs", Math.max(1, System.currentTimeMillis() - start));
        long candidateMs = 0; for (int i = 0; i < events.length(); i++) { JSONObject e = events.optJSONObject(i); if (e != null) candidateMs += e.optLong("durationMs", 0); }

        LinearLayout top = new LinearLayout(this); top.setOrientation(LinearLayout.HORIZONTAL); top.setGravity(Gravity.CENTER_VERTICAL);
        TextView back = text("‹", 34, TEXT, false); back.setGravity(Gravity.CENTER); back.setOnClickListener(v -> { detailSession = null; showSleep(); });
        top.addView(back, new LinearLayout.LayoutParams(dp(42), dp(52)));
        LinearLayout titles = new LinearLayout(this); titles.setOrientation(LinearLayout.VERTICAL);
        titles.addView(text("수면 결과", 21, TEXT, true)); titles.addView(text(new SimpleDateFormat("M월 d일 (E)", Locale.KOREAN).format(new Date(start)), 11, MUTED, false));
        top.addView(titles, new LinearLayout.LayoutParams(0, dp(54), 1f)); page.addView(top);

'''
new_detail = '''    private void showSessionDetail(File dir) {
        screen = "sleep"; updateNav(); content.removeAllViews(); stopPlayer();
        JSONObject meta = SessionStore.readMeta(dir); JSONArray events = SessionStore.readEvents(dir);
        long start = meta.optLong("startEpochMs", 0); long duration = meta.optLong("durationMs", Math.max(1, System.currentTimeMillis() - start));
        long candidateMs = 0; for (int i = 0; i < events.length(); i++) { JSONObject e = events.optJSONObject(i); if (e != null) candidateMs += e.optLong("durationMs", 0); }

        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setBackgroundColor(BG);
        String detailDate = new SimpleDateFormat("M월 d일 (E)", Locale.KOREAN).format(new Date(start));
        shell.addView(fixedBackHeader("수면 결과", detailDate, v -> { detailSession = null; showSleep(); }),
                new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ScrollView scroll = new ScrollView(this);
        LinearLayout page = bodyPage();
        scroll.addView(page);
        shell.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        content.addView(shell);

'''
if old_detail not in s:
    raise SystemExit("sleep detail top block not found")
s = s.replace(old_detail, new_detail, 1)

old_settings = '''    private void showSettings() {
        screen = "settings"; updateNav(); content.removeAllViews();
        ScrollView scroll = new ScrollView(this); LinearLayout page = page(); scroll.addView(page); content.addView(scroll);
        LinearLayout top = new LinearLayout(this); top.setOrientation(LinearLayout.HORIZONTAL); top.setGravity(Gravity.CENTER_VERTICAL);
        TextView back = text("‹", 34, TEXT, false); back.setGravity(Gravity.CENTER); back.setOnClickListener(v -> showSleep()); top.addView(back, new LinearLayout.LayoutParams(dp(42), dp(52)));
        LinearLayout tt = new LinearLayout(this); tt.setOrientation(LinearLayout.VERTICAL); tt.addView(text("수면 설정", 23, TEXT, true)); tt.addView(text("테마와 마이크 측정을 편하게 조절해요.", 11, MUTED, false)); top.addView(tt, new LinearLayout.LayoutParams(0, dp(54), 1f)); page.addView(top);

'''
new_settings = '''    private void showSettings() {
        screen = "settings"; updateNav(); content.removeAllViews();
        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setBackgroundColor(BG);
        shell.addView(fixedBackHeader("수면 설정", "테마와 마이크 측정을 편하게 조절해요.", v -> showSleep()),
                new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ScrollView scroll = new ScrollView(this);
        LinearLayout page = bodyPage();
        scroll.addView(page);
        shell.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        content.addView(shell);

'''
if old_settings not in s:
    raise SystemExit("sleep settings top block not found")
s = s.replace(old_settings, new_settings, 1)

path.write_text(s, encoding="utf-8")
print("Applied Yamone V0.3.6 fixed top/bottom chrome rule")
