package com.yamo.snorelab;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class AlarmRingService extends Service {
    public static final String ACTION_START = "com.yamo.snorelab.ALARM_RING_START";
    public static final String ACTION_STOP = "com.yamo.snorelab.ALARM_RING_STOP";
    private static final String CHANNEL = "snorelab_alarm_v1";
    private static final int NOTIFICATION_ID = 7711;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private AudioTrack audioTrack;
    private TextToSpeech tts;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private long alarmId = -1L;
    private AlarmStore.Item item;
    private boolean ringing;

    private final Runnable autoStop = () -> stopRinging(false);
    private final Runnable speechLoop = new Runnable() {
        @Override public void run() {
            if (!ringing || item == null || !item.ttsEnabled || tts == null) return;
            try { if (audioTrack != null) audioTrack.pause(); } catch (Exception ignored) {}
            speakLabel(item.label);
            long hold = Math.min(10_000L, Math.max(3_000L, item.label.length() * 180L));
            handler.postDelayed(() -> {
                if (!ringing) return;
                try { if (audioTrack != null) audioTrack.play(); } catch (Exception ignored) {}
            }, hold);
            handler.postDelayed(this, Math.max(12_000L, hold + 6_000L));
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            long id = intent.getLongExtra("alarm_id", alarmId);
            if (id >= 0) AlarmScheduler.dismiss(this, id);
            stopRinging(true);
            return START_NOT_STICKY;
        }
        alarmId = intent == null ? -1L : intent.getLongExtra("alarm_id", -1L);
        item = AlarmStore.find(this, alarmId);
        if (item == null) { stopSelf(); return START_NOT_STICKY; }

        startForeground(NOTIFICATION_ID, buildNotification(item));
        beginRinging();
        return START_NOT_STICKY;
    }

    private void beginRinging() {
        stopMediaOnly();
        ringing = true;
        acquireWakeLock();
        startSynthSound(item.soundStyle);
        startVibration();
        startTts();
        handler.removeCallbacks(autoStop);
        handler.postDelayed(autoStop, 60_000L);
    }

    private Notification buildNotification(AlarmStore.Item alarm) {
        Intent full = new Intent(this, AlarmRingActivity.class)
                .putExtra("alarm_id", alarm.id)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent fullPi = PendingIntent.getActivity(this, (int)(alarm.id & 0x3fffffff), full,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, AlarmReceiver.class).setAction(AlarmReceiver.ACTION_STOP).putExtra("alarm_id", alarm.id);
        PendingIntent stopPi = PendingIntent.getBroadcast(this, (int)(alarm.id & 0x3fffffff) + 17, stop,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(String.format(Locale.KOREAN, "%02d:%02d  알람", alarm.hour, alarm.minute))
                .setContentText(alarm.label)
                .setCategory(Notification.CATEGORY_ALARM)
                .setPriority(Notification.PRIORITY_MAX)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(fullPi)
                .setFullScreenIntent(fullPi, true)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "알람 종료", stopPi).build());
        return b.build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "꿀잠 Lab 알람", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("사용자가 설정한 정확 시간 알람");
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setSound(null, null); // app synthesizes its own original alarm tone locally
        ch.enableVibration(false); // service controls vibration pattern
        nm.createNotificationChannel(ch);
    }

    private void startSynthSound(String style) {
        try {
            int sampleRate = 44_100;
            int seconds = 4;
            short[] pcm = new short[sampleRate * seconds];
            for (int i = 0; i < pcm.length; i++) {
                double t = i / (double) sampleRate;
                double amp;
                double hz;
                if ("PULSE".equals(style)) {
                    boolean on = ((int)(t * 8)) % 2 == 0;
                    hz = 1040.0;
                    amp = on ? 0.82 : 0.0;
                } else if ("EXTREME".equals(style)) {
                    int part = ((int)(t * 4)) % 6;
                    hz = part < 2 ? 760.0 : part < 4 ? 1080.0 : 1360.0;
                    amp = ((int)(t * 12)) % 3 == 2 ? 0.35 : 0.92;
                } else {
                    int part = ((int)(t * 2)) % 4;
                    hz = part < 2 ? 880.0 : 1180.0;
                    amp = ((int)(t * 6)) % 3 == 2 ? 0.25 : 0.86;
                }
                double edge = Math.min(1.0, Math.min((t % 0.25) / 0.015, (0.25 - (t % 0.25)) / 0.015));
                if (edge < 0) edge = 0;
                pcm[i] = (short)(Short.MAX_VALUE * amp * edge * Math.sin(2.0 * Math.PI * hz * t));
            }
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
            AudioFormat format = new AudioFormat.Builder()
                    .setSampleRate(sampleRate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build();
            audioTrack = new AudioTrack(attrs, format, pcm.length * 2, AudioTrack.MODE_STATIC, AudioManager.AUDIO_SESSION_ID_GENERATE);
            audioTrack.write(pcm, 0, pcm.length);
            audioTrack.setLoopPoints(0, pcm.length, -1);
            audioTrack.play();
        } catch (Exception ignored) {}
    }

    private void startVibration() {
        try {
            vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (vibrator == null || !vibrator.hasVibrator()) return;
            long[] pattern = {0, 650, 250, 650, 500};
            if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            else vibrator.vibrate(pattern, 0);
        } catch (Exception ignored) {}
    }

    private void startTts() {
        if (!item.ttsEnabled) return;
        tts = new TextToSpeech(getApplicationContext(), status -> {
            if (status != TextToSpeech.SUCCESS || !ringing || item == null) return;
            tts.setSpeechRate(0.95f);
            tts.setPitch("MALE".equals(item.voiceStyle) ? 0.82f : 1.12f);
            handler.postDelayed(speechLoop, 1800L);
        });
    }

    private void speakLabel(String text) {
        if (tts == null || text == null || text.trim().isEmpty()) return;
        List<String> parts = splitLanguageRuns(text.trim());
        tts.stop();
        int idx = 0;
        for (String part : parts) {
            if (containsHangul(part)) tts.setLanguage(Locale.KOREAN);
            else tts.setLanguage(Locale.ENGLISH);
            tts.speak(part, idx == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, "alarm_" + alarmId + "_" + idx);
            idx++;
        }
    }

    private static List<String> splitLanguageRuns(String text) {
        ArrayList<String> out = new ArrayList<>();
        if (text.isEmpty()) return out;
        StringBuilder b = new StringBuilder();
        boolean currentKo = containsHangul(String.valueOf(text.charAt(0)));
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            boolean ko = c >= 0xAC00 && c <= 0xD7A3;
            boolean neutral = Character.isWhitespace(c) || Character.isDigit(c) || ",.!?:;'-/".indexOf(c) >= 0;
            if (!neutral && ko != currentKo && b.length() > 0) {
                out.add(b.toString());
                b.setLength(0);
                currentKo = ko;
            }
            b.append(c);
        }
        if (b.length() > 0) out.add(b.toString());
        return out;
    }

    private static boolean containsHangul(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= 0xAC00 && c <= 0xD7A3) return true;
        }
        return false;
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SnoreLab:AlarmRing");
            wakeLock.acquire(70_000L);
        } catch (Exception ignored) {}
    }

    private void stopMediaOnly() {
        handler.removeCallbacks(speechLoop);
        if (audioTrack != null) {
            try { audioTrack.stop(); } catch (Exception ignored) {}
            try { audioTrack.release(); } catch (Exception ignored) {}
            audioTrack = null;
        }
        if (tts != null) {
            try { tts.stop(); tts.shutdown(); } catch (Exception ignored) {}
            tts = null;
        }
        if (vibrator != null) {
            try { vibrator.cancel(); } catch (Exception ignored) {}
            vibrator = null;
        }
    }

    private void stopRinging(boolean userDismissed) {
        ringing = false;
        handler.removeCallbacks(autoStop);
        handler.removeCallbacks(speechLoop);
        stopMediaOnly();
        if (wakeLock != null && wakeLock.isHeld()) { try { wakeLock.release(); } catch (Exception ignored) {} }
        wakeLock = null;
        stopForeground(true);
        stopSelf();
    }

    @Override public void onDestroy() {
        ringing = false;
        stopMediaOnly();
        if (wakeLock != null && wakeLock.isHeld()) { try { wakeLock.release(); } catch (Exception ignored) {} }
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
