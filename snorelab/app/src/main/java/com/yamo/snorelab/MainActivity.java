package com.yamo.snorelab;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int REQ_MIC = 4101;
    private static final int REQ_EXPORT = 4102;
    private static final int BG = 0xFF0B1324;
    private static final int CARD = 0xFF16243B;
    private static final int CARD2 = 0xFF111C31;
    private static final int TEXT = 0xFFF5F7FF;
    private static final int MUTED = 0xFF9DA9BF;
    private static final int PRIMARY = 0xFF6D72FF;
    private static final int PRIMARY2 = 0xFF8B8FFF;
    private static final int DANGER = 0xFFFF6E7E;
    private static final int WARNING = 0xFFFFC56D;
    private static final int SUCCESS = 0xFF61D6A8;

    private FrameLayout content;
    private TextView sleepNav;
    private TextView settingsNav;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String screen = "sleep";
    private File detailSession;
    private boolean pendingStartAfterPermission;
    private File pendingExportSession;
    private boolean pendingExportClips;
    private boolean pendingExportFull;
    private MediaPlayer player;
    private SharedPreferences prefs;

    private final Runnable refresher = new Runnable() {
        @Override public void run() {
            if ("sleep".equals(screen) && detailSession == null && prefs != null &&
                    prefs.getBoolean(SleepRecorderService.KEY_RECORDING, false)) showSleep();
            handler.postDelayed(this, 1500);
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(SleepRecorderService.PREFS, MODE_PRIVATE);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        buildRoot();
        int retention = prefs.getInt("retention_days", 30);
        new Thread(() -> SessionStore.cleanupAudioOlderThan(this, retention)).start();
        showSleep();
        requestNotificationPermissionIfHelpful();
    }

    @Override protected void onResume() { super.onResume(); handler.removeCallbacks(refresher); handler.post(refresher); }
    @Override protected void onPause() { handler.removeCallbacks(refresher); super.onPause(); }
    @Override protected void onDestroy() { stopPlayer(); super.onDestroy(); }

    @Override public void onBackPressed() {
        if (detailSession != null) { detailSession = null; showSleep(); return; }
        if (!"sleep".equals(screen)) { screen = "sleep"; showSleep(); return; }
        super.onBackPressed();
    }

    private void buildRoot() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(12), dp(7), dp(12), dp(9));
        nav.setBackgroundColor(0xFF0E182A);
        sleepNav = navItem("☾\n수면", true, v -> { detailSession = null; screen = "sleep"; showSleep(); });
        settingsNav = navItem("⚙\n설정", false, v -> { detailSession = null; screen = "settings"; showSettings(); });
        nav.addView(sleepNav, new LinearLayout.LayoutParams(0, dp(56), 1f));
        nav.addView(settingsNav, new LinearLayout.LayoutParams(0, dp(56), 1f));
        root.addView(nav, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(root);
    }

    private TextView navItem(String label, boolean selected, View.OnClickListener click) {
        TextView v = text(label, 13, selected ? PRIMARY2 : MUTED, true);
        v.setGravity(Gravity.CENTER); v.setOnClickListener(click); return v;
    }
    private void updateNav() {
        sleepNav.setTextColor("sleep".equals(screen) ? PRIMARY2 : MUTED);
        settingsNav.setTextColor("settings".equals(screen) ? PRIMARY2 : MUTED);
    }

    private void showSleep() {
        screen = "sleep"; updateNav();
        if (detailSession != null) { showSessionDetail(detailSession); return; }
        content.removeAllViews();
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
        LinearLayout page = page(); scroll.addView(page); content.addView(scroll);
        page.addView(text("꿀잠 Lab", 23, TEXT, true));
        TextView subtitle = text("내 잠소리는 내 휴대폰 안에서만.", 13, MUTED, false);
        subtitle.setPadding(0, dp(3), 0, dp(18)); page.addView(subtitle);

        boolean recording = prefs.getBoolean(SleepRecorderService.KEY_RECORDING, false);
        LinearLayout hero = card();
        if (recording) {
            long start = prefs.getLong(SleepRecorderService.KEY_START_MS, System.currentTimeMillis());
            hero.addView(text("수면 측정 중", 18, TEXT, true));
            TextView calm = text("편안한 밤 되세요. 화면을 꺼도 계속 측정합니다.", 13, MUTED, false);
            calm.setPadding(0, dp(5), 0, dp(20)); hero.addView(calm);
            TextView elapsed = text(formatDuration(System.currentTimeMillis() - start), 38, TEXT, true);
            elapsed.setGravity(Gravity.CENTER); hero.addView(elapsed, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(72)));
            TextView began = text("시작  " + new SimpleDateFormat("HH:mm", Locale.KOREAN).format(new Date(start)), 13, MUTED, false);
            began.setGravity(Gravity.CENTER); began.setPadding(0, 0, 0, dp(18)); hero.addView(began);
            hero.addView(actionButton("■  측정 종료", false, v -> stopMeasurement()), match(dp(54)));
        } else {
            List<File> sessions = SessionStore.listSessions(this);
            if (!sessions.isEmpty()) {
                File last = sessions.get(0); JSONObject meta = SessionStore.readMeta(last); JSONArray events = SessionStore.readEvents(last);
                hero.addView(text("지난 수면", 14, MUTED, true));
                TextView date = text(SessionStore.formatLocalDateTime(meta.optLong("startEpochMs", 0)), 12, MUTED, false);
                date.setPadding(0, dp(2), 0, dp(12)); hero.addView(date);
                LinearLayout metrics = new LinearLayout(this); metrics.setOrientation(LinearLayout.HORIZONTAL);
                metrics.addView(metric("측정 시간", formatDuration(meta.optLong("durationMs", 0))), new LinearLayout.LayoutParams(0, dp(74), 1f));
                metrics.addView(metric("후보 구간", events.length() + "건"), new LinearLayout.LayoutParams(0, dp(74), 1f)); hero.addView(metrics);
                SnoreTimelineView timeline = new SnoreTimelineView(this); timeline.setData(events, Math.max(1, meta.optLong("durationMs", 1))); hero.addView(timeline, match(dp(84)));
                hero.addView(ghostButton("지난밤 자세히 보기", v -> { detailSession = last; showSessionDetail(last); }), match(dp(48)));
            } else {
                hero.addView(text("첫 수면 기록을 시작해보세요", 19, TEXT, true));
                TextView desc = text("테스트판에서는 전체 녹음과 코골이 후보 구간을 기기 내부에 저장합니다.", 13, MUTED, false);
                desc.setPadding(0, dp(8), 0, dp(16)); hero.addView(desc);
            }
            Button start = actionButton("☾  수면 측정 시작", true, v -> ensureMicAndStart());
            LinearLayout.LayoutParams bp = match(dp(58)); bp.topMargin = dp(16); hero.addView(start, bp);
        }
        page.addView(hero, cardParams());

        LinearLayout privacy = card(); privacy.addView(text("🔒  테스트판 개인정보 원칙", 15, TEXT, true));
        TextView p = text("회원가입 없음 · 서버 없음 · 자동 업로드 없음\n수면 기록과 음원은 앱 내부 저장소에만 보관됩니다.", 12, MUTED, false);
        p.setPadding(0, dp(8), 0, 0); privacy.addView(p); page.addView(privacy, cardParams());

        List<File> sessions = SessionStore.listSessions(this);
        if (!sessions.isEmpty()) {
            TextView h = text("최근 기록", 16, TEXT, true); h.setPadding(0, dp(18), 0, dp(8)); page.addView(h);
            for (int i = 0; i < Math.min(8, sessions.size()); i++) page.addView(sessionRow(sessions.get(i)), cardParamsCompact());
        }
    }

    private View sessionRow(File dir) {
        JSONObject meta = SessionStore.readMeta(dir); JSONArray events = SessionStore.readEvents(dir);
        LinearLayout c = card(); c.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout left = new LinearLayout(this); left.setOrientation(LinearLayout.VERTICAL);
        left.addView(text(SessionStore.formatLocalDateTime(meta.optLong("startEpochMs", 0)), 14, TEXT, true));
        left.addView(text(formatDuration(meta.optLong("durationMs", 0)) + " · 후보 " + events.length() + "건 · 검토 " + meta.optInt("reviewedCount", 0) + "건", 12, MUTED, false));
        c.addView(left, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView arrow = text("›", 28, PRIMARY2, false); arrow.setGravity(Gravity.CENTER); c.addView(arrow, new LinearLayout.LayoutParams(dp(35), ViewGroup.LayoutParams.MATCH_PARENT));
        c.setOnClickListener(v -> { detailSession = dir; showSessionDetail(dir); }); return c;
    }

    private void showSessionDetail(File dir) {
        screen = "sleep"; updateNav(); content.removeAllViews();
        ScrollView scroll = new ScrollView(this); LinearLayout page = page(); scroll.addView(page); content.addView(scroll);
        JSONObject meta = SessionStore.readMeta(dir); JSONArray events = SessionStore.readEvents(dir);
        long start = meta.optLong("startEpochMs", 0); long duration = meta.optLong("durationMs", Math.max(1, System.currentTimeMillis() - start));

        LinearLayout top = new LinearLayout(this); top.setOrientation(LinearLayout.HORIZONTAL);
        TextView back = text("‹", 34, TEXT, false); back.setGravity(Gravity.CENTER_VERTICAL); back.setOnClickListener(v -> { detailSession = null; showSleep(); });
        top.addView(back, new LinearLayout.LayoutParams(dp(42), dp(48)));
        TextView title = text(new SimpleDateFormat("M월 d일 (E)", Locale.KOREAN).format(new Date(start)), 20, TEXT, true); title.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(title, new LinearLayout.LayoutParams(0, dp(48), 1f)); page.addView(top);

        LinearLayout summary = card(); summary.addView(text("수면 요약", 15, PRIMARY2, true));
        summary.addView(kv("측정 시간", formatDuration(duration))); summary.addView(kv("후보 구간", events.length() + "건"));
        summary.addView(kv("검토 완료", meta.optInt("reviewedCount", 0) + "건")); summary.addView(kv("코골이 확정", meta.optInt("snoreConfirmedCount", 0) + "건"));
        summary.addView(kv("판정 버전", meta.optString("detectorVersion", SnoreDetector.VERSION)));
        if ("error".equals(meta.optString("status"))) summary.addView(text("오류: " + meta.optString("error", "알 수 없음"), 12, DANGER, false));
        page.addView(summary, cardParams());

        LinearLayout timelineCard = card(); timelineCard.addView(text("코골이 후보 타임라인", 15, TEXT, true));
        SnoreTimelineView timeline = new SnoreTimelineView(this); timeline.setData(events, Math.max(1, duration)); timelineCard.addView(timeline, match(dp(90)));
        timelineCard.addView(text("보라색: 후보 · 붉은색: 높은 판정 점수", 11, MUTED, false)); page.addView(timelineCard, cardParams());

        LinearLayout export = card(); export.addView(text("개발자 데이터 내보내기", 15, TEXT, true));
        TextView exp = text("사용자가 직접 눌렀을 때만 ZIP을 만듭니다. 자동 전송은 없습니다.", 12, MUTED, false); exp.setPadding(0, dp(7), 0, dp(10)); export.addView(exp);
        export.addView(ghostButton("분석 데이터만 (.zip)", v -> beginExport(dir, false, false)), match(dp(46)));
        LinearLayout.LayoutParams ep2 = match(dp(46)); ep2.topMargin = dp(8); export.addView(ghostButton("분석 + 후보 음원 (.zip)", v -> beginExport(dir, true, false)), ep2);
        LinearLayout.LayoutParams ep3 = match(dp(46)); ep3.topMargin = dp(8); export.addView(ghostButton("전체 녹음까지 포함 (.zip)", v -> beginExport(dir, true, true)), ep3);
        page.addView(export, cardParams());

        LinearLayout actions = card(); actions.addView(text("데이터 관리", 15, TEXT, true));
        actions.addView(ghostButton("녹음만 삭제 · 패턴 유지", v -> confirm("녹음만 삭제할까요?", "분석 패턴과 판정 결과는 그대로 남습니다.", () -> { SessionStore.deleteAllAudioKeepPatterns(dir); showSessionDetail(dir); })), match(dp(46)));
        LinearLayout.LayoutParams delp = match(dp(46)); delp.topMargin = dp(8);
        Button del = ghostButton("이 날짜 기록 전체 삭제", v -> confirm("이 기록을 모두 삭제할까요?", "녹음과 분석 패턴이 모두 삭제됩니다.", () -> { SessionStore.deleteSession(dir); detailSession = null; showSleep(); }));
        del.setTextColor(DANGER); actions.addView(del, delp); page.addView(actions, cardParams());

        TextView listHeader = text("후보 검토", 17, TEXT, true); listHeader.setPadding(0, dp(18), 0, dp(8)); page.addView(listHeader);
        if (events.length() == 0) { LinearLayout empty = card(); empty.addView(text("감지된 후보가 없습니다.", 13, MUTED, false)); page.addView(empty, cardParams()); }
        for (int i = 0; i < events.length(); i++) {
            JSONObject e = events.optJSONObject(i); if (e == null) continue; final int idx = i;
            LinearLayout row = card(); LinearLayout head = new LinearLayout(this); head.setOrientation(LinearLayout.HORIZONTAL);
            long eventStart = start + e.optLong("startOffsetMs", 0);
            head.addView(text(new SimpleDateFormat("HH:mm:ss", Locale.KOREAN).format(new Date(eventStart)), 15, TEXT, true), new LinearLayout.LayoutParams(0, dp(34), 1f));
            TextView score = text(String.format(Locale.US, "점수 %.0f", e.optDouble("scoreMax", 0)), 12, e.optDouble("scoreMax", 0) >= 72 ? DANGER : WARNING, true);
            score.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT); head.addView(score, new LinearLayout.LayoutParams(dp(90), dp(34))); row.addView(head);
            String label = e.optString("reviewLabel", "UNREVIEWED"); TextView info = text(formatDuration(e.optLong("durationMs", 0)) + " · " + labelKorean(label), 12, labelColor(label), false);
            info.setPadding(0, 0, 0, dp(10)); row.addView(info);
            LinearLayout buttons = new LinearLayout(this); buttons.setOrientation(LinearLayout.HORIZONTAL);
            buttons.addView(ghostButton("▶ 듣기", v -> playClip(dir, e)), new LinearLayout.LayoutParams(0, dp(42), 1f));
            LinearLayout.LayoutParams jp = new LinearLayout.LayoutParams(0, dp(42), 1f); jp.leftMargin = dp(8); buttons.addView(ghostButton("판정", v -> showReviewDialog(dir, idx)), jp);
            row.addView(buttons); page.addView(row, cardParamsCompact());
        }
    }

    private void showSettings() {
        screen = "settings"; updateNav(); content.removeAllViews();
        ScrollView scroll = new ScrollView(this); LinearLayout page = page(); scroll.addView(page); content.addView(scroll);
        page.addView(text("설정", 23, TEXT, true)); TextView sub = text("개인정보가 아니라 측정 기능만 설정합니다.", 13, MUTED, false); sub.setPadding(0, dp(4), 0, dp(16)); page.addView(sub);

        LinearLayout measure = card(); measure.addView(text("수면 측정", 15, TEXT, true));
        int sensitivity = prefs.getInt("sensitivity", 65); TextView sensLabel = text("코골이 감지 민감도  " + sensitivity, 13, MUTED, false); sensLabel.setPadding(0, dp(12), 0, 0); measure.addView(sensLabel);
        SeekBar seek = new SeekBar(this); seek.setMax(100); seek.setProgress(sensitivity);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int progress, boolean fromUser) { sensLabel.setText("코골이 감지 민감도  " + progress); }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) { prefs.edit().putInt("sensitivity", s.getProgress()).apply(); }
        });
        measure.addView(seek, match(dp(48)));
        measure.addView(settingSwitch("전체 녹음 (개발자 검증용)", "출시 전 테스트 동안 밤 전체를 AAC로 저장", "developer_full_recording", true));
        measure.addView(settingSwitch("후보 구간 WAV 저장", "후보 앞 3초를 포함해 검토용 음원을 저장", "save_candidate_clips", true));
        page.addView(measure, cardParams());

        LinearLayout storage = card(); storage.addView(text("녹음 관리", 15, TEXT, true)); storage.addView(text("녹음 보관 기간", 13, MUTED, false));
        String[] options = {"7일", "30일", "90일", "계속 보관"}; int[] vals = {7, 30, 90, 0};
        Spinner spinner = new Spinner(this); ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, options); spinner.setAdapter(adapter);
        int currentDays = prefs.getInt("retention_days", 30), selected = 1; for (int i = 0; i < vals.length; i++) if (vals[i] == currentDays) selected = i; spinner.setSelection(selected);
        spinner.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) { prefs.edit().putInt("retention_days", vals[position]).apply(); }
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
        });
        storage.addView(spinner, match(dp(52))); long bytes = SessionStore.folderSize(SessionStore.sessionsRoot(this));
        TextView usage = text("현재 앱 데이터  " + humanBytes(bytes), 12, MUTED, false); usage.setPadding(0, dp(8), 0, dp(10)); storage.addView(usage);
        Button wipe = ghostButton("전체 수면 데이터 삭제", v -> confirm("전체 데이터를 삭제할까요?", "모든 날짜의 녹음과 분석 기록이 삭제됩니다.", () -> { SessionStore.deleteAll(this); showSettings(); }));
        wipe.setTextColor(DANGER); storage.addView(wipe, match(dp(46))); page.addView(storage, cardParams());

        LinearLayout privacy = card(); privacy.addView(text("개인정보 보호", 15, TEXT, true));
        privacy.addView(checkLine("회원가입과 로그인 기능이 없습니다.")); privacy.addView(checkLine("이름·이메일·전화번호를 입력받지 않습니다."));
        privacy.addView(checkLine("수면 기록과 녹음은 앱 내부 저장소에만 저장됩니다.")); privacy.addView(checkLine("자동 업로드나 자체 서버 전송 기능이 없습니다.")); privacy.addView(checkLine("현재 테스트판에는 INTERNET 권한도 없습니다."));
        TextView note = text("※ 향후 광고판은 광고 표시용 네트워크만 별도 허용하고, 수면 데이터 경로와 분리할 예정입니다.", 11, MUTED, false); note.setPadding(0, dp(12), 0, 0); privacy.addView(note); page.addView(privacy, cardParams());

        LinearLayout dev = card(); dev.addView(text("개발자 검증 정보", 15, TEXT, true)); dev.addView(kv("앱 버전", "0.1.0-test")); dev.addView(kv("판정 엔진", SnoreDetector.VERSION));
        dev.addView(kv("분석 샘플레이트", "16 kHz / mono")); dev.addView(kv("전체 녹음", "AAC-LC 32 kbps")); dev.addView(kv("후보 음원", "PCM16 WAV")); page.addView(dev, cardParams());
    }

    private View settingSwitch(String title, String desc, String key, boolean def) {
        LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL); row.setPadding(0, dp(10), 0, dp(4));
        LinearLayout texts = new LinearLayout(this); texts.setOrientation(LinearLayout.VERTICAL); texts.addView(text(title, 13, TEXT, true)); texts.addView(text(desc, 11, MUTED, false));
        row.addView(texts, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)); Switch sw = new Switch(this); sw.setChecked(prefs.getBoolean(key, def));
        sw.setOnCheckedChangeListener((buttonView, isChecked) -> prefs.edit().putBoolean(key, isChecked).apply()); row.addView(sw, new LinearLayout.LayoutParams(dp(58), dp(50))); return row;
    }

    private void ensureMicAndStart() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingStartAfterPermission = true; requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC); return;
        }
        startMeasurement();
    }
    private void startMeasurement() {
        if (prefs.getBoolean(SleepRecorderService.KEY_RECORDING, false)) return;
        try {
            startForegroundService(new Intent(this, SleepRecorderService.class).setAction(SleepRecorderService.ACTION_START));
            Toast.makeText(this, "수면 측정을 시작합니다. 충전 연결을 권장합니다.", Toast.LENGTH_LONG).show(); handler.postDelayed(this::showSleep, 500);
        } catch (Exception e) { Toast.makeText(this, "측정을 시작하지 못했습니다: " + e.getMessage(), Toast.LENGTH_LONG).show(); }
    }
    private void stopMeasurement() {
        startService(new Intent(this, SleepRecorderService.class).setAction(SleepRecorderService.ACTION_STOP));
        Toast.makeText(this, "측정을 마무리하고 있습니다.", Toast.LENGTH_SHORT).show(); handler.postDelayed(this::showSleep, 1200);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_MIC) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED && pendingStartAfterPermission) startMeasurement();
            else if (grantResults.length == 0 || grantResults[0] != PackageManager.PERMISSION_GRANTED) Toast.makeText(this, "수면 소리를 측정하려면 마이크 권한이 필요합니다.", Toast.LENGTH_LONG).show();
            pendingStartAfterPermission = false;
        }
    }
    private void requestNotificationPermissionIfHelpful() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4103);
    }

    private void showReviewDialog(File dir, int index) {
        String[] labels = {"코골이", "코골이 아님", "애매함", "미검토로 되돌리기"}; String[] values = {"SNORE", "NOT_SNORE", "UNCERTAIN", "UNREVIEWED"};
        new AlertDialog.Builder(this).setTitle("이 구간을 어떻게 판정할까요?").setItems(labels, (d, which) -> {
            try { SessionStore.reviewEvent(dir, index, values[which]); showSessionDetail(dir); }
            catch (Exception e) { Toast.makeText(this, "판정 저장 실패", Toast.LENGTH_SHORT).show(); }
        }).show();
    }

    private void playClip(File dir, JSONObject event) {
        String rel = event.optString("clipFile", "");
        if (rel.isEmpty() || "null".equals(rel)) { Toast.makeText(this, "이 후보에는 저장된 음원이 없습니다.", Toast.LENGTH_SHORT).show(); return; }
        File clip = new File(dir, rel); if (!clip.exists()) { Toast.makeText(this, "녹음 파일이 삭제되었습니다.", Toast.LENGTH_SHORT).show(); return; }
        stopPlayer();
        try {
            player = new MediaPlayer(); player.setDataSource(clip.getAbsolutePath()); player.prepare(); player.start(); player.setOnCompletionListener(mp -> stopPlayer());
            Toast.makeText(this, "후보 앞 3초부터 재생합니다.", Toast.LENGTH_SHORT).show();
        } catch (Exception e) { stopPlayer(); Toast.makeText(this, "재생 실패: " + e.getMessage(), Toast.LENGTH_SHORT).show(); }
    }
    private void stopPlayer() {
        if (player != null) { try { player.stop(); } catch (Exception ignored) {} try { player.release(); } catch (Exception ignored) {} player = null; }
    }

    private void beginExport(File dir, boolean includeClips, boolean includeFull) {
        pendingExportSession = dir; pendingExportClips = includeClips; pendingExportFull = includeFull;
        String suffix = includeFull ? "_full" : includeClips ? "_candidates" : "_analysis";
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("application/zip"); intent.putExtra(Intent.EXTRA_TITLE, dir.getName() + suffix + ".zip"); startActivityForResult(intent, REQ_EXPORT);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_EXPORT || resultCode != RESULT_OK || data == null || data.getData() == null || pendingExportSession == null) return;
        Uri uri = data.getData(); File dir = pendingExportSession; boolean clips = pendingExportClips, full = pendingExportFull; pendingExportSession = null;
        Toast.makeText(this, "내보내기 파일을 생성합니다.", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            try {
                File zip = SessionStore.createExportZip(this, dir, clips, full);
                try (FileInputStream in = new FileInputStream(zip); OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out == null) throw new IllegalStateException("저장 위치를 열 수 없습니다."); byte[] buffer = new byte[64 * 1024]; int n; while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
                }
                runOnUiThread(() -> Toast.makeText(this, "테스트 데이터 저장 완료", Toast.LENGTH_LONG).show());
            } catch (Exception e) { runOnUiThread(() -> Toast.makeText(this, "내보내기 실패: " + e.getMessage(), Toast.LENGTH_LONG).show()); }
        }, "SnoreLabExport").start();
    }

    private LinearLayout page() { LinearLayout p = new LinearLayout(this); p.setOrientation(LinearLayout.VERTICAL); p.setPadding(dp(18), dp(18), dp(18), dp(30)); p.setBackgroundColor(BG); return p; }
    private LinearLayout card() { LinearLayout v = new LinearLayout(this); v.setOrientation(LinearLayout.VERTICAL); v.setPadding(dp(16), dp(15), dp(16), dp(15)); v.setBackground(round(CARD, 18, 0, 0)); return v; }
    private LinearLayout metric(String label, String value) {
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(5), dp(8), dp(5), 0);
        TextView val = text(value, 20, TEXT, true); val.setGravity(Gravity.CENTER); TextView lab = text(label, 11, MUTED, false); lab.setGravity(Gravity.CENTER); box.addView(val); box.addView(lab); return box;
    }
    private View kv(String key, String value) {
        LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL); row.setPadding(0, dp(10), 0, 0);
        TextView k = text(key, 12, MUTED, false); TextView v = text(value, 13, TEXT, true); v.setGravity(Gravity.RIGHT);
        row.addView(k, new LinearLayout.LayoutParams(0, dp(28), 1f)); row.addView(v, new LinearLayout.LayoutParams(0, dp(28), 1f)); return row;
    }
    private TextView checkLine(String s) { TextView v = text("✓  " + s, 12, TEXT, false); v.setPadding(0, dp(9), 0, 0); return v; }
    private TextView text(String s, int sp, int color, boolean bold) { TextView v = new TextView(this); v.setText(s); v.setTextSize(sp); v.setTextColor(color); if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD); v.setLineSpacing(0, 1.08f); return v; }
    private Button actionButton(String s, boolean primary, View.OnClickListener click) { Button b = new Button(this); b.setText(s); b.setAllCaps(false); b.setTextSize(15); b.setTypeface(Typeface.DEFAULT, Typeface.BOLD); b.setTextColor(Color.WHITE); b.setBackground(round(primary ? PRIMARY : 0xFF33425B, 18, 0, 0)); b.setOnClickListener(click); return b; }
    private Button ghostButton(String s, View.OnClickListener click) { Button b = new Button(this); b.setText(s); b.setAllCaps(false); b.setTextSize(13); b.setTextColor(TEXT); b.setBackground(round(CARD2, 13, 1, 0xFF35445F)); b.setOnClickListener(click); return b; }
    private GradientDrawable round(int color, int radiusDp, int strokeDp, int strokeColor) { GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(radiusDp)); if (strokeDp > 0) g.setStroke(dp(strokeDp), strokeColor); return g; }
    private LinearLayout.LayoutParams cardParams() { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); p.bottomMargin = dp(12); return p; }
    private LinearLayout.LayoutParams cardParamsCompact() { LinearLayout.LayoutParams p = cardParams(); p.bottomMargin = dp(8); return p; }
    private LinearLayout.LayoutParams match(int h) { return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, h); }
    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    private void confirm(String title, String message, Runnable yes) { new AlertDialog.Builder(this).setTitle(title).setMessage(message).setNegativeButton("취소", null).setPositiveButton("확인", (d, w) -> yes.run()).show(); }
    private String labelKorean(String label) { switch (label) { case "SNORE": return "코골이"; case "NOT_SNORE": return "코골이 아님"; case "UNCERTAIN": return "애매함"; default: return "미검토"; } }
    private int labelColor(String label) { switch (label) { case "SNORE": return SUCCESS; case "NOT_SNORE": return DANGER; case "UNCERTAIN": return WARNING; default: return MUTED; } }
    private static String formatDuration(long ms) {
        long total = Math.max(0, ms / 1000), h = total / 3600, m = (total % 3600) / 60, s = total % 60;
        if (h > 0) return String.format(Locale.KOREAN, "%d시간 %02d분", h, m); if (m > 0) return String.format(Locale.KOREAN, "%d분 %02d초", m, s); return s + "초";
    }
    private static String humanBytes(long b) {
        if (b < 1024) return b + " B"; double kb = b / 1024.0; if (kb < 1024) return String.format(Locale.US, "%.1f KB", kb);
        double mb = kb / 1024.0; if (mb < 1024) return String.format(Locale.US, "%.1f MB", mb); return String.format(Locale.US, "%.2f GB", mb / 1024.0);
    }
}
