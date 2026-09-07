package com.yamo.snorelab;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.util.Locale;

public class AlarmRingActivity extends Activity implements SensorEventListener {
    private static final int BG = 0xFF071712;
    private static final int TEXT = 0xFFF3FFFB;
    private static final int MUTED = 0xFFA5C4B9;
    private static final int MINT = 0xFF66E1C5;
    private static final int CARD = 0xFF102821;
    private static final int DANGER = 0xFFFF7182;

    private long alarmId;
    private AlarmStore.Item item;
    private SensorManager sensorManager;
    private Sensor accelerometer;
    private int shakeCount;
    private long firstShakeAt;
    private long lastShakeAt;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);

        alarmId = getIntent().getLongExtra("alarm_id", -1L);
        item = AlarmStore.find(this, alarmId);
        if (item == null) { finish(); return; }

        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        accelerometer = sensorManager == null ? null : sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        buildUi();
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(26), dp(72), dp(26), dp(34));
        root.setBackgroundColor(BG);

        TextView tag = text("꿀잠 Lab · 알람", 14, MINT, true);
        tag.setGravity(Gravity.CENTER);
        root.addView(tag, matchWrap());

        TextView time = text(String.format(Locale.KOREAN, "%02d:%02d", item.hour, item.minute), 68, TEXT, true);
        time.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tp = matchWrap(); tp.topMargin = dp(34);
        root.addView(time, tp);

        TextView label = text(item.label, 22, TEXT, true);
        label.setGravity(Gravity.CENTER);
        label.setPadding(dp(8), dp(15), dp(8), dp(14));
        root.addView(label, matchWrap());

        String method = "TTS".equals(item.alertMode) ? "🗣 텍스트 읽기" : "🔔 알람음";
        TextView methodView = text(method, 14, MINT, true);
        methodView.setGravity(Gravity.CENTER);
        root.addView(methodView, matchWrap());

        if ("TTS".equals(item.alertMode) && item.speechText != null && !item.speechText.trim().isEmpty()) {
            TextView speech = text("“" + item.speechText.trim() + "”", 14, MUTED, false);
            speech.setGravity(Gravity.CENTER);
            speech.setPadding(dp(10), dp(10), dp(10), 0);
            root.addView(speech, matchWrap());
        }

        TextView meta = text(retryText(item), 12, MUTED, false);
        meta.setGravity(Gravity.CENTER);
        meta.setPadding(0, dp(10), 0, 0);
        root.addView(meta, matchWrap());

        TextView spacer = new TextView(this);
        root.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1f));

        if (item.shakeToStop) {
            TextView shake = text("📱 강하게 " + item.shakeCount + "번 흔들어도 종료됩니다", 14, MINT, true);
            shake.setGravity(Gravity.CENTER);
            shake.setPadding(0, 0, 0, dp(18));
            root.addView(shake, matchWrap());
        }

        Button snooze = button("😴  5분 후 다시", CARD, TEXT);
        snooze.setOnClickListener(v -> snooze());
        root.addView(snooze, match(dp(56)));

        Button stop = button("■  알람 종료", MINT, 0xFF06251D);
        LinearLayout.LayoutParams sp = match(dp(64)); sp.topMargin = dp(12);
        root.addView(stop, sp);
        stop.setOnClickListener(v -> dismissAlarm());

        setContentView(root);
    }

    private String retryText(AlarmStore.Item a) {
        if (a.retryCount == 0) return "놓친 알람 반복 없음";
        if (a.retryCount < 0) return a.retryMinutes + "분 간격 · 종료할 때까지 반복";
        return a.retryMinutes + "분 간격 · 최대 " + a.retryCount + "회 재알림";
    }

    private void snooze() {
        AlarmScheduler.cancelRetry(this, alarmId);
        if (AlarmScheduler.scheduleSnooze(this, alarmId, 5)) {
            stopService(new Intent(this, AlarmRingService.class));
            Toast.makeText(this, "5분 후 다시 울립니다.", Toast.LENGTH_SHORT).show();
            finishAndRemoveTask();
        } else {
            Toast.makeText(this, "정확한 알람 권한을 확인해주세요.", Toast.LENGTH_LONG).show();
        }
    }

    private void dismissAlarm() {
        AlarmScheduler.dismiss(this, alarmId);
        finishAndRemoveTask();
    }

    @Override protected void onResume() {
        super.onResume();
        if (item != null && item.shakeToStop && sensorManager != null && accelerometer != null) {
            sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME);
        }
    }

    @Override protected void onPause() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        super.onPause();
    }

    @Override public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_ACCELEROMETER || !item.shakeToStop) return;
        float x = event.values[0], y = event.values[1], z = event.values[2];
        double magnitude = Math.sqrt(x * x + y * y + z * z);
        if (magnitude < 18.5) return;
        long now = System.currentTimeMillis();
        if (now - lastShakeAt < 280) return;
        if (firstShakeAt == 0 || now - firstShakeAt > Math.max(3000L, item.shakeCount * 850L)) {
            firstShakeAt = now;
            shakeCount = 1;
        } else {
            shakeCount++;
        }
        lastShakeAt = now;
        if (shakeCount >= Math.max(3, Math.min(10, item.shakeCount))) {
            Toast.makeText(this, "흔들기 감지 · 알람 종료", Toast.LENGTH_SHORT).show();
            dismissAlarm();
        }
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override public void onBackPressed() {
        // Back cannot silently dismiss an alarm. Use the visible stop control or optional shake action.
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView v = new TextView(this);
        v.setText(s); v.setTextSize(sp); v.setTextColor(color);
        if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return v;
    }

    private Button button(String s, int bg, int fg) {
        Button b = new Button(this);
        b.setText(s); b.setAllCaps(false); b.setTextSize(16); b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setTextColor(fg); b.setBackgroundColor(bg);
        return b;
    }

    private LinearLayout.LayoutParams match(int h) { return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, h); }
    private LinearLayout.LayoutParams matchWrap() { return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); }
    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
