package com.yamo.snorelab;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class AlarmReceiver extends BroadcastReceiver {
    public static final String ACTION_FIRE = "com.yamo.snorelab.ALARM_FIRE";
    public static final String ACTION_RETRY = "com.yamo.snorelab.ALARM_RETRY";
    public static final String ACTION_STOP = "com.yamo.snorelab.ALARM_STOP";

    @Override public void onReceive(Context context, Intent intent) {
        long id = intent.getLongExtra("alarm_id", -1L);
        if (id < 0) return;

        if (ACTION_STOP.equals(intent.getAction())) {
            AlarmScheduler.dismiss(context, id);
            return;
        }

        AlarmStore.Item item = AlarmStore.find(context, id);
        if (item == null) return;

        if (ACTION_FIRE.equals(intent.getAction())) {
            if (!item.enabled) return;
            AlarmScheduler.markActive(context, id, true, 0);

            if (item.repeats()) {
                AlarmScheduler.scheduleNext(context, item);
            } else {
                item.enabled = false;
                AlarmStore.save(context, item);
            }

            if (item.retryCount != 0) AlarmScheduler.scheduleRetry(context, item);
            startRinging(context, id);
            return;
        }

        if (ACTION_RETRY.equals(intent.getAction())) {
            if (!AlarmScheduler.isActive(context, id)) return;
            int attempt = AlarmScheduler.retryAttempt(context, id) + 1;
            if (item.retryCount >= 0 && attempt > item.retryCount) {
                AlarmScheduler.markActive(context, id, false, attempt);
                return;
            }
            AlarmScheduler.markActive(context, id, true, attempt);
            startRinging(context, id);
            if (item.retryCount < 0 || attempt < item.retryCount) AlarmScheduler.scheduleRetry(context, item);
        }
    }

    private void startRinging(Context context, long id) {
        Intent service = new Intent(context, AlarmRingService.class).setAction(AlarmRingService.ACTION_START).putExtra("alarm_id", id);
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(service);
        else context.startService(service);
    }
}
