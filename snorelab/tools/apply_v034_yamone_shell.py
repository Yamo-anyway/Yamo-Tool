from pathlib import Path
import re

main_path = Path("snorelab/app/src/main/java/com/yamo/snorelab/MainActivity.java")
s = main_path.read_text(encoding="utf-8")


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    a = text.find(start)
    if a < 0:
        raise SystemExit(f"patch start not found: {label}")
    b = text.find(end, a)
    if b < 0:
        raise SystemExit(f"patch end not found: {label}")
    return text[:a] + replacement + text[b:]


if "import android.widget.ImageView;\n" not in s:
    s = s.replace("import android.widget.FrameLayout;\n", "import android.widget.FrameLayout;\nimport android.widget.ImageView;\n", 1)

old_fields = """    private TextView alarmNav;\n    private TextView sleepNav;\n    private TextView activityNav;\n    private TextView settingsNav;\n"""
new_fields = """    private TextView alarmNav;\n    private TextView sleepNav;\n    private TextView homeNav;\n    private TextView activityNav;\n    private TextView skiNav;\n"""
if old_fields not in s:
    raise SystemExit("navigation field block not found")
s = s.replace(old_fields, new_fields, 1)

build_root = r'''    private void buildRoot() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(8), dp(7), dp(8), dp(8));
        nav.setBackgroundColor(CARD);

        alarmNav = navItem("⏰\n알람", false, v -> showPlaceholderScreen("alarm"));
        sleepNav = navItem("☾\n수면", true, v -> { detailSession = null; showSleep(); });
        homeNav = navItem("⌂\n홈", false, v -> { detailSession = null; showHome(); });
        activityNav = navItem("🏃\n활동", false, v -> showPlaceholderScreen("activity"));
        skiNav = navItem("⛷\n스키", false, v -> showPlaceholderScreen("ski"));

        nav.addView(alarmNav, new LinearLayout.LayoutParams(0, dp(60), 1f));
        nav.addView(sleepNav, new LinearLayout.LayoutParams(0, dp(60), 1f));
        nav.addView(homeNav, new LinearLayout.LayoutParams(0, dp(60), 1f));
        nav.addView(activityNav, new LinearLayout.LayoutParams(0, dp(60), 1f));
        nav.addView(skiNav, new LinearLayout.LayoutParams(0, dp(60), 1f));
        root.addView(nav, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
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
        setContentView(root);
    }

'''
s = replace_between(s, "    private void buildRoot() {", "    private TextView navItem", build_root, "five tab root")

