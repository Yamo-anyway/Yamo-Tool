package com.yamo.snorelab;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public final class WalkingStore {
    private WalkingStore() {}

    public static final class Point {
        public final long timeMs;
        public final double lat;
        public final double lon;
        public final float accuracy;
        public final double altitude;
        public final float speedMps;

        Point(long timeMs, double lat, double lon, float accuracy, double altitude, float speedMps) {
            this.timeMs = timeMs;
            this.lat = lat;
            this.lon = lon;
            this.accuracy = accuracy;
            this.altitude = altitude;
            this.speedMps = speedMps;
        }
    }

    public static File root(Context context) {
        File dir = new File(context.getFilesDir(), "activity/walking");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    public static File createSession(Context context, long startMs) {
        String id = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date(startMs));
        File dir = new File(root(context), id);
        if (!dir.exists()) dir.mkdirs();
        File route = new File(dir, "route.csv");
        if (!route.exists()) {
            try (BufferedWriter w = new BufferedWriter(new FileWriter(route, false))) {
                w.write("time_ms,lat,lon,accuracy_m,altitude_m,speed_mps\n");
            } catch (Exception ignored) {}
        }
        return dir;
    }

    public static void appendRoute(File dir, long timeMs, double lat, double lon, float accuracy, double altitude, float speedMps) {
        if (dir == null) return;
        File route = new File(dir, "route.csv");
        try (BufferedWriter w = new BufferedWriter(new FileWriter(route, true))) {
            w.write(String.format(Locale.US, "%d,%.7f,%.7f,%.1f,%.1f,%.3f\n", timeMs, lat, lon, accuracy, altitude, speedMps));
        } catch (Exception ignored) {}
    }

    public static void writeMeta(File dir, JSONObject meta) {
        if (dir == null || meta == null) return;
        try {
            Files.writeString(new File(dir, "session.json").toPath(), meta.toString(2), StandardCharsets.UTF_8);
        } catch (Exception ignored) {}
    }

    public static JSONObject readMeta(File dir) {
        if (dir == null) return new JSONObject();
        File f = new File(dir, "session.json");
        if (!f.exists()) return new JSONObject();
        try {
            return new JSONObject(Files.readString(f.toPath(), StandardCharsets.UTF_8));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    public static List<File> listSessions(Context context) {
        File[] files = root(context).listFiles(File::isDirectory);
        if (files == null) return new ArrayList<>();
        List<File> out = new ArrayList<>();
        Collections.addAll(out, files);
        out.sort(Comparator.comparing(File::getName).reversed());
        return out;
    }

    public static List<Point> readRoute(File dir, int maxPoints) {
        List<Point> all = new ArrayList<>();
        if (dir == null) return all;
        File route = new File(dir, "route.csv");
        if (!route.exists()) return all;
        try (BufferedReader r = new BufferedReader(new FileReader(route))) {
            String line;
            boolean header = true;
            while ((line = r.readLine()) != null) {
                if (header) { header = false; continue; }
                String[] p = line.split(",");
                if (p.length < 6) continue;
                try {
                    all.add(new Point(Long.parseLong(p[0]), Double.parseDouble(p[1]), Double.parseDouble(p[2]),
                            Float.parseFloat(p[3]), Double.parseDouble(p[4]), Float.parseFloat(p[5])));
                } catch (Exception ignored) {}
            }
        } catch (Exception ignored) {}
        if (maxPoints <= 0 || all.size() <= maxPoints) return all;
        List<Point> sampled = new ArrayList<>();
        double step = (all.size() - 1.0) / (maxPoints - 1.0);
        for (int i = 0; i < maxPoints; i++) sampled.add(all.get((int) Math.round(i * step)));
        return sampled;
    }

    public static JSONArray longListToJson(List<Long> values) {
        JSONArray a = new JSONArray();
        for (Long v : values) a.put(v == null ? 0 : v);
        return a;
    }

    public static long recordedStepsToday(Context context) {
        String today = new SimpleDateFormat("yyyyMMdd", Locale.US).format(new Date());
        long sum = 0;
        for (File dir : listSessions(context)) {
            if (!dir.getName().startsWith(today)) continue;
            JSONObject m = readMeta(dir);
            sum += Math.max(0, m.optLong("steps", 0));
        }
        return sum;
    }
}
