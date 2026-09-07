package com.yamo.snorelab;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public final class AlarmStore {
    private static final String PREFS = "snorelab_alarm_store_v1";
    private static final String KEY = "alarms";

    private AlarmStore() {}

    public static final class Item {
        public long id = System.currentTimeMillis();
        public int hour = 7;
        public int minute = 0;
        public String label = "알람";
        public boolean enabled = true;
        // Monday=0 ... Sunday=6. No selected day means one-time alarm.
        public final boolean[] days = new boolean[7];
        public String skipDate = "";
        public int retryMinutes = 5;
        public int retryCount = 3;

        // Exactly one wake method is active: SOUND or TTS.
        public String alertMode = "SOUND";
        public String soundStyle = "STRONG";
        public String speechText = "일어날 시간입니다";
        public String voiceStyle = "FEMALE";

        // Shake is an optional additional dismiss method. The visible stop button always remains.
        public boolean shakeToStop = false;
        public int shakeCount = 3;

        JSONObject toJson() throws Exception {
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("hour", hour);
            o.put("minute", minute);
            o.put("label", label);
            o.put("enabled", enabled);
            JSONArray d = new JSONArray();
            for (boolean day : days) d.put(day);
            o.put("days", d);
            o.put("skipDate", skipDate);
            o.put("retryMinutes", retryMinutes);
            o.put("retryCount", retryCount);
            o.put("alertMode", alertMode);
            o.put("soundStyle", soundStyle);
            o.put("speechText", speechText);
            o.put("voiceStyle", voiceStyle);
            o.put("shakeToStop", shakeToStop);
            o.put("shakeCount", shakeCount);
            // Kept only for compatibility with V0.2/V0.3 stored records.
            o.put("ttsEnabled", "TTS".equals(alertMode));
            return o;
        }

        static Item fromJson(JSONObject o) {
            Item a = new Item();
            a.id = o.optLong("id", System.currentTimeMillis());
            a.hour = clamp(o.optInt("hour", 7), 0, 23);
            a.minute = clamp(o.optInt("minute", 0), 0, 59);
            a.label = o.optString("label", "알람");
            a.enabled = o.optBoolean("enabled", true);
            JSONArray d = o.optJSONArray("days");
            if (d != null) for (int i = 0; i < Math.min(7, d.length()); i++) a.days[i] = d.optBoolean(i, false);
            a.skipDate = o.optString("skipDate", "");
            a.retryMinutes = Math.max(1, o.optInt("retryMinutes", 5));
            a.retryCount = o.optInt("retryCount", 3);

            // Old versions could play sound + TTS together. For migration we keep the audible alarm safely as SOUND.
            a.alertMode = o.has("alertMode") ? o.optString("alertMode", "SOUND") : "SOUND";
            if (!"TTS".equals(a.alertMode)) a.alertMode = "SOUND";
            a.soundStyle = o.optString("soundStyle", "STRONG");
            a.speechText = o.optString("speechText", o.optString("label", "일어날 시간입니다"));
            a.voiceStyle = o.optString("voiceStyle", "FEMALE");
            a.shakeToStop = o.optBoolean("shakeToStop", false);
            a.shakeCount = clamp(o.optInt("shakeCount", 3), 3, 10);
            return a;
        }

        public boolean repeats() {
            for (boolean day : days) if (day) return true;
            return false;
        }
    }

    public static synchronized List<Item> load(Context context) {
        ArrayList<Item> out = new ArrayList<>();
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]");
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o != null) out.add(Item.fromJson(o));
            }
        } catch (Exception ignored) {}
        Collections.sort(out, Comparator.comparingInt((Item a) -> a.hour).thenComparingInt(a -> a.minute));
        return out;
    }

    public static synchronized Item find(Context context, long id) {
        for (Item a : load(context)) if (a.id == id) return a;
        return null;
    }

    public static synchronized void save(Context context, Item item) {
        List<Item> list = load(context);
        boolean replaced = false;
        for (int i = 0; i < list.size(); i++) {
            if (list.get(i).id == item.id) { list.set(i, item); replaced = true; break; }
        }
        if (!replaced) list.add(item);
        write(context, list);
    }

    public static synchronized void delete(Context context, long id) {
        List<Item> list = load(context);
        list.removeIf(a -> a.id == id);
        write(context, list);
    }

    private static void write(Context context, List<Item> list) {
        JSONArray arr = new JSONArray();
        try { for (Item a : list) arr.put(a.toJson()); } catch (Exception ignored) {}
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        p.edit().putString(KEY, arr.toString()).apply();
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