nav_block = r'''    private TextView navItem(String label, boolean selected, View.OnClickListener click) {
        TextView v = text(label, 12, selected ? PRIMARY2 : MUTED, true);
        v.setGravity(Gravity.CENTER);
        v.setOnClickListener(click);
        return v;
    }

    private void styleNav(TextView item, boolean selected) {
        if (item == null) return;
        item.setTextColor(selected ? PRIMARY2 : MUTED);
        item.setBackground(selected ? round(CARD2, 19, 0, 0) : null);
    }

    private void updateNav() {
        styleNav(alarmNav, "alarm".equals(screen));
        styleNav(sleepNav, "sleep".equals(screen));
        styleNav(homeNav, "home".equals(screen));
        styleNav(activityNav, "activity".equals(screen));
        styleNav(skiNav, "ski".equals(screen));
    }

    private LinearLayout fixedHeader(String title, String subtitle) {
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(18), dp(20), dp(18), dp(12));
        header.setBackgroundColor(BG);

        LinearLayout words = new LinearLayout(this);
        words.setOrientation(LinearLayout.VERTICAL);
        words.addView(text(title, 26, TEXT, true));
        TextView sub = text(subtitle, 12, MUTED, false);
        sub.setPadding(0, dp(2), 0, 0);
        words.addView(sub);
        header.addView(words, new LinearLayout.LayoutParams(0, dp(58), 1f));

        TextView gear = text("⚙", 24, TEXT, false);
        gear.setGravity(Gravity.CENTER);
        gear.setBackground(round(CARD2, 18, 0, 0));
        gear.setOnClickListener(v -> showSettings());
        header.addView(gear, new LinearLayout.LayoutParams(dp(48), dp(48)));
        return header;
    }

    private LinearLayout bodyPage() {
        LinearLayout p = new LinearLayout(this);
        p.setOrientation(LinearLayout.VERTICAL);
        p.setPadding(dp(18), dp(6), dp(18), dp(34));
        p.setBackgroundColor(BG);
        return p;
    }

    private void showHome() {
        detailSession = null;
        screen = "home";
        updateNav();
        content.removeAllViews();

        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setBackgroundColor(BG);
        shell.addView(fixedHeader("야모네", "오늘도, 좋은 하루가 쌓여요."), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ScrollView scroll = new ScrollView(this);
        LinearLayout page = bodyPage();
        scroll.addView(page);
        shell.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        content.addView(shell);

        LinearLayout hero = card();
        hero.setGravity(Gravity.CENTER_HORIZONTAL);
        ImageView image = new ImageView(this);
        image.setImageResource(R.drawable.yamone_home);
        image.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        hero.addView(image, match(dp(210)));
        TextView title = text("편하게 기록하고, 천천히 쌓아가요.", 18, TEXT, true);
        title.setGravity(Gravity.CENTER);
        hero.addView(title);
        TextView desc = text("지금은 수면 기능을 먼저 사용할 수 있어요.", 12, MUTED, false);
        desc.setGravity(Gravity.CENTER);
        desc.setPadding(0, dp(6), 0, dp(14));
        hero.addView(desc);
        hero.addView(actionButton("수면으로 가기", true, v -> showSleep()), match(dp(52)));
        page.addView(hero, cardParams());
    }

    private void showPlaceholderScreen(String target) {
        detailSession = null;
        screen = target;
        updateNav();
        content.removeAllViews();

        String title;
        String subtitle;
        String message;
        int imageRes;
        if ("alarm".equals(target)) {
            title = "알람";
            subtitle = "기분 좋은 시작을 준비해요.";
            message = "알람 기능은 다음 단계에서 연결할게요.";
            imageRes = R.drawable.yamone_alarm;
        } else if ("activity".equals(target)) {
            title = "활동";
            subtitle = "걷고, 뛰고, 달린 하루를 기록해요.";
            message = "걷기·러닝과 자전거 기능을 준비하고 있어요.";
            imageRes = R.drawable.yamone_activity;
        } else {
            title = "스키";
            subtitle = "겨울의 즐거움도 야모네와 함께.";
            message = "스키·스노보드 기능은 나중에 만나요.";
            imageRes = R.drawable.yamone_ski;
        }

        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setBackgroundColor(BG);
        shell.addView(fixedHeader(title, subtitle), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ScrollView scroll = new ScrollView(this);
        LinearLayout page = bodyPage();
        scroll.addView(page);
        shell.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        content.addView(shell);

        LinearLayout hero = card();
        hero.setGravity(Gravity.CENTER_HORIZONTAL);
        hero.setPadding(dp(18), dp(22), dp(18), dp(24));
        ImageView image = new ImageView(this);
        image.setImageResource(imageRes);
        image.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        hero.addView(image, match(dp(240)));
        TextView soon = text(message, 15, TEXT, true);
        soon.setGravity(Gravity.CENTER);
        soon.setPadding(0, dp(8), 0, dp(4));
        hero.addView(soon);
        TextView note = text("지금은 화면과 분위기만 먼저 맞춰두었어요.", 11, MUTED, false);
        note.setGravity(Gravity.CENTER);
        hero.addView(note);
        page.addView(hero, cardParams());
    }

'''
s = replace_between(s, "    private TextView navItem", "    private void showSleep() {", nav_block, "new nav and shell helpers")

