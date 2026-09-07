from pathlib import Path
import re

path = Path("snorelab/app/src/main/java/com/yamo/snorelab/MainActivity.java")
s = path.read_text(encoding="utf-8")


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    a = text.find(start)
    if a < 0:
        raise SystemExit(f"patch start not found: {label}")
    b = text.find(end, a)
    if b < 0:
        raise SystemExit(f"patch end not found: {label}")
    return text[:a] + replacement + text[b:]


# Light Yamone palette with user-selectable mint / pink theme.
s, n = re.subn(
    r"    private static final int BG = .*?    private static final int SUCCESS = .*?;\n",
    """    private static final String KEY_THEME = \"yamone_theme\";\n    private int BG = 0xFFF7FFFB;\n    private int CARD = 0xFFFFFFFF;\n    private int CARD2 = 0xFFF0FAF6;\n    private int TEXT = 0xFF153633;\n    private int MUTED = 0xFF718984;\n    private int PRIMARY = 0xFF56D1B3;\n    private int PRIMARY2 = 0xFF159A7A;\n    private int DANGER = 0xFFE75B6D;\n    private int WARNING = 0xFFE9A642;\n    private int SUCCESS = 0xFF159A7A;\n""",
    s,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit("palette patch failed")

old = """        prefs = getSharedPreferences(SleepRecorderService.PREFS, MODE_PRIVATE);\n        getWindow().setStatusBarColor(BG);\n        getWindow().setNavigationBarColor(BG);\n        buildRoot();\n"""
new = """        prefs = getSharedPreferences(SleepRecorderService.PREFS, MODE_PRIVATE);\n        applyThemeFromPrefs();\n        buildRoot();\n"""
if old not in s:
    raise SystemExit("onCreate theme target not found")
s = s.replace(old, new, 1)

s = s.replace("        nav.setBackgroundColor(0xFF0E182A);\n", "        nav.setBackgroundColor(CARD);\n", 1)

insert = """    private boolean pinkTheme() {\n        return \"pink\".equals(prefs == null ? \"mint\" : prefs.getString(KEY_THEME, \"mint\"));\n    }\n\n    private void applyThemeFromPrefs() {\n        boolean pink = pinkTheme();\n        BG = pink ? 0xFFFFF7FA : 0xFFF7FFFB;\n        CARD = 0xFFFFFFFF;\n        CARD2 = pink ? 0xFFFFEEF3 : 0xFFF0FAF6;\n        TEXT = pink ? 0xFF4B2633 : 0xFF153633;\n        MUTED = pink ? 0xFF9A7180 : 0xFF718984;\n        PRIMARY = pink ? 0xFFFF769F : 0xFF56D1B3;\n        PRIMARY2 = pink ? 0xFFE94778 : 0xFF159A7A;\n        DANGER = 0xFFE75B6D;\n        WARNING = 0xFFE9A642;\n        SUCCESS = pink ? 0xFFE94778 : 0xFF159A7A;\n        getWindow().setStatusBarColor(BG);\n        getWindow().setNavigationBarColor(BG);\n        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {\n            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);\n        }\n    }\n\n    private void setThemeAndRefresh(String theme) {\n        prefs.edit().putString(KEY_THEME, theme).apply();\n        applyThemeFromPrefs();\n        buildRoot();\n        showSettings();\n    }\n\n"""
marker = "    private void buildRoot() {\n"
if marker not in s:
    raise SystemExit("buildRoot marker missing")
s = s.replace(marker, insert + marker, 1)

show_sleep = r'''    private void showSleep() {
        screen = "sleep"; updateNav();
        if (detailSession != null) { showSessionDetail(detailSession); return; }
        content.removeAllViews();
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

        boolean recording = prefs.getBoolean(SleepRecorderService.KEY_RECORDING, false);
        if (recording) {
            long start = prefs.getLong(SleepRecorderService.KEY_START_MS, System.currentTimeMillis());
            LinearLayout live = new LinearLayout(this); live.setOrientation(LinearLayout.VERTICAL); live.setGravity(Gravity.CENTER_HORIZONTAL);
            live.setPadding(dp(20), dp(28), dp(20), dp(26));
            int night = pinkTheme() ? 0xFF6D3047 : 0xFF155B55;
            live.setBackground(round(night, 28, 0, 0));
            TextView moon = text("☾", 42, Color.WHITE, false); moon.setGravity(Gravity.CENTER); live.addView(moon, match(dp(56)));
            TextView state = text("수면 측정 중", 18, Color.WHITE, true); state.setGravity(Gravity.CENTER); live.addView(state);
            TextView elapsed = text(formatClockDuration(System.currentTimeMillis() - start), 40, Color.WHITE, true); elapsed.setGravity(Gravity.CENTER); elapsed.setPadding(0, dp(10), 0, dp(6)); live.addView(elapsed);
            TextView hint = text("조용히, 편안하게 좋은 꿈 꾸세요.\n화면을 꺼도 계속 측정해요.", 13, 0xFFEAF8F4, false); hint.setGravity(Gravity.CENTER); live.addView(hint);
            Button stop = actionButton("■  측정 종료", true, v -> stopMeasurement());
            LinearLayout.LayoutParams sp = match(dp(56)); sp.topMargin = dp(24); live.addView(stop, sp);
            page.addView(live, cardParams());
            return;
        }

        List<File> sessions = SessionStore.listSessions(this);
        LinearLayout hero = card(); hero.setGravity(Gravity.CENTER_HORIZONTAL); hero.setPadding(dp(18), dp(22), dp(18), dp(20));
        TextView mascot = text(pinkTheme() ? "♡  ᵕ̈" : "☁  ᵕ̈", 30, PRIMARY2, true); mascot.setGravity(Gravity.CENTER); hero.addView(mascot, match(dp(48)));
        TextView hello = text("오늘도\n좋은 잠 되세요.", 23, TEXT, true); hello.setGravity(Gravity.CENTER); hero.addView(hello);
        if (!sessions.isEmpty()) {
            File last = sessions.get(0); JSONObject meta = SessionStore.readMeta(last); JSONArray events = SessionStore.readEvents(last);
            long duration = meta.optLong("durationMs", 0);
            TextView lastLabel = text("최근 수면 요약", 12, MUTED, true); lastLabel.setPadding(0, dp(20), 0, dp(4)); lastLabel.setGravity(Gravity.CENTER); hero.addView(lastLabel);
            TextView lastTime = text(formatDuration(duration), 28, TEXT, true); lastTime.setGravity(Gravity.CENTER); hero.addView(lastTime);
            TextView lastSub = text(SessionStore.formatLocalDateTime(meta.optLong("startEpochMs", 0)) + "  ·  코골이 후보 " + events.length() + "건", 11, MUTED, false);
            lastSub.setGravity(Gravity.CENTER); lastSub.setPadding(0, dp(4), 0, 0); hero.addView(lastSub);
            hero.setOnClickListener(v -> { detailSession = last; showSessionDetail(last); });
        } else {
            TextView first = text("첫 수면 기록을 시작해보세요.", 12, MUTED, false); first.setPadding(0, dp(14), 0, 0); first.setGravity(Gravity.CENTER); hero.addView(first);
        }
        page.addView(hero, cardParams());

        Button startButton = actionButton("☾  수면 측정 시작", true, v -> ensureMicAndStart());
        page.addView(startButton, match(dp(60)));

        if (!sessions.isEmpty()) {
            TextView h = text("최근 기록", 17, TEXT, true); h.setPadding(0, dp(24), 0, dp(10)); page.addView(h);
            for (int i = 0; i < Math.min(6, sessions.size()); i++) page.addView(sessionRow(sessions.get(i)), cardParamsCompact());
        }

        LinearLayout privacy = card();
        privacy.addView(text("🔒  수면 기록은 내 휴대폰에", 14, TEXT, true));
        TextView p = text("녹음과 분석 기록은 앱 내부에 저장하며 자동 업로드하지 않습니다.", 11, MUTED, false); p.setPadding(0, dp(6), 0, 0); privacy.addView(p);
        LinearLayout.LayoutParams pp = cardParams(); pp.topMargin = dp(12); page.addView(privacy, pp);
    }

'''
s = replace_between(s, "    private void showSleep() {", "    private View sessionRow", show_sleep, "sleep home")

session_row = r'''    private View sessionRow(File dir) {
        JSONObject meta = SessionStore.readMeta(dir); JSONArray events = SessionStore.readEvents(dir);
        LinearLayout c = card(); c.setOrientation(LinearLayout.HORIZONTAL); c.setGravity(Gravity.CENTER_VERTICAL);
        TextView icon = text("☾", 22, PRIMARY2, true); icon.setGravity(Gravity.CENTER); icon.setBackground(round(CARD2, 20, 0, 0));
        c.addView(icon, new LinearLayout.LayoutParams(dp(44), dp(44)));
        LinearLayout left = new LinearLayout(this); left.setOrientation(LinearLayout.VERTICAL); left.setPadding(dp(12), 0, 0, 0);
        left.addView(text(SessionStore.formatLocalDateTime(meta.optLong("startEpochMs", 0)), 13, TEXT, true));
        left.addView(text(formatDuration(meta.optLong("durationMs", 0)) + "  ·  후보 " + events.length() + "건", 11, MUTED, false));
        c.addView(left, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView arrow = text("›", 26, PRIMARY2, false); arrow.setGravity(Gravity.CENTER); c.addView(arrow, new LinearLayout.LayoutParams(dp(32), dp(44)));
        c.setOnClickListener(v -> { detailSession = dir; showSessionDetail(dir); }); return c;
    }

'''
s = replace_between(s, "    private View sessionRow", "    private void showSessionDetail", session_row, "session row")

show_detail = r'''    private void showSessionDetail(File dir) {
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

        LinearLayout summary = card(); summary.setGravity(Gravity.CENTER_HORIZONTAL); summary.setPadding(dp(18), dp(20), dp(18), dp(20));
        TextView ring = text("◔", 34, PRIMARY, true); ring.setGravity(Gravity.CENTER); summary.addView(ring, match(dp(48)));
        TextView total = text(formatDuration(duration), 31, TEXT, true); total.setGravity(Gravity.CENTER); summary.addView(total);
        TextView status = text("측정된 수면 기록", 12, MUTED, false); status.setGravity(Gravity.CENTER); summary.addView(status);
        LinearLayout metrics = new LinearLayout(this); metrics.setOrientation(LinearLayout.HORIZONTAL); metrics.setPadding(0, dp(16), 0, 0);
        metrics.addView(metric("코골이 후보", events.length() + "건"), new LinearLayout.LayoutParams(0, dp(66), 1f));
        metrics.addView(metric("후보 시간", formatDuration(candidateMs)), new LinearLayout.LayoutParams(0, dp(66), 1f));
        metrics.addView(metric("확정", meta.optInt("snoreConfirmedCount", 0) + "건"), new LinearLayout.LayoutParams(0, dp(66), 1f));
        summary.addView(metrics); page.addView(summary, cardParams());

        LinearLayout timelineCard = card(); timelineCard.addView(text("코골이 타임라인", 15, TEXT, true));
        TextView span = text(new SimpleDateFormat("HH:mm", Locale.KOREAN).format(new Date(start)) + "  →  " + new SimpleDateFormat("HH:mm", Locale.KOREAN).format(new Date(start + duration)), 11, MUTED, false); span.setPadding(0, dp(4), 0, dp(6)); timelineCard.addView(span);
        SnoreTimelineView timeline = new SnoreTimelineView(this); timeline.setData(events, Math.max(1, duration)); timelineCard.addView(timeline, match(dp(86)));
        timelineCard.addView(text("후보 구간을 눌러 듣고 직접 판정할 수 있어요.", 11, MUTED, false)); page.addView(timelineCard, cardParams());

        TextView listHeader = text("코골이 후보 구간", 17, TEXT, true); listHeader.setPadding(0, dp(14), 0, dp(9)); page.addView(listHeader);
        if (events.length() == 0) { LinearLayout empty = card(); empty.addView(text("감지된 후보가 없습니다.", 13, MUTED, false)); page.addView(empty, cardParams()); }
        for (int i = 0; i < events.length(); i++) {
            JSONObject e = events.optJSONObject(i); if (e == null) continue; final int idx = i;
            LinearLayout row = card();
            LinearLayout head = new LinearLayout(this); head.setOrientation(LinearLayout.HORIZONTAL); head.setGravity(Gravity.CENTER_VERTICAL);
            long eventStart = start + e.optLong("startOffsetMs", 0);
            head.addView(text(new SimpleDateFormat("HH:mm:ss", Locale.KOREAN).format(new Date(eventStart)), 14, TEXT, true), new LinearLayout.LayoutParams(0, dp(32), 1f));
            TextView score = text(String.format(Locale.US, "점수 %.0f", e.optDouble("scoreMax", 0)), 11, e.optDouble("scoreMax", 0) >= 72 ? DANGER : WARNING, true); score.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
            head.addView(score, new LinearLayout.LayoutParams(dp(84), dp(32))); row.addView(head);
            String label = e.optString("reviewLabel", "UNREVIEWED");
            TextView info = text(formatDuration(e.optLong("durationMs", 0)) + "  ·  " + labelKorean(label), 11, labelColor(label), false); info.setPadding(0, 0, 0, dp(8)); row.addView(info);
            TextView playbackTime = text("00:00 / --:--", 10, MUTED, false); playbackTime.setGravity(Gravity.RIGHT); row.addView(playbackTime, match(dp(22)));
            SeekBar playbackSeek = new SeekBar(this); playbackSeek.setMax(1000); playbackSeek.setProgress(0);
            playbackSeek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) { if (fromUser && seekBar == activePlaybackSeek && player != null) { try { int d = Math.max(1, player.getDuration()); player.seekTo(Math.min(progress, d)); } catch (Exception ignored) {} } }
                @Override public void onStartTrackingTouch(SeekBar seekBar) { if (seekBar == activePlaybackSeek) activePlaybackSeeking = true; }
                @Override public void onStopTrackingTouch(SeekBar seekBar) { if (seekBar == activePlaybackSeek) activePlaybackSeeking = false; }
            });
            row.addView(playbackSeek, match(dp(34)));
            LinearLayout buttons = new LinearLayout(this); buttons.setOrientation(LinearLayout.HORIZONTAL);
            Button restart = ghostButton("↺ 처음", null); Button playToggle = ghostButton("▶ 재생", null);
            restart.setOnClickListener(v -> restartClip(dir, e, playToggle, playbackSeek, playbackTime));
            playToggle.setOnClickListener(v -> toggleClip(dir, e, playToggle, playbackSeek, playbackTime));
            buttons.addView(restart, new LinearLayout.LayoutParams(0, dp(42), 1f));
            LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(0, dp(42), 1f); bp.leftMargin = dp(7); buttons.addView(playToggle, bp);
            LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(0, dp(42), 1f); rp.leftMargin = dp(7); buttons.addView(ghostButton("판정", v -> showReviewDialog(dir, idx)), rp);
            row.addView(buttons); page.addView(row, cardParamsCompact());
        }

        LinearLayout export = card(); export.addView(text("기록 관리", 15, TEXT, true));
        TextView exp = text("내보내기는 사용자가 직접 선택할 때만 실행됩니다.", 11, MUTED, false); exp.setPadding(0, dp(5), 0, dp(8)); export.addView(exp);
        export.addView(ghostButton("분석 데이터 내보내기", v -> beginExport(dir, false, false)), match(dp(44)));
        LinearLayout.LayoutParams ep = match(dp(44)); ep.topMargin = dp(7); export.addView(ghostButton("후보 음원 포함 내보내기", v -> beginExport(dir, true, false)), ep);
        LinearLayout.LayoutParams ep2 = match(dp(44)); ep2.topMargin = dp(7); export.addView(ghostButton("전체 녹음까지 포함", v -> beginExport(dir, true, true)), ep2);
        LinearLayout.LayoutParams delp = match(dp(44)); delp.topMargin = dp(10); Button del = ghostButton("이 기록 삭제", v -> confirm("이 기록을 삭제할까요?", "녹음과 분석 기록이 모두 삭제됩니다.", () -> { SessionStore.deleteSession(dir); detailSession = null; showSleep(); })); del.setTextColor(DANGER); export.addView(del, delp);
        page.addView(export, cardParams());
    }

'''
s = replace_between(s, "    private void showSessionDetail", "    private void showSettings", show_detail, "sleep detail")

show_settings = r'''    private void showSettings() {
        screen = "settings"; updateNav(); content.removeAllViews();
        ScrollView scroll = new ScrollView(this); LinearLayout page = page(); scroll.addView(page); content.addView(scroll);
        LinearLayout top = new LinearLayout(this); top.setOrientation(LinearLayout.HORIZONTAL); top.setGravity(Gravity.CENTER_VERTICAL);
        TextView back = text("‹", 34, TEXT, false); back.setGravity(Gravity.CENTER); back.setOnClickListener(v -> showSleep()); top.addView(back, new LinearLayout.LayoutParams(dp(42), dp(52)));
        LinearLayout tt = new LinearLayout(this); tt.setOrientation(LinearLayout.VERTICAL); tt.addView(text("수면 설정", 23, TEXT, true)); tt.addView(text("테마와 마이크 측정을 편하게 조절해요.", 11, MUTED, false)); top.addView(tt, new LinearLayout.LayoutParams(0, dp(54), 1f)); page.addView(top);

        LinearLayout theme = card(); theme.addView(text("테마", 15, TEXT, true));
        LinearLayout themeRow = new LinearLayout(this); themeRow.setOrientation(LinearLayout.HORIZONTAL); themeRow.setPadding(0, dp(10), 0, 0);
        Button mint = choiceButton("🌿  민트", !pinkTheme(), v -> setThemeAndRefresh("mint"));
        Button pink = choiceButton("🌸  핑크", pinkTheme(), v -> setThemeAndRefresh("pink"));
        themeRow.addView(mint, new LinearLayout.LayoutParams(0, dp(54), 1f)); LinearLayout.LayoutParams tpp = new LinearLayout.LayoutParams(0, dp(54), 1f); tpp.leftMargin = dp(10); themeRow.addView(pink, tpp); theme.addView(themeRow); page.addView(theme, cardParams());

        LinearLayout measure = card(); measure.addView(text("마이크 설정", 15, TEXT, true));
        measure.addView(text("수면 중 소리를 분석해 코골이 후보를 감지합니다.", 11, MUTED, false));
        int sensitivity = prefs.getInt("sensitivity", 65); TextView sensLabel = text("감지 민감도  " + sensitivity, 12, MUTED, true); sensLabel.setPadding(0, dp(14), 0, 0); measure.addView(sensLabel);
        SeekBar seek = new SeekBar(this); seek.setMax(100); seek.setProgress(sensitivity);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int progress, boolean fromUser) { sensLabel.setText("감지 민감도  " + progress); }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) { prefs.edit().putInt("sensitivity", s.getProgress()).apply(); }
        }); measure.addView(seek, match(dp(46)));
        measure.addView(settingSwitch("전체 녹음", "개발자 검증용 AAC 전체 녹음 저장", "developer_full_recording", true));
        measure.addView(settingSwitch("코골이 후보 음원 저장", "후보 앞 3초를 포함한 WAV 구간 저장", "save_candidate_clips", true));
        page.addView(measure, cardParams());

        LinearLayout storage = card(); storage.addView(text("녹음 보관 기간", 15, TEXT, true));
        int[] vals = {7, 30, 90, 0}; String[] labs = {"7일", "30일", "90일", "계속"}; int current = prefs.getInt("retention_days", 30);
        LinearLayout chips = new LinearLayout(this); chips.setOrientation(LinearLayout.HORIZONTAL); chips.setPadding(0, dp(10), 0, dp(8));
        for (int i = 0; i < vals.length; i++) { final int val = vals[i]; Button b = choiceButton(labs[i], current == val, v -> { prefs.edit().putInt("retention_days", val).apply(); showSettings(); }); LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(0, dp(44), 1f); if (i > 0) cp.leftMargin = dp(6); chips.addView(b, cp); }
        storage.addView(chips);
        storage.addView(text("현재 앱 데이터  " + humanBytes(SessionStore.folderSize(SessionStore.sessionsRoot(this))), 11, MUTED, false));
        LinearLayout.LayoutParams wp = match(dp(44)); wp.topMargin = dp(10); Button wipe = ghostButton("전체 수면 데이터 삭제", v -> confirm("전체 데이터를 삭제할까요?", "모든 수면 녹음과 분석 기록이 삭제됩니다.", () -> { SessionStore.deleteAll(this); showSettings(); })); wipe.setTextColor(DANGER); storage.addView(wipe, wp); page.addView(storage, cardParams());

        LinearLayout privacy = card(); privacy.addView(text("개인정보 보호", 15, TEXT, true));
        privacy.addView(checkLine("수면 기록과 녹음은 앱 내부 저장소에 저장됩니다."));
        privacy.addView(checkLine("수면 기록을 자체 서버로 자동 업로드하지 않습니다."));
        privacy.addView(checkLine("지도 등 다른 기능의 인터넷 통신과 수면 데이터는 분리합니다."));
        page.addView(privacy, cardParams());

        LinearLayout dev = card(); dev.addView(text("개발자 검증", 15, TEXT, true)); dev.addView(kv("판정 엔진", SnoreDetector.VERSION)); dev.addView(kv("분석", "16 kHz / mono")); dev.addView(kv("전체 녹음", "AAC-LC 32 kbps")); dev.addView(kv("후보 음원", "PCM16 WAV")); page.addView(dev, cardParams());
    }

'''
s = replace_between(s, "    private void showSettings", "    private View settingSwitch", show_settings, "sleep settings")

# Softer rounded helpers.
s, n = re.subn(r"    private LinearLayout page\(\) \{.*?\n    private LinearLayout card\(\) \{.*?\n", """    private LinearLayout page() { LinearLayout p = new LinearLayout(this); p.setOrientation(LinearLayout.VERTICAL); p.setPadding(dp(18), dp(22), dp(18), dp(34)); p.setBackgroundColor(BG); return p; }\n    private LinearLayout card() { LinearLayout v = new LinearLayout(this); v.setOrientation(LinearLayout.VERTICAL); v.setPadding(dp(16), dp(16), dp(16), dp(16)); v.setBackground(round(CARD, 24, 1, pinkTheme() ? 0xFFFFE3EC : 0xFFE0F3EC)); return v; }\n""", s, count=1, flags=re.S)
if n != 1:
    raise SystemExit("page/card helper patch failed")

s, n = re.subn(r"    private Button actionButton\(String s, boolean primary, View\.OnClickListener click\) \{.*?\n    private Button ghostButton\(String s, View\.OnClickListener click\) \{.*?\n", """    private Button actionButton(String s, boolean primary, View.OnClickListener click) { Button b = new Button(this); b.setText(s); b.setAllCaps(false); b.setTextSize(15); b.setTypeface(Typeface.DEFAULT, Typeface.BOLD); b.setTextColor(Color.WHITE); b.setBackground(round(primary ? PRIMARY2 : PRIMARY, 22, 0, 0)); b.setOnClickListener(click); return b; }\n    private Button ghostButton(String s, View.OnClickListener click) { Button b = new Button(this); b.setText(s); b.setAllCaps(false); b.setTextSize(12); b.setTextColor(TEXT); b.setBackground(round(CARD2, 18, 1, pinkTheme() ? 0xFFFFD7E3 : 0xFFD7EFE7)); if (click != null) b.setOnClickListener(click); return b; }\n    private Button choiceButton(String s, boolean selected, View.OnClickListener click) { Button b = new Button(this); b.setText(s + (selected ? \"  ✓\" : \"\")); b.setAllCaps(false); b.setTextSize(12); b.setTypeface(Typeface.DEFAULT, selected ? Typeface.BOLD : Typeface.NORMAL); b.setTextColor(selected ? Color.WHITE : TEXT); b.setBackground(round(selected ? PRIMARY2 : CARD2, 18, 1, selected ? PRIMARY2 : (pinkTheme() ? 0xFFFFD7E3 : 0xFFD7EFE7))); b.setOnClickListener(click); return b; }\n""", s, count=1, flags=re.S)
if n != 1:
    raise SystemExit("button helper patch failed")

marker = "    private static String formatPlaybackTime(long ms) {\n"
if marker not in s:
    raise SystemExit("formatPlaybackTime marker missing")
s = s.replace(marker, """    private static String formatClockDuration(long ms) {\n        long total = Math.max(0, ms / 1000); long h = total / 3600; long m = (total % 3600) / 60; long sec = total % 60;\n        return String.format(Locale.KOREAN, \"%02d:%02d:%02d\", h, m, sec);\n    }\n\n""" + marker, 1)

path.write_text(s, encoding="utf-8")
print("Applied Yamone V0.3.3 sleep UI patch")
