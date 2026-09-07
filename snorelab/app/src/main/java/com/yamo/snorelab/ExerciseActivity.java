package com.yamo.snorelab;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class ExerciseActivity extends Activity {
    private static final int REQ_ACTIVITY = 4301;
    private static final int BG = 0xFF0B1324;
    private static final int CARD = 0xFF16243B;
    private static final int CARD2 = 0xFF111C31;
    private static final int TEXT = 0xFFF5F7FF;
    private static final int MUTED = 0xFF9DA9BF;
    private static final int PRIMARY = 0xFF6D72FF;
    private static final int PRIMARY2 = 0xFF8B8FFF;
    private static final int SUCCESS = 0xFF61D6A8;
    private static final int WARNING = 0xFFFFC56D;

    private FrameLayout content;
    private SharedPreferences runtime;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean detailOpen;
    private File detailDir;

    private TextView liveDistance;
    private TextView liveTime;
    private TextView livePace;
    private TextView liveSteps;
    private TextView liveSpeed;
    private TextView liveMoving;
    private TextView liveAltitude;
    private TextView liveAccuracy;
    private TextView liveGoal;
    private ProgressBar liveProgress;
    private WalkingRouteView liveRoute;
    private long lastRouteReload;

    private final Runnable refresher = new Runnable() {
        @Override public void run() {
            boolean rec = runtime != null && runtime.getBoolean(WalkingRecorderService.KEY_RECORDING, false);
            if (!detailOpen && rec && liveDistance != null) updateLive();
            else if (!detailOpen && !rec && liveDistance != null) showHome();
            handler.postDelayed(this, 1000);
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        runtime = getSharedPreferences(WalkingRecorderService.PREFS, MODE_PRIVATE);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        buildRoot();
        showHome();
    }

    @Override protected void onResume() {
        super.onResume();
        handler.removeCallbacks(refresher);
        handler.post(refresher);
        if (!detailOpen) showHome();
    }

    @Override protected void onPause() {
        handler.removeCallbacks(refresher);
        super.onPause();
    }

    @Override public void onBackPressed() {
        if (detailOpen) { detailOpen = false; detailDir = null; showHome(); return; }
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
        nav.setPadding(dp(8), dp(7), dp(8), dp(9));
        nav.setBackgroundColor(0xFF0E182A);
        nav.addView(navItem("⏰\n알람", MUTED, v -> { startActivity(new Intent(this, AlarmActivity.class)); finish(); }), new LinearLayout.LayoutParams(0, dp(56), 1f));
        nav.addView(navItem("☾\n수면", MUTED, v -> { startActivity(new Intent(this, MainActivity.class)); finish(); }), new LinearLayout.LayoutParams(0, dp(56), 1f));
        nav.addView(navItem("🏃\n활동", PRIMARY2, v -> { detailOpen = false; showHome(); }), new LinearLayout.LayoutParams(0, dp(56), 1f));
        nav.addView(navItem("⚙\n설정", MUTED, v -> { startActivity(new Intent(this, MainActivity.class).putExtra("start_screen", "settings")); finish(); }), new LinearLayout.LayoutParams(0, dp(56), 1f));
        root.addView(nav, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        if (Build.VERSION.SDK_INT >= 21) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                int bottom = Build.VERSION.SDK_INT >= 30 ? insets.getInsets(WindowInsets.Type.navigationBars()).bottom : insets.getSystemWindowInsetBottom();
                v.setPadding(0, 0, 0, bottom);
                return insets;
            });
            root.requestApplyInsets();
        }
        setContentView(root);
    }

    private void showHome() {
        detailOpen = false;
        detailDir = null;
        content.removeAllViews();
        ScrollView scroll = new ScrollView(this);
        LinearLayout page = page();
        scroll.addView(page);
        content.addView(scroll);

        page.addView(text("활동", 24, TEXT, true));
        TextView sub = text("휴대폰만으로 기록하는 활동 · 현재 걷기 V1", 12, MUTED, false);
        sub.setPadding(0, dp(3), 0, dp(14));
        page.addView(sub);

        if (runtime.getBoolean(WalkingRecorderService.KEY_RECORDING, false)) {
            buildLive(page);
        } else {
            buildStart(page);
            buildRecent(page);
        }

        LinearLayout privacy = card();
        privacy.addView(text("🔒 위치 기록 원칙", 15, TEXT, true));
        TextView p = text("GPS 경로와 활동 기록은 휴대폰 내부에만 저장됩니다. 현재 활동 기능은 인터넷·지도 서버·외부 위치 API를 사용하지 않습니다.", 12, MUTED, false);
        p.setPadding(0, dp(8), 0, 0);
        privacy.addView(p);
        page.addView(privacy, cardParams());
    }

    private void buildStart(LinearLayout page) {
        LinearLayout today = card();
        today.addView(text("오늘", 14, MUTED, true));
        long todaySteps = WalkingStore.recordedStepsToday(this);
        TextView steps = text(String.format(Locale.KOREAN, "%,d걸음", todaySteps), 32, TEXT, true);
        steps.setPadding(0, dp(5), 0, 0);
        today.addView(steps);
        today.addView(text("앱에서 걷기 기록을 시작한 시간의 걸음만 합산합니다.", 11, MUTED, false));
        page.addView(today, cardParams());

        LinearLayout startCard = card();
        startCard.addView(text("🚶 걷기", 19, TEXT, true));
        TextView desc = text("GPS 경로 · 거리 · 시간 · 이동/정지 · 걸음수 · 페이스 · 1km 랩을 기록합니다.", 12, MUTED, false);
        desc.setPadding(0, dp(6), 0, dp(12));
        startCard.addView(desc);

        startCard.addView(text("이번 걷기 목표 (선택)", 13, PRIMARY2, true));
        LinearLayout goals = new LinearLayout(this);
        goals.setOrientation(LinearLayout.HORIZONTAL);
        EditText km = numberField("거리 km");
        EditText minutes = numberField("제한시간 분");
        goals.addView(km, new LinearLayout.LayoutParams(0, dp(52), 1f));
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(0, dp(52), 1f); gp.leftMargin = dp(8);
        goals.addView(minutes, gp);
        startCard.addView(goals);
        TextView hint = text("예: 거리 5 + 제한시간 60 → 60분 안에 5km 목표", 11, MUTED, false);
        hint.setPadding(0, dp(6), 0, dp(12));
        startCard.addView(hint);

        Button start = actionButton("▶ 걷기 기록 시작", true, v -> startWalking(km.getText().toString(), minutes.getText().toString()));
        startCard.addView(start, match(dp(56)));
        page.addView(startCard, cardParams());
    }

    private void buildLive(LinearLayout page) {
        LinearLayout hero = card();
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(text("🚶 걷기 기록 중", 18, TEXT, true), new LinearLayout.LayoutParams(0, dp(38), 1f));
        TextView state = text(runtime.getBoolean(WalkingRecorderService.KEY_PAUSED, false) ? "일시정지" : "GPS 기록", 12,
                runtime.getBoolean(WalkingRecorderService.KEY_PAUSED, false) ? WARNING : SUCCESS, true);
        state.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        top.addView(state, new LinearLayout.LayoutParams(dp(100), dp(38)));
        hero.addView(top);

        liveDistance = text("0.00 km", 42, TEXT, true);
        liveDistance.setGravity(Gravity.CENTER);
        liveDistance.setPadding(0, dp(5), 0, 0);
        hero.addView(liveDistance, match(dp(64)));

        LinearLayout row1 = new LinearLayout(this); row1.setOrientation(LinearLayout.HORIZONTAL);
        liveTime = metricValue("00:00"); livePace = metricValue("--'--\"/km"); liveSteps = metricValue("0");
        row1.addView(metricBox("전체 시간", liveTime), new LinearLayout.LayoutParams(0, dp(74), 1f));
        row1.addView(metricBox("평균 페이스", livePace), new LinearLayout.LayoutParams(0, dp(74), 1f));
        row1.addView(metricBox("걸음", liveSteps), new LinearLayout.LayoutParams(0, dp(74), 1f));
        hero.addView(row1);

        LinearLayout row2 = new LinearLayout(this); row2.setOrientation(LinearLayout.HORIZONTAL);
        liveSpeed = metricValue("0.0 km/h"); liveMoving = metricValue("00:00"); liveAltitude = metricValue("-- m");
        row2.addView(metricBox("현재 속도", liveSpeed), new LinearLayout.LayoutParams(0, dp(70), 1f));
        row2.addView(metricBox("이동 시간", liveMoving), new LinearLayout.LayoutParams(0, dp(70), 1f));
        row2.addView(metricBox("GPS 고도", liveAltitude), new LinearLayout.LayoutParams(0, dp(70), 1f));
        hero.addView(row2);
        liveAccuracy = text("GPS 정확도 --", 11, MUTED, false); liveAccuracy.setGravity(Gravity.CENTER); hero.addView(liveAccuracy);
        page.addView(hero, cardParams());

        long gd = runtime.getLong(WalkingRecorderService.KEY_GOAL_DISTANCE_M, 0);
        long gt = runtime.getLong(WalkingRecorderService.KEY_GOAL_TIME_MS, 0);
        if (gd > 0 || gt > 0) {
            LinearLayout goal = card(); goal.addView(text("오늘의 이번 걷기 목표", 15, TEXT, true));
            liveGoal = text("", 13, MUTED, false); liveGoal.setPadding(0, dp(8), 0, dp(7)); goal.addView(liveGoal);
            liveProgress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); liveProgress.setMax(100); goal.addView(liveProgress, match(dp(24)));
            page.addView(goal, cardParams());
        }

        LinearLayout routeCard = card();
        routeCard.addView(text("이동 경로", 15, TEXT, true));
        liveRoute = new WalkingRouteView(this);
        LinearLayout.LayoutParams rp = match(dp(210)); rp.topMargin = dp(8); routeCard.addView(liveRoute, rp);
        page.addView(routeCard, cardParams());

        LinearLayout controls = new LinearLayout(this); controls.setOrientation(LinearLayout.HORIZONTAL);
        boolean paused = runtime.getBoolean(WalkingRecorderService.KEY_PAUSED, false);
        Button pause = ghostButton(paused ? "▶ 계속" : "Ⅱ 일시정지", v -> togglePause());
        Button stop = actionButton("■ 종료", false, v -> stopWalking());
        controls.addView(pause, new LinearLayout.LayoutParams(0, dp(54), 1f));
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(0, dp(54), 1f); sp.leftMargin = dp(10); controls.addView(stop, sp);
        page.addView(controls, cardParams());

        updateLive();
    }

    private void updateLive() {
        if (liveDistance == null) return;
        long distance = runtime.getLong(WalkingRecorderService.KEY_DISTANCE_M, 0);
        long elapsed = runtime.getLong(WalkingRecorderService.KEY_ELAPSED_MS, 0);
        long moving = runtime.getLong(WalkingRecorderService.KEY_MOVING_MS, 0);
        long steps = runtime.getLong(WalkingRecorderService.KEY_STEPS, 0);
        boolean stepAvailable = runtime.getBoolean(WalkingRecorderService.KEY_STEP_AVAILABLE, false);
        float speed = runtime.getFloat(WalkingRecorderService.KEY_CURRENT_SPEED_KMH, 0);
        float altitude = runtime.getFloat(WalkingRecorderService.KEY_ALTITUDE_M, Float.NaN);
        float accuracy = runtime.getFloat(WalkingRecorderService.KEY_ACCURACY_M, Float.NaN);

        liveDistance.setText(String.format(Locale.KOREAN, "%.2f km", distance / 1000.0));
        liveTime.setText(formatClock(elapsed));
        liveMoving.setText(formatClock(moving));
        livePace.setText(formatPace(moving, distance));
        liveSteps.setText(stepAvailable ? String.format(Locale.KOREAN, "%,d", steps) : "미지원");
        liveSpeed.setText(String.format(Locale.KOREAN, "%.1f km/h", speed));
        liveAltitude.setText(Float.isNaN(altitude) ? "-- m" : String.format(Locale.KOREAN, "%.0f m", altitude));
        liveAccuracy.setText(Float.isNaN(accuracy) ? "GPS 정확도 확인 중" : String.format(Locale.KOREAN, "GPS 정확도 ±%.0fm", accuracy));

        if (liveGoal != null && liveProgress != null) {
            long gd = runtime.getLong(WalkingRecorderService.KEY_GOAL_DISTANCE_M, 0);
            long gt = runtime.getLong(WalkingRecorderService.KEY_GOAL_TIME_MS, 0);
            String state = runtime.getString(WalkingRecorderService.KEY_GOAL_STATE, "ACTIVE");
            StringBuilder b = new StringBuilder();
            if (gd > 0) b.append(String.format(Locale.KOREAN, "거리 %.2f / %.2f km", distance / 1000.0, gd / 1000.0));
            if (gt > 0) {
                if (b.length() > 0) b.append(" · ");
                long remain = Math.max(0, gt - elapsed);
                b.append("남은 시간 ").append(formatClock(remain));
            }
            if ("SUCCESS".equals(state)) b.append(" · ✓ 목표 달성");
            else if ("TIMEOUT".equals(state)) b.append(" · 목표 시간 종료");
            liveGoal.setText(b.toString());
            int progress = gd > 0 ? (int) Math.min(100, distance * 100 / Math.max(1, gd)) : (int) Math.min(100, elapsed * 100 / Math.max(1, gt));
            liveProgress.setProgress(progress);
        }

        long now = System.currentTimeMillis();
        if (liveRoute != null && now - lastRouteReload > 4000) {
            String path = runtime.getString(WalkingRecorderService.KEY_SESSION_DIR, "");
            if (!path.isEmpty()) liveRoute.setPoints(WalkingStore.readRoute(new File(path), 1000));
            lastRouteReload = now;
        }
    }

    private void buildRecent(LinearLayout page) {
        List<File> sessions = WalkingStore.listSessions(this);
        if (sessions.isEmpty()) return;
        TextView h = text("최근 걷기", 17, TEXT, true); h.setPadding(0, dp(12), 0, dp(8)); page.addView(h);
        for (int i = 0; i < Math.min(8, sessions.size()); i++) {
            File dir = sessions.get(i); JSONObject m = WalkingStore.readMeta(dir);
            if (!"complete".equals(m.optString("status"))) continue;
            LinearLayout c = card(); c.setOrientation(LinearLayout.HORIZONTAL);
            LinearLayout left = new LinearLayout(this); left.setOrientation(LinearLayout.VERTICAL);
            long start = m.optLong("startEpochMs", 0); long dist = m.optLong("distanceM", 0); long moving = m.optLong("movingMs", 0);
            left.addView(text(new SimpleDateFormat("M월 d일 (E) HH:mm", Locale.KOREAN).format(new Date(start)), 14, TEXT, true));
            left.addView(text(String.format(Locale.KOREAN, "%.2f km · %s · %s · %,d걸음", dist / 1000.0, formatClock(m.optLong("durationMs", 0)), formatPace(moving, dist), m.optLong("steps", 0)), 12, MUTED, false));
            c.addView(left, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            TextView arrow = text("›", 28, PRIMARY2, false); arrow.setGravity(Gravity.CENTER); c.addView(arrow, new LinearLayout.LayoutParams(dp(32), ViewGroup.LayoutParams.MATCH_PARENT));
            c.setOnClickListener(v -> showDetail(dir)); page.addView(c, cardParamsCompact());
        }
    }

    private void showDetail(File dir) {
        detailOpen = true; detailDir = dir; content.removeAllViews();
        ScrollView scroll = new ScrollView(this); LinearLayout page = page(); scroll.addView(page); content.addView(scroll);
        JSONObject m = WalkingStore.readMeta(dir);

        LinearLayout top = new LinearLayout(this); top.setOrientation(LinearLayout.HORIZONTAL); top.setGravity(Gravity.CENTER_VERTICAL);
        TextView back = text("‹", 34, TEXT, false); back.setGravity(Gravity.CENTER); back.setOnClickListener(v -> { detailOpen = false; showHome(); }); top.addView(back, new LinearLayout.LayoutParams(dp(42), dp(50)));
        top.addView(text("걷기 기록", 22, TEXT, true), new LinearLayout.LayoutParams(0, dp(50), 1f)); page.addView(top);

        long start = m.optLong("startEpochMs", 0); long dist = m.optLong("distanceM", 0); long duration = m.optLong("durationMs", 0); long moving = m.optLong("movingMs", 0);
        TextView date = text(new SimpleDateFormat("yyyy년 M월 d일 (E) HH:mm", Locale.KOREAN).format(new Date(start)), 12, MUTED, false); date.setPadding(0, 0, 0, dp(10)); page.addView(date);

        LinearLayout summary = card(); summary.addView(text(String.format(Locale.KOREAN, "%.2f km", dist / 1000.0), 36, TEXT, true));
        summary.addView(kv("전체 시간", formatClock(duration))); summary.addView(kv("이동 시간", formatClock(moving))); summary.addView(kv("평균 페이스", formatPace(moving, dist)));
        summary.addView(kv("걸음수", String.format(Locale.KOREAN, "%,d", m.optLong("steps", 0)))); summary.addView(kv("최고 속도", String.format(Locale.KOREAN, "%.1f km/h", m.optDouble("maxSpeedKmh", 0))));
        page.addView(summary, cardParams());

        LinearLayout routeCard = card(); routeCard.addView(text("이동 경로", 15, TEXT, true)); WalkingRouteView rv = new WalkingRouteView(this); rv.setPoints(WalkingStore.readRoute(dir, 1200)); LinearLayout.LayoutParams rp = match(dp(230)); rp.topMargin = dp(8); routeCard.addView(rv, rp); page.addView(routeCard, cardParams());

        JSONArray splits = m.optJSONArray("splitsMs");
        if (splits != null && splits.length() > 0) {
            LinearLayout splitCard = card(); splitCard.addView(text("1km 구간", 15, TEXT, true));
            for (int i = 0; i < splits.length(); i++) splitCard.addView(kv((i + 1) + " km", formatClock(splits.optLong(i, 0))));
            page.addView(splitCard, cardParams());
        }
    }

    private void startWalking(String kmText, String minText) {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED ||
                (Build.VERSION.SDK_INT >= 29 && checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED)) {
            if (Build.VERSION.SDK_INT >= 29) requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACTIVITY_RECOGNITION}, REQ_ACTIVITY);
            else requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, REQ_ACTIVITY);
            Toast.makeText(this, "위치와 활동 권한을 허용한 뒤 시작 버튼을 다시 눌러주세요.", Toast.LENGTH_LONG).show();
            return;
        }
        double km = parseDouble(kmText); long minutes = Math.round(parseDouble(minText));
        Intent i = new Intent(this, WalkingRecorderService.class).setAction(WalkingRecorderService.ACTION_START)
                .putExtra("goal_distance_m", Math.max(0, Math.round(km * 1000.0)))
                .putExtra("goal_time_ms", Math.max(0, minutes * 60_000L));
        try {
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
            Toast.makeText(this, "걷기 기록을 시작합니다. 화면을 꺼도 GPS 기록은 계속됩니다.", Toast.LENGTH_LONG).show();
            handler.postDelayed(this::showHome, 500);
        } catch (Exception e) { Toast.makeText(this, "걷기 기록 시작 실패: " + e.getMessage(), Toast.LENGTH_LONG).show(); }
    }

    private void togglePause() {
        boolean paused = runtime.getBoolean(WalkingRecorderService.KEY_PAUSED, false);
        startService(new Intent(this, WalkingRecorderService.class).setAction(paused ? WalkingRecorderService.ACTION_RESUME : WalkingRecorderService.ACTION_PAUSE));
        handler.postDelayed(this::showHome, 250);
    }

    private void stopWalking() {
        startService(new Intent(this, WalkingRecorderService.class).setAction(WalkingRecorderService.ACTION_STOP));
        Toast.makeText(this, "걷기 기록을 저장합니다.", Toast.LENGTH_SHORT).show();
        handler.postDelayed(this::showHome, 700);
    }

    private EditText numberField(String hint) {
        EditText e = new EditText(this); e.setHint(hint); e.setTextColor(TEXT); e.setHintTextColor(MUTED); e.setTextSize(13); e.setSingleLine(true);
        e.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL); e.setPadding(dp(11), 0, dp(11), 0); e.setBackground(round(CARD2, 12, 1, 0xFF35445F)); return e;
    }

    private TextView metricValue(String value) { TextView v = text(value, 16, TEXT, true); v.setGravity(Gravity.CENTER); return v; }
    private View metricBox(String label, TextView value) { LinearLayout b = new LinearLayout(this); b.setOrientation(LinearLayout.VERTICAL); b.setGravity(Gravity.CENTER); b.addView(value); TextView l = text(label, 10, MUTED, false); l.setGravity(Gravity.CENTER); b.addView(l); return b; }
    private View kv(String key, String value) { LinearLayout r = new LinearLayout(this); r.setOrientation(LinearLayout.HORIZONTAL); r.setPadding(0, dp(9), 0, 0); TextView k = text(key, 12, MUTED, false); TextView v = text(value, 13, TEXT, true); v.setGravity(Gravity.RIGHT); r.addView(k, new LinearLayout.LayoutParams(0, dp(27), 1f)); r.addView(v, new LinearLayout.LayoutParams(0, dp(27), 1f)); return r; }

    private LinearLayout page() { LinearLayout p = new LinearLayout(this); p.setOrientation(LinearLayout.VERTICAL); p.setPadding(dp(18), dp(18), dp(18), dp(30)); p.setBackgroundColor(BG); return p; }
    private LinearLayout card() { LinearLayout v = new LinearLayout(this); v.setOrientation(LinearLayout.VERTICAL); v.setPadding(dp(16), dp(15), dp(16), dp(15)); v.setBackground(round(CARD, 18, 0, 0)); return v; }
    private TextView navItem(String label, int color, View.OnClickListener click) { TextView v = text(label, 12, color, true); v.setGravity(Gravity.CENTER); v.setOnClickListener(click); return v; }
    private TextView text(String s, int sp, int color, boolean bold) { TextView v = new TextView(this); v.setText(s); v.setTextSize(sp); v.setTextColor(color); if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD); v.setLineSpacing(0, 1.08f); return v; }
    private Button actionButton(String s, boolean primary, View.OnClickListener click) { Button b = new Button(this); b.setText(s); b.setAllCaps(false); b.setTextSize(14); b.setTypeface(Typeface.DEFAULT, Typeface.BOLD); b.setTextColor(Color.WHITE); b.setBackground(round(primary ? PRIMARY : 0xFF33425B, 16, 0, 0)); b.setOnClickListener(click); return b; }
    private Button ghostButton(String s, View.OnClickListener click) { Button b = new Button(this); b.setText(s); b.setAllCaps(false); b.setTextSize(13); b.setTextColor(TEXT); b.setBackground(round(CARD2, 13, 1, 0xFF35445F)); b.setOnClickListener(click); return b; }
    private GradientDrawable round(int color, int radiusDp, int strokeDp, int strokeColor) { GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(radiusDp)); if (strokeDp > 0) g.setStroke(dp(strokeDp), strokeColor); return g; }
    private LinearLayout.LayoutParams cardParams() { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); p.bottomMargin = dp(12); return p; }
    private LinearLayout.LayoutParams cardParamsCompact() { LinearLayout.LayoutParams p = cardParams(); p.bottomMargin = dp(8); return p; }
    private LinearLayout.LayoutParams match(int h) { return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, h); }
    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    private static double parseDouble(String s) { try { return s == null || s.trim().isEmpty() ? 0 : Double.parseDouble(s.trim()); } catch (Exception e) { return 0; } }

    private static String formatClock(long ms) {
        long s = Math.max(0, ms / 1000), h = s / 3600, m = (s % 3600) / 60, sec = s % 60;
        return h > 0 ? String.format(Locale.KOREAN, "%d:%02d:%02d", h, m, sec) : String.format(Locale.KOREAN, "%02d:%02d", m, sec);
    }

    private static String formatPace(long movingMs, long distanceM) {
        if (distanceM < 100 || movingMs <= 0) return "--'--\"/km";
        double secPerKm = (movingMs / 1000.0) / (distanceM / 1000.0);
        if (secPerKm > 60 * 60) return "--'--\"/km";
        int min = (int) (secPerKm / 60); int sec = (int) Math.round(secPerKm - min * 60);
        if (sec >= 60) { min++; sec = 0; }
        return String.format(Locale.KOREAN, "%d'%02d\"/km", min, sec);
    }
}