show_sleep = r'''    private void showSleep() {
        screen = "sleep";
        updateNav();
        if (detailSession != null) { showSessionDetail(detailSession); return; }
        content.removeAllViews();

        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setBackgroundColor(BG);
        shell.addView(fixedHeader("수면", "잘 자는 것이, 더 좋은 나를 만들어요."), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout page = bodyPage();
        scroll.addView(page);
        shell.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        content.addView(shell);

        boolean recording = prefs.getBoolean(SleepRecorderService.KEY_RECORDING, false);
        if (recording) {
            long start = prefs.getLong(SleepRecorderService.KEY_START_MS, System.currentTimeMillis());
            LinearLayout live = new LinearLayout(this);
            live.setOrientation(LinearLayout.VERTICAL);
            live.setGravity(Gravity.CENTER_HORIZONTAL);
            live.setPadding(dp(20), dp(28), dp(20), dp(26));
            int night = pinkTheme() ? 0xFF6D3047 : 0xFF155B55;
            live.setBackground(round(night, 28, 0, 0));
            TextView moon = text("☾", 42, Color.WHITE, false);
            moon.setGravity(Gravity.CENTER);
            live.addView(moon, match(dp(56)));
            TextView state = text("수면 측정 중", 18, Color.WHITE, true);
            state.setGravity(Gravity.CENTER);
            live.addView(state);
            TextView elapsed = text(formatClockDuration(System.currentTimeMillis() - start), 40, Color.WHITE, true);
            elapsed.setGravity(Gravity.CENTER);
            elapsed.setPadding(0, dp(10), 0, dp(6));
            live.addView(elapsed);
            TextView hint = text("조용히, 편안하게 좋은 꿈 꾸세요.\n화면을 꺼도 계속 측정해요.", 13, 0xFFEAF8F4, false);
            hint.setGravity(Gravity.CENTER);
            live.addView(hint);
            Button stop = actionButton("■  측정 종료", true, v -> stopMeasurement());
            LinearLayout.LayoutParams sp = match(dp(56));
            sp.topMargin = dp(24);
            live.addView(stop, sp);
            page.addView(live, cardParams());
            return;
        }

        List<File> sessions = SessionStore.listSessions(this);
        LinearLayout hero = card();
        hero.setGravity(Gravity.CENTER_HORIZONTAL);
        hero.setPadding(dp(18), dp(22), dp(18), dp(20));
        TextView mascot = text(pinkTheme() ? "♡  ᵕ̈" : "☁  ᵕ̈", 30, PRIMARY2, true);
        mascot.setGravity(Gravity.CENTER);
        hero.addView(mascot, match(dp(48)));
        TextView hello = text("오늘도\n좋은 잠 되세요.", 23, TEXT, true);
        hello.setGravity(Gravity.CENTER);
        hero.addView(hello);
        if (!sessions.isEmpty()) {
            File last = sessions.get(0);
            JSONObject meta = SessionStore.readMeta(last);
            JSONArray events = SessionStore.readEvents(last);
            long duration = meta.optLong("durationMs", 0);
            TextView lastLabel = text("최근 수면 요약", 12, MUTED, true);
            lastLabel.setPadding(0, dp(20), 0, dp(4));
            lastLabel.setGravity(Gravity.CENTER);
            hero.addView(lastLabel);
            TextView lastTime = text(formatDuration(duration), 28, TEXT, true);
            lastTime.setGravity(Gravity.CENTER);
            hero.addView(lastTime);
            TextView lastSub = text(SessionStore.formatLocalDateTime(meta.optLong("startEpochMs", 0)) + "  ·  코골이 후보 " + events.length() + "건", 11, MUTED, false);
            lastSub.setGravity(Gravity.CENTER);
            lastSub.setPadding(0, dp(4), 0, 0);
            hero.addView(lastSub);
            hero.setOnClickListener(v -> { detailSession = last; showSessionDetail(last); });
        } else {
            TextView first = text("첫 수면 기록을 시작해보세요.", 12, MUTED, false);
            first.setPadding(0, dp(14), 0, 0);
            first.setGravity(Gravity.CENTER);
            hero.addView(first);
        }
        page.addView(hero, cardParams());

        Button startButton = actionButton("☾  수면 측정 시작", true, v -> ensureMicAndStart());
        page.addView(startButton, match(dp(60)));

        if (!sessions.isEmpty()) {
            TextView h = text("최근 기록", 17, TEXT, true);
            h.setPadding(0, dp(24), 0, dp(10));
            page.addView(h);
            for (int i = 0; i < Math.min(6, sessions.size()); i++) page.addView(sessionRow(sessions.get(i)), cardParamsCompact());
        }

        LinearLayout privacy = card();
        privacy.addView(text("🔒  수면 기록은 내 휴대폰에", 14, TEXT, true));
        TextView p = text("녹음과 분석 기록은 앱 내부에 저장하며 자동 업로드하지 않습니다.", 11, MUTED, false);
        p.setPadding(0, dp(6), 0, 0);
        privacy.addView(p);
        LinearLayout.LayoutParams pp = cardParams();
        pp.topMargin = dp(12);
        page.addView(privacy, pp);
    }

'''
s = replace_between(s, "    private void showSleep() {", "    private View sessionRow", show_sleep, "fixed sleep header")

