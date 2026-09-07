package com.yamo.snorelab;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class WalkingRecorderService extends Service implements SensorEventListener {
    public static final String ACTION_START = "com.yamo.snorelab.WALK_START";
    public static final String ACTION_PAUSE = "com.yamo.snorelab.WALK_PAUSE";
    public static final String ACTION_RESUME = "com.yamo.snorelab.WALK_RESUME";
    public static final String ACTION_STOP = "com.yamo.snorelab.WALK_STOP";

    public static final String PREFS = "snorelab_walking_runtime_v1";
    public static final String KEY_RECORDING = "recording";
    public static final String KEY_PAUSED = "paused";
    public static final String KEY_START_MS = "start_ms";
    public static final String KEY_ELAPSED_MS = "elapsed_ms";
    public static final String KEY_MOVING_MS = "moving_ms";
    public static final String KEY_DISTANCE_M = "distance_m";
    public static final String KEY_STEPS = "steps";
    public static final String KEY_STEP_AVAILABLE = "step_available";
    public static final String KEY_CURRENT_SPEED_KMH = "current_speed_kmh";
    public static final String KEY_MAX_SPEED_KMH = "max_speed_kmh";
    public static final String KEY_ALTITUDE_M = "altitude_m";
    public static final String KEY_ACCURACY_M = "accuracy_m";
    public static final String KEY_SESSION_DIR = "session_dir";
    public static final String KEY_GOAL_DISTANCE_M = "goal_distance_m";
    public static final String KEY_GOAL_TIME_MS = "goal_time_ms";
    public static final String KEY_GOAL_STATE = "goal_state";

    private static final String CHANNEL_RECORDING = "walking_recording_v1";
    private static final String CHANNEL_GOAL = "walking_goal_v1";
    private static final int NOTIFY_RECORDING = 5101;
    private static final int NOTIFY_GOAL = 5102;

    private SharedPreferences runtime;
    private LocationManager locationManager;
    private LocationListener locationListener;
    private SensorManager sensorManager;
    private Sensor stepCounter;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private long startMs;
    private long pausedAccumMs;
    private long pauseStartedMs;
    private long movingMs;
    private double distanceM;
    private long steps;
    private float stepBase = -1f;
    private boolean stepAvailable;
    private boolean recording;
    private boolean paused;
    private float currentSpeedKmh;
    private float maxSpeedKmh;
    private double altitudeM = Double.NaN;
    private float accuracyM = Float.NaN;
    private Location lastAccepted;
    private long lastAcceptedTime;
    private long lastWrittenTime;
    private File sessionDir;
    private long goalDistanceM;
    private long goalTimeMs;
    private String goalState = "ACTIVE";
    private boolean goalNotified;
    private long nextSplitM = 1000;
    private long lastSplitMovingMs;
    private final List<Long> splitsMs = new ArrayList<>();

    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (!recording) return;
            persistRuntime();
            checkGoal();
            updateForegroundNotification();
            handler.postDelayed(this, 1000);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        runtime = getSharedPreferences(PREFS, MODE_PRIVATE);
        createChannels();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        if (ACTION_START.equals(action)) begin(intent);
        else if (ACTION_PAUSE.equals(action)) pauseRecording();
        else if (ACTION_RESUME.equals(action)) resumeRecording();
        else if (ACTION_STOP.equals(action)) finishRecording();
        return START_NOT_STICKY;
    }

    private void begin(Intent intent) {
        if (recording || runtime.getBoolean(KEY_RECORDING, false)) return;
        startMs = System.currentTimeMillis();
        goalDistanceM = Math.max(0, intent.getLongExtra("goal_distance_m", 0));
        goalTimeMs = Math.max(0, intent.getLongExtra("goal_time_ms", 0));
        sessionDir = WalkingStore.createSession(this, startMs);
        recording = true;
        paused = false;
        goalState = "ACTIVE";

        Notification n = buildRecordingNotification("걷기 기록을 시작합니다");
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFY_RECORDING, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        else startForeground(NOTIFY_RECORDING, n);

        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            goalState = "ERROR";
            finishRecording();
            return;
        }

        startLocation();
        startSteps();
        persistRuntime();
        writeMeta("recording", 0L);
        handler.removeCallbacks(ticker);
        handler.post(ticker);
    }

    private void startLocation() {
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) return;
        locationListener = this::onLocationChanged;
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 1f, locationListener, Looper.getMainLooper());
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 3000L, 3f, locationListener, Looper.getMainLooper());
            }
        } catch (SecurityException ignored) {}
    }

    private void startSteps() {
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager == null) return;
        stepCounter = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        stepAvailable = stepCounter != null;
        if (stepCounter != null) {
            try { sensorManager.registerListener(this, stepCounter, SensorManager.SENSOR_DELAY_NORMAL); }
            catch (Exception ignored) { stepAvailable = false; }
        }
    }

    private void onLocationChanged(Location loc) {
        if (!recording || paused || loc == null) return;
        if (loc.hasAccuracy() && loc.getAccuracy() > 50f) return;
        long now = loc.getTime() > 0 ? loc.getTime() : System.currentTimeMillis();
        accuracyM = loc.hasAccuracy() ? loc.getAccuracy() : Float.NaN;
        if (loc.hasAltitude()) altitudeM = loc.getAltitude();

        if (lastAccepted == null) {
            lastAccepted = new Location(loc);
            lastAcceptedTime = now;
            WalkingStore.appendRoute(sessionDir, now, loc.getLatitude(), loc.getLongitude(), accuracyM,
                    Double.isNaN(altitudeM) ? 0 : altitudeM, 0f);
            lastWrittenTime = now;
            persistRuntime();
            return;
        }

        long dtMs = Math.max(1, now - lastAcceptedTime);
        float d = lastAccepted.distanceTo(loc);
        float derivedMps = d / (dtMs / 1000f);

        // 걷기 모드에서 현실적으로 불가능한 순간이동은 GPS 튐으로 제거한다.
        if (derivedMps > 7.0f && d > 12f) return;

        if (d >= 2.0f) {
            distanceM += d;
            currentSpeedKmh = Math.max(0, derivedMps * 3.6f);
            if (currentSpeedKmh > maxSpeedKmh && currentSpeedKmh < 25.2f) maxSpeedKmh = currentSpeedKmh;
            if (derivedMps >= 0.40f && derivedMps <= 4.5f) movingMs += dtMs;

            while (distanceM >= nextSplitM) {
                long split = Math.max(0, movingMs - lastSplitMovingMs);
                splitsMs.add(split);
                lastSplitMovingMs = movingMs;
                nextSplitM += 1000;
            }

            lastAccepted = new Location(loc);
            lastAcceptedTime = now;
            WalkingStore.appendRoute(sessionDir, now, loc.getLatitude(), loc.getLongitude(), accuracyM,
                    Double.isNaN(altitudeM) ? 0 : altitudeM, derivedMps);
            lastWrittenTime = now;
        } else if (now - lastWrittenTime >= 10_000L) {
            currentSpeedKmh = 0;
            WalkingStore.appendRoute(sessionDir, now, loc.getLatitude(), loc.getLongitude(), accuracyM,
                    Double.isNaN(altitudeM) ? 0 : altitudeM, 0f);
            lastWrittenTime = now;
        } else {
            currentSpeedKmh = 0;
        }
        persistRuntime();
        checkGoal();
    }

    @Override public void onSensorChanged(SensorEvent event) {
        if (!recording || event == null || event.sensor == null || event.sensor.getType() != Sensor.TYPE_STEP_COUNTER) return;
        float current = event.values.length > 0 ? event.values[0] : 0f;
        if (stepBase < 0) stepBase = current;
        steps = Math.max(0, Math.round(current - stepBase));
        persistRuntime();
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    private void pauseRecording() {
        if (!recording || paused) return;
        paused = true;
        pauseStartedMs = System.currentTimeMillis();
        currentSpeedKmh = 0;
        persistRuntime();
        updateForegroundNotification();
    }

    private void resumeRecording() {
        if (!recording || !paused) return;
        long now = System.currentTimeMillis();
        pausedAccumMs += Math.max(0, now - pauseStartedMs);
        pauseStartedMs = 0;
        paused = false;
        lastAccepted = null;
        lastAcceptedTime = 0;
        currentSpeedKmh = 0;
        persistRuntime();
        updateForegroundNotification();
    }

    private long elapsedMs() {
        if (!recording || startMs <= 0) return 0;
        long now = System.currentTimeMillis();
        long pausedNow = paused && pauseStartedMs > 0 ? now - pauseStartedMs : 0;
        return Math.max(0, now - startMs - pausedAccumMs - pausedNow);
    }

    private void checkGoal() {
        if (!recording || goalNotified || "ERROR".equals(goalState)) return;
        long elapsed = elapsedMs();
        if (goalDistanceM > 0 && distanceM >= goalDistanceM) {
            if (goalTimeMs <= 0 || elapsed <= goalTimeMs) {
                goalState = "SUCCESS";
                goalNotified = true;
                notifyGoal("걷기 목표 달성", String.format(Locale.KOREAN, "%.2f km 목표를 달성했습니다.", distanceM / 1000.0));
            }
        } else if (goalDistanceM == 0 && goalTimeMs > 0 && elapsed >= goalTimeMs) {
            goalState = "SUCCESS";
            goalNotified = true;
            notifyGoal("걷기 목표 달성", "설정한 활동 시간을 완료했습니다.");
        } else if (goalDistanceM > 0 && goalTimeMs > 0 && elapsed > goalTimeMs) {
            goalState = "TIMEOUT";
            goalNotified = true;
            notifyGoal("목표 시간 종료", String.format(Locale.KOREAN, "현재 %.2f km / 목표 %.2f km", distanceM / 1000.0, goalDistanceM / 1000.0));
        }
        persistRuntime();
    }

    private void notifyGoal(String title, String text) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        Intent open = new Intent(this, ExerciseActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 5102, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_GOAL) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_launcher_foreground).setContentTitle(title).setContentText(text).setContentIntent(pi).setAutoCancel(true);
        nm.notify(NOTIFY_GOAL, b.build());
        try {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v != null) {
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(new long[]{0, 250, 120, 250}, -1));
                else v.vibrate(new long[]{0, 250, 120, 250}, -1);
            }
        } catch (Exception ignored) {}
    }

    private void persistRuntime() {
        if (runtime == null) return;
        runtime.edit()
                .putBoolean(KEY_RECORDING, recording)
                .putBoolean(KEY_PAUSED, paused)
                .putLong(KEY_START_MS, startMs)
                .putLong(KEY_ELAPSED_MS, elapsedMs())
                .putLong(KEY_MOVING_MS, movingMs)
                .putLong(KEY_DISTANCE_M, Math.round(distanceM))
                .putLong(KEY_STEPS, steps)
                .putBoolean(KEY_STEP_AVAILABLE, stepAvailable)
                .putFloat(KEY_CURRENT_SPEED_KMH, currentSpeedKmh)
                .putFloat(KEY_MAX_SPEED_KMH, maxSpeedKmh)
                .putFloat(KEY_ALTITUDE_M, Double.isNaN(altitudeM) ? Float.NaN : (float) altitudeM)
                .putFloat(KEY_ACCURACY_M, accuracyM)
                .putString(KEY_SESSION_DIR, sessionDir == null ? "" : sessionDir.getAbsolutePath())
                .putLong(KEY_GOAL_DISTANCE_M, goalDistanceM)
                .putLong(KEY_GOAL_TIME_MS, goalTimeMs)
                .putString(KEY_GOAL_STATE, goalState)
                .apply();
    }

    private void writeMeta(String status, long endMs) {
        if (sessionDir == null) return;
        try {
            JSONObject m = new JSONObject();
            m.put("type", "walking");
            m.put("status", status);
            m.put("startEpochMs", startMs);
            if (endMs > 0) m.put("endEpochMs", endMs);
            m.put("durationMs", elapsedMs());
            m.put("movingMs", movingMs);
            m.put("distanceM", Math.round(distanceM));
            m.put("steps", steps);
            m.put("stepSensorAvailable", stepAvailable);
            m.put("maxSpeedKmh", maxSpeedKmh);
            m.put("lastAltitudeM", Double.isNaN(altitudeM) ? JSONObject.NULL : altitudeM);
            m.put("goalDistanceM", goalDistanceM);
            m.put("goalTimeMs", goalTimeMs);
            m.put("goalState", goalState);
            m.put("splitsMs", WalkingStore.longListToJson(splitsMs));
            m.put("locationStorage", "local_only");
            WalkingStore.writeMeta(sessionDir, m);
        } catch (Exception ignored) {}
    }

    private void finishRecording() {
        if (!recording && !runtime.getBoolean(KEY_RECORDING, false)) {
            stopSelf();
            return;
        }
        long end = System.currentTimeMillis();
        if (paused && pauseStartedMs > 0) pausedAccumMs += Math.max(0, end - pauseStartedMs);
        paused = false;
        pauseStartedMs = 0;
        persistRuntime();
        writeMeta("complete", end);
        recording = false;
        currentSpeedKmh = 0;
        runtime.edit().putBoolean(KEY_RECORDING, false).putBoolean(KEY_PAUSED, false).putFloat(KEY_CURRENT_SPEED_KMH, 0f).apply();
        handler.removeCallbacks(ticker);
        stopSensors();
        stopForeground(true);
        stopSelf();
    }

    private void stopSensors() {
        if (locationManager != null && locationListener != null) {
            try { locationManager.removeUpdates(locationListener); } catch (Exception ignored) {}
        }
        if (sensorManager != null) {
            try { sensorManager.unregisterListener(this); } catch (Exception ignored) {}
        }
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel rec = new NotificationChannel(CHANNEL_RECORDING, "걷기 기록", NotificationManager.IMPORTANCE_LOW);
        rec.setDescription("화면이 꺼진 동안에도 사용자가 시작한 걷기 GPS 기록을 유지합니다.");
        nm.createNotificationChannel(rec);
        NotificationChannel goal = new NotificationChannel(CHANNEL_GOAL, "활동 목표", NotificationManager.IMPORTANCE_HIGH);
        goal.setDescription("사용자가 설정한 활동 목표 달성 또는 목표 시간 종료를 알려줍니다.");
        goal.enableVibration(true);
        nm.createNotificationChannel(goal);
    }

    private Notification buildRecordingNotification(String message) {
        Intent open = new Intent(this, ExerciseActivity.class);
        PendingIntent openPi = PendingIntent.getActivity(this, 5101, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, WalkingRecorderService.class).setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 5103, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_RECORDING) : new Notification.Builder(this);
        return b.setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(paused ? "걷기 기록 일시정지" : "걷기 기록 중")
                .setContentText(message)
                .setContentIntent(openPi)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(null, "기록 종료", stopPi).build())
                .build();
    }

    private void updateForegroundNotification() {
        if (!recording) return;
        String text = String.format(Locale.KOREAN, "%.2f km · %s · %d걸음", distanceM / 1000.0, formatClock(elapsedMs()), steps);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFY_RECORDING, buildRecordingNotification(text));
    }

    private static String formatClock(long ms) {
        long s = Math.max(0, ms / 1000);
        long h = s / 3600;
        long m = (s % 3600) / 60;
        long sec = s % 60;
        return h > 0 ? String.format(Locale.KOREAN, "%d:%02d:%02d", h, m, sec) : String.format(Locale.KOREAN, "%02d:%02d", m, sec);
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(ticker);
        stopSensors();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
