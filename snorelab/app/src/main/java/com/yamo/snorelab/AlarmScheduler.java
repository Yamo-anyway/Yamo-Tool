package com.yamo.snorelab;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

public final class AlarmScheduler {
    private static final String RUNTIME_PREFS = "snorelab_alarm_runtime_v1";
    private static final DateTimeFormatter DATE = DateTimeFormatter.ISO_LOCAL_DATE;

    private AlarmScheduler() {}

    private static int baseCode(long id) {
        return (int) ((id ^ (id >>> 32)) & 0x3fffffff);
    }

    public static boolean canScheduleExact(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return false;
        return Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
    }

    public static long nextTriggerMillis(AlarmStore.Item item, long afterMillis) {
        ZoneId zone = ZoneId.systemDefault();
        ZonedDateTime now = Instant.ofEpochMilli(afterMillis).atZone(zone);
        boolean repeats = item.repeats();
        for (int add = 0; add < 15; add++) {
            LocalDate date = now.toLocalDate().plusDays(add);
            int mondayIndex = date.getDayOfWeek().getValue() - DayOfWeek.MONDAY.getValue();
            if (mondayIndex < 0) mondayIndex += 7;
            if (repeats && !item.days[mondayIndex]) continue;
            ZonedDateTime candidate = date.atTime(item.hour, item.minute).atZone(zone);
            if (candidate.toInstant().toEpochMilli() <= afterMillis + 500) continue;
            if (!item.skipDate.isEmpty() && item.skipDate.equals(DATE.format(date))) continue;
            return candidate.toInstant().toEpochMilli();
        }
        return 0L;
    }

    public static boolean scheduleNext(Context context, AlarmStore.Item item) {
        cancelRegular(context, item.id);
        if (!item.enabled) return true;
        long trigger = nextTriggerMillis(item, System.currentTimeMillis());
        if (trigger <= 0) return false;
        return scheduleExact(context, regularPendingIntent(context, item.id), trigger, item.id);
    }

    public static boolean scheduleRetry(Context context, AlarmStore.Item item) {
        if (item.retryCount == 0) return true;
        long trigger = System.currentTimeMillis() + Math.max(1, item.retryMinutes) * 60_000L;
        return scheduleExact(context, retryPendingIntent(context, item.id), trigger, item.id);
    }

    public static boolean scheduleSnooze(Context context, long id, int minutes) {
        cancelSnooze(context, id);
        markActive(context, id, true, retryAttempt(context, id));
        long trigger = System.currentTimeMillis() + Math.max(1, minutes) * 60_000L;
        return scheduleExact(context, snoozePendingIntent(context, id), trigger, id);
    }

    private static boolean scheduleExact(Context context, PendingIntent operation, long trigger, long itemId) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null || !canScheduleExact(context)) return false;
        Intent show = new Intent(context, AlarmActivity.class).putExtra("alarm_id", itemId);
        PendingIntent showPi = PendingIntent.getActivity(context, baseCode(itemId) + 7000, show,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(trigger, showPi);
            am.setAlarmClock(info, operation);
            return true;
        } catch (SecurityException e) {
            return false;
        }
    }

    private static PendingIntent regularPendingIntent(Context context, long id) {
        Intent i = new Intent(context, AlarmReceiver.class).setAction(AlarmReceiver.ACTION_FIRE).putExtra("alarm_id", id);
        return PendingIntent.getBroadcast(context, baseCode(id), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent retryPendingIntent(Context context, long id) {
        Intent i = new Intent(context, AlarmReceiver.class).setAction(AlarmReceiver.ACTION_RETRY).putExtra("alarm_id", id);
        return PendingIntent.getBroadcast(context, baseCode(id) + 1, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent snoozePendingIntent(Context context, long id) {
        Intent i = new Intent(context, AlarmReceiver.class).setAction(AlarmReceiver.ACTION_SNOOZE).putExtra("alarm_id", id);
        return PendingIntent.getBroadcast(context, baseCode(id) + 2, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    public static void cancelAll(Context context, long id) {
        cancelRegular(context, id);
        cancelRetry(context, id);
        cancelSnooze(context, id);
        markActive(context, id, false, 0);
    }

    public static void cancelRegular(Context context, long id) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(regularPendingIntent(context, id));
    }

    public static void cancelRetry(Context context, long id) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(retryPendingIntent(context, id));
    }

    public static void cancelSnooze(Context context, long id) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(snoozePendingIntent(context, id));
    }

    public static void markActive(Context context, long id, boolean active, int retryAttempt) {
        context.getSharedPreferences(RUNTIME_PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean("active_" + id, active)
                .putInt("attempt_" + id, retryAttempt)
                .apply();
    }

    public static boolean isActive(Context context, long id) {
        return context.getSharedPreferences(RUNTIME_PREFS, Context.MODE_PRIVATE)
                .getBoolean("active_" + id, false);
    }

    public static int retryAttempt(Context context, long id) {
        return context.getSharedPreferences(RUNTIME_PREFS, Context.MODE_PRIVATE)
                .getInt("attempt_" + id, 0);
    }

    public static void dismiss(Context context, long id) {
        cancelRetry(context, id);
        cancelSnooze(context, id);
        markActive(context, id, false, 0);
        context.stopService(new Intent(context, AlarmRingService.class));
    }

    public static String nextDateText(AlarmStore.Item item) {
        long ms = nextTriggerMillis(item, System.currentTimeMillis());
        if (ms <= 0) return "예약 없음";
        ZonedDateTime z = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault());
        return z.format(DateTimeFormatter.ofPattern("M월 d일 (E) HH:mm"));
    }
}