# Give candidate playback controls more breathing room at the bottom of each card.
s = s.replace(
    "            LinearLayout buttons = new LinearLayout(this); buttons.setOrientation(LinearLayout.HORIZONTAL);\n",
    "            LinearLayout buttons = new LinearLayout(this); buttons.setOrientation(LinearLayout.HORIZONTAL); buttons.setPadding(0, 0, 0, dp(9));\n",
    1,
)

measure_start = "        LinearLayout measure = card(); measure.addView(text(\"마이크 설정\", 15, TEXT, true));\n"
measure_end = "        page.addView(measure, cardParams());\n"
ma = s.find(measure_start)
mb = s.find(measure_end, ma)
if ma < 0 or mb < 0:
    raise SystemExit("sensitivity settings block not found")
mb += len(measure_end)
measure_block = r'''        LinearLayout measure = card();
        measure.addView(text("마이크 설정", 15, TEXT, true));
        TextView sensitivityHelp = text("민감도가 낮으면 큰·뚜렷한 소리만 후보로 잡고, 높이면 작은 소리까지 더 많이 잡습니다. 너무 높으면 코골이가 아닌 소리도 후보가 늘 수 있어요.", 11, MUTED, false);
        sensitivityHelp.setPadding(0, dp(5), 0, dp(12));
        measure.addView(sensitivityHelp);

        int sensitivity = prefs.getInt("sensitivity", 65);
        TextView sensLabel = text("감지 민감도", 12, TEXT, true);
        TextView sensValue = text(String.valueOf(sensitivity), 20, PRIMARY2, true);
        TextView sensGuide = text(sensitivityGuide(sensitivity), 11, MUTED, false);
        measure.addView(sensLabel);
        sensValue.setGravity(Gravity.CENTER);
        sensValue.setPadding(0, dp(4), 0, 0);
        measure.addView(sensValue);
        sensGuide.setGravity(Gravity.CENTER);
        sensGuide.setPadding(0, dp(2), 0, dp(8));
        measure.addView(sensGuide);

        SeekBar seek = new SeekBar(this);
        seek.setMax(100);
        seek.setProgress(sensitivity);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                sensValue.setText(String.valueOf(progress));
                sensGuide.setText(sensitivityGuide(progress));
                if (fromUser) prefs.edit().putInt("sensitivity", progress).apply();
            }
            @Override public void onStartTrackingTouch(SeekBar bar) {}
            @Override public void onStopTrackingTouch(SeekBar bar) { prefs.edit().putInt("sensitivity", bar.getProgress()).apply(); }
        });
        measure.addView(seek, match(dp(44)));

        LinearLayout fine = new LinearLayout(this);
        fine.setOrientation(LinearLayout.HORIZONTAL);
        fine.setGravity(Gravity.CENTER);
        Button minus = choiceButton("− 1", false, null);
        Button plus = choiceButton("+ 1", false, null);
        TextView fineHint = text("1단위 미세 조절", 11, MUTED, true);
        fineHint.setGravity(Gravity.CENTER);
        minus.setOnClickListener(v -> {
            int next = Math.max(0, seek.getProgress() - 1);
            seek.setProgress(next);
            prefs.edit().putInt("sensitivity", next).apply();
        });
        plus.setOnClickListener(v -> {
            int next = Math.min(100, seek.getProgress() + 1);
            seek.setProgress(next);
            prefs.edit().putInt("sensitivity", next).apply();
        });
        fine.addView(minus, new LinearLayout.LayoutParams(0, dp(42), 1f));
        fine.addView(fineHint, new LinearLayout.LayoutParams(0, dp(42), 1.3f));
        fine.addView(plus, new LinearLayout.LayoutParams(0, dp(42), 1f));
        measure.addView(fine);

        measure.addView(settingSwitch("전체 녹음", "개발자 검증용 AAC 전체 녹음 저장", "developer_full_recording", true));
        measure.addView(settingSwitch("코골이 후보 음원 저장", "후보 앞 3초를 포함한 WAV 구간 저장", "save_candidate_clips", true));
        page.addView(measure, cardParams());
'''
s = s[:ma] + measure_block + s[mb:]

