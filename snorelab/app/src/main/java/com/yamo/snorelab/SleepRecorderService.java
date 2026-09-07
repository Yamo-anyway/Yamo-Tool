package com.yamo.snorelab;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import java.io.File;
import java.io.BufferedWriter;
import java.io.FileWriter;
import java.util.Locale;

public class SleepRecorderService extends Service {
    public static final String ACTION_START = "com.yamo.snorelab.START";
    public static final String ACTION_STOP = "com.yamo.snorelab.STOP";
    public static final String PREFS = "snorelab_prefs";
    public static final String KEY_RECORDING = "recording";
    public static final String KEY_SESSION_ID = "active_session_id";
    public static final String KEY_START_MS = "active_start_ms";
    public static final String CHANNEL_ID = "sleep_measurement";

    private static final int NOTIFICATION_ID = 3201;
    private static final int SAMPLE_RATE = 16000;
    private volatile boolean running = false;
    private Thread worker;
    private AudioRecord audioRecord;
    private PowerManager.WakeLock wakeLock;

    @Override public void onCreate() { super.onCreate(); createNotificationChannel(); }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) { running = false; return START_NOT_STICKY; }
        if (running) return START_NOT_STICKY;

        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        running = true;
        worker = new Thread(this::recordLoop, "SnoreLabRecorder");
        worker.start();
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (audioRecord != null) { try { audioRecord.stop(); } catch (Exception ignored) {} }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private void recordLoop() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        long startMs = System.currentTimeMillis();
        File sessionDir = null;
        AacM4aEncoder encoder = null;
        CandidateEventAccumulator accumulator = null;
        BufferedWriter frameWriter = null;
        String finalStatus = "complete";
        String errorText = null;

        int sensitivity = prefs.getInt("sensitivity", 65);
        boolean fullRecording = prefs.getBoolean("developer_full_recording", true);
        boolean saveClips = prefs.getBoolean("save_candidate_clips", true);

        try {
            sessionDir = SessionStore.createSession(this, startMs, SAMPLE_RATE, sensitivity, fullRecording, saveClips);
            prefs.edit().putBoolean(KEY_RECORDING, true).putString(KEY_SESSION_ID, sessionDir.getName())
                    .putLong(KEY_START_MS, startMs).apply();

            acquireWakeLock();
            audioRecord = createAudioRecord();
            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                throw new IllegalStateException("마이크 초기화에 실패했습니다.");
            }
            if (fullRecording) encoder = new AacM4aEncoder(new File(sessionDir, "full.m4a"), SAMPLE_RATE, 32000);

            SnoreDetector detector = new SnoreDetector(sensitivity);
            accumulator = new CandidateEventAccumulator(sessionDir, SAMPLE_RATE, saveClips, 0);
            frameWriter = new BufferedWriter(new FileWriter(new File(sessionDir, "frames.csv")));
            frameWriter.write("offset_ms,dbfs,zero_cross_rate,low_band_ratio,periodicity,score,threshold,candidate\n");

            short[] readBuffer = new short[2048];
            short[] window = new short[SAMPLE_RATE];
            int windowFill = 0;
            long processedWindowSamples = 0;

            audioRecord.startRecording();
            while (running) {
                int n = audioRecord.read(readBuffer, 0, readBuffer.length, AudioRecord.READ_BLOCKING);
                if (n < 0) throw new IllegalStateException("마이크 읽기 오류: " + n);
                if (n == 0) continue;
                if (encoder != null) encoder.encode(readBuffer, n);

                int pos = 0;
                while (pos < n) {
                    int copy = Math.min(n - pos, SAMPLE_RATE - windowFill);
                    System.arraycopy(readBuffer, pos, window, windowFill, copy);
                    windowFill += copy;
                    pos += copy;
                    if (windowFill == SAMPLE_RATE) {
                        short[] oneSecond = window.clone();
                        SnoreDetector.Result result = detector.analyze(oneSecond, SAMPLE_RATE);
                        long offsetMs = processedWindowSamples * 1000L / SAMPLE_RATE;
                        accumulator.onWindow(oneSecond, offsetMs, result);
                        frameWriter.write(String.format(Locale.US, "%d,%.4f,%.6f,%.6f,%.6f,%.3f,%.3f,%d\n",
                                offsetMs, result.dbfs, result.zeroCrossRate, result.lowBandRatio, result.periodicity,
                                result.score, result.threshold, result.candidate ? 1 : 0));
                        if ((processedWindowSamples / SAMPLE_RATE) % 60 == 0) frameWriter.flush();
                        processedWindowSamples += SAMPLE_RATE;
                        windowFill = 0;
                    }
                }
            }
        } catch (SecurityException e) {
            finalStatus = "error";
            errorText = "마이크 권한이 없습니다: " + safeMessage(e);
        } catch (Throwable e) {
            finalStatus = "error";
            errorText = safeMessage(e);
        } finally {
            running = false;
            if (audioRecord != null) {
                try { audioRecord.stop(); } catch (Exception ignored) {}
                try { audioRecord.release(); } catch (Exception ignored) {}
                audioRecord = null;
            }
            if (frameWriter != null) { try { frameWriter.flush(); frameWriter.close(); } catch (Exception ignored) {} }
            if (accumulator != null) {
                try { accumulator.flush(); } catch (Exception e) { if (errorText == null) errorText = "후보 저장 오류: " + safeMessage(e); }
            }
            if (encoder != null) {
                try { encoder.close(); } catch (Exception e) { if (errorText == null) errorText = "전체 녹음 마감 오류: " + safeMessage(e); }
            }
            if (sessionDir != null) {
                try { SessionStore.finishSession(sessionDir, System.currentTimeMillis(), finalStatus, errorText); } catch (Exception ignored) {}
            }
            prefs.edit().putBoolean(KEY_RECORDING, false).remove(KEY_SESSION_ID).remove(KEY_START_MS).apply();
            releaseWakeLock();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
        }
    }

    private AudioRecord createAudioRecord() {
        int source = MediaRecorder.AudioSource.VOICE_RECOGNITION;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            String raw = am == null ? null : am.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED);
            if ("true".equalsIgnoreCase(raw)) source = MediaRecorder.AudioSource.UNPROCESSED;
        }
        int min = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int bufferBytes = Math.max(min * 2, SAMPLE_RATE * 2);
        AudioFormat format = new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(SAMPLE_RATE).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build();
        return new AudioRecord.Builder().setAudioSource(source).setAudioFormat(format).setBufferSizeInBytes(bufferBytes).build();
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent open = PendingIntent.getActivity(this, 1, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stopIntent = new Intent(this, SleepRecorderService.class).setAction(ACTION_STOP);
        PendingIntent stop = PendingIntent.getService(this, 2, stopIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification).setContentTitle("수면 측정 중")
                .setContentText("화면을 꺼도 코골이 검증 측정을 계속합니다.").setContentIntent(open)
                .setOngoing(true).setCategory(Notification.CATEGORY_SERVICE)
                .addAction(new Notification.Action.Builder(null, "측정 종료", stop).build()).build();
    }

    private void createNotificationChannel() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "수면 측정", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("수면 중 마이크 측정이 실행 중임을 표시합니다.");
        nm.createNotificationChannel(channel);
    }

    private void acquireWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SnoreLab::SleepRecorder");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(12 * 60 * 60 * 1000L);
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) { try { wakeLock.release(); } catch (Exception ignored) {} }
        wakeLock = null;
    }

    private static String safeMessage(Throwable e) {
        String m = e.getMessage();
        return m == null || m.isEmpty() ? e.getClass().getSimpleName() : m;
    }
}