setting_marker = "    private View settingSwitch(String title, String desc, String key, boolean def) {\n"
if setting_marker not in s:
    raise SystemExit("settingSwitch marker missing")
s = s.replace(setting_marker, r'''    private String sensitivityGuide(int value) {
        if (value <= 34) return "낮음 · 큰 소리 위주로 엄격하게 감지";
        if (value <= 69) return "보통 · 일반적인 소리를 균형 있게 감지";
        return "높음 · 작은 소리까지 감지 · 오탐이 늘 수 있음";
    }

''' + setting_marker, 1)

old_stop = """    private void stopMeasurement() {\n        startService(new Intent(this, SleepRecorderService.class).setAction(SleepRecorderService.ACTION_STOP));\n        Toast.makeText(this, \"측정을 마무리하고 있습니다.\", Toast.LENGTH_SHORT).show(); handler.postDelayed(this::showSleep, 1200);\n    }\n"""
new_stop = """    private void stopMeasurement() {\n        startService(new Intent(this, SleepRecorderService.class).setAction(SleepRecorderService.ACTION_STOP));\n        Toast.makeText(this, \"수면 측정을 종료하고 기록을 정리합니다.\", Toast.LENGTH_SHORT).show();\n        waitForSleepStop(0);\n    }\n\n    private void waitForSleepStop(int attempt) {\n        handler.postDelayed(() -> {\n            boolean recording = prefs.getBoolean(SleepRecorderService.KEY_RECORDING, false);\n            if (!recording || attempt >= 20) { showSleep(); return; }\n            waitForSleepStop(attempt + 1);\n        }, 250);\n    }\n"""
if old_stop not in s:
    raise SystemExit("stopMeasurement block not found")
s = s.replace(old_stop, new_stop, 1)

main_path.write_text(s, encoding="utf-8")

service_path = Path("snorelab/app/src/main/java/com/yamo/snorelab/SleepRecorderService.java")
ss = service_path.read_text(encoding="utf-8")
old_action = """        if (ACTION_STOP.equals(action)) { running = false; return START_NOT_STICKY; }\n"""
new_action = """        if (ACTION_STOP.equals(action)) {\n            requestStop();\n            stopSelf();\n            return START_NOT_STICKY;\n        }\n"""
if old_action not in ss:
    raise SystemExit("service stop action not found")
ss = ss.replace(old_action, new_action, 1)

old_destroy = """    @Override\n    public void onDestroy() {\n        running = false;\n        if (audioRecord != null) { try { audioRecord.stop(); } catch (Exception ignored) {} }\n        super.onDestroy();\n    }\n"""
new_destroy = """    @Override\n    public void onDestroy() {\n        requestStop();\n        super.onDestroy();\n    }\n\n    private void requestStop() {\n        running = false;\n        AudioRecord record = audioRecord;\n        if (record != null) {\n            try { record.stop(); } catch (Exception ignored) {}\n        }\n    }\n"""
if old_destroy not in ss:
    raise SystemExit("service onDestroy block not found")
ss = ss.replace(old_destroy, new_destroy, 1)

old_read = """                int n = audioRecord.read(readBuffer, 0, readBuffer.length, AudioRecord.READ_BLOCKING);\n                if (n < 0) throw new IllegalStateException(\"마이크 읽기 오류: \" + n);\n                if (n == 0) continue;\n"""
new_read = """                int n;\n                try {\n                    n = audioRecord.read(readBuffer, 0, readBuffer.length, AudioRecord.READ_BLOCKING);\n                } catch (Throwable readError) {\n                    if (!running) break;\n                    throw readError;\n                }\n                if (!running) break;\n                if (n < 0) throw new IllegalStateException(\"마이크 읽기 오류: \" + n);\n                if (n == 0) continue;\n"""
if old_read not in ss:
    raise SystemExit("audio read block not found")
ss = ss.replace(old_read, new_read, 1)
service_path.write_text(ss, encoding="utf-8")

print("Applied Yamone V0.3.4 five-tab shell and sleep stop fixes")
