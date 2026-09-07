package com.yamo.snorelab;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public final class SessionStore {
    private SessionStore() {}

    public static File sessionsRoot(Context context) {
        File root = new File(context.getFilesDir(), "sessions");
        if (!root.exists()) root.mkdirs();
        return root;
    }

    public static File createSession(Context context, long startEpochMs, int sampleRate, int sensitivity,
                                     boolean fullRecording, boolean saveCandidateClips) throws Exception {
        String stamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date(startEpochMs));
        String hex = Long.toHexString(startEpochMs);
        String id = stamp + "_" + hex.substring(Math.max(0, hex.length() - 5));
        File dir = new File(sessionsRoot(context), id);
        File clips = new File(dir, "clips");
        if (!clips.mkdirs() && !clips.exists()) throw new IOException("Cannot create session folder");

        JSONObject meta = new JSONObject();
        meta.put("schemaVersion", 1);
        meta.put("id", id);
        meta.put("startEpochMs", startEpochMs);
        meta.put("endEpochMs", JSONObject.NULL);
        meta.put("durationMs", 0);
        meta.put("status", "recording");
        meta.put("sampleRate", sampleRate);
        meta.put("sensitivity", sensitivity);
        meta.put("detectorVersion", SnoreDetector.VERSION);
        meta.put("fullRecording", fullRecording);
        meta.put("saveCandidateClips", saveCandidateClips);
        meta.put("fullAudioFile", fullRecording ? "full.m4a" : JSONObject.NULL);
        meta.put("eventCount", 0);
        meta.put("reviewedCount", 0);
        meta.put("snoreConfirmedCount", 0);
        meta.put("snoreRejectedCount", 0);
        meta.put("uncertainCount", 0);
        writeJson(new File(dir, "session.json"), meta);
        writeJson(new File(dir, "events.json"), new JSONArray());
        return dir;
    }

    public static synchronized void appendEvent(File sessionDir, JSONObject event) throws Exception {
        File file = new File(sessionDir, "events.json");
        JSONArray arr = readArray(file);
        arr.put(event);
        writeJson(file, arr);
        updateCounts(sessionDir, arr);
    }

    public static synchronized void finishSession(File sessionDir, long endEpochMs, String status, String error) throws Exception {
        File file = new File(sessionDir, "session.json");
        JSONObject meta = readObject(file);
        long start = meta.optLong("startEpochMs", endEpochMs);
        meta.put("endEpochMs", endEpochMs);
        meta.put("durationMs", Math.max(0, endEpochMs - start));
        meta.put("status", status);
        if (error != null && !error.isEmpty()) meta.put("error", error);
        writeJson(file, meta);
        updateCounts(sessionDir, readArray(new File(sessionDir, "events.json")));
    }

    public static synchronized void reviewEvent(File sessionDir, int index, String label) throws Exception {
        JSONArray arr = readArray(new File(sessionDir, "events.json"));
        if (index < 0 || index >= arr.length()) return;
        JSONObject event = arr.getJSONObject(index);
        event.put("reviewLabel", label);
        event.put("reviewedAtEpochMs", System.currentTimeMillis());
        writeJson(new File(sessionDir, "events.json"), arr);
        updateCounts(sessionDir, arr);
    }

    private static void updateCounts(File sessionDir, JSONArray arr) throws Exception {
        int reviewed = 0, confirmed = 0, rejected = 0, uncertain = 0;
        long snoreMs = 0;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject e = arr.optJSONObject(i);
            if (e == null) continue;
            String label = e.optString("reviewLabel", "UNREVIEWED");
            if (!"UNREVIEWED".equals(label)) reviewed++;
            if ("SNORE".equals(label)) { confirmed++; snoreMs += e.optLong("durationMs", 0); }
            if ("NOT_SNORE".equals(label)) rejected++;
            if ("UNCERTAIN".equals(label)) uncertain++;
        }
        JSONObject meta = readObject(new File(sessionDir, "session.json"));
        meta.put("eventCount", arr.length());
        meta.put("reviewedCount", reviewed);
        meta.put("snoreConfirmedCount", confirmed);
        meta.put("snoreRejectedCount", rejected);
        meta.put("uncertainCount", uncertain);
        meta.put("confirmedSnoreMs", snoreMs);
        writeJson(new File(sessionDir, "session.json"), meta);
    }

    public static List<File> listSessions(Context context) {
        File[] files = sessionsRoot(context).listFiles(File::isDirectory);
        if (files == null) return Collections.emptyList();
        List<File> list = new ArrayList<>();
        Collections.addAll(list, files);
        list.sort((a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        return list;
    }

    public static JSONObject readMeta(File sessionDir) {
        try { return readObject(new File(sessionDir, "session.json")); }
        catch (Exception e) { return new JSONObject(); }
    }

    public static JSONArray readEvents(File sessionDir) {
        try { return readArray(new File(sessionDir, "events.json")); }
        catch (Exception e) { return new JSONArray(); }
    }

    public static JSONObject readObject(File f) throws Exception { return new JSONObject(readText(f)); }
    public static JSONArray readArray(File f) throws Exception { return new JSONArray(readText(f)); }

    public static String readText(File f) throws IOException {
        if (!f.exists()) return "";
        try (FileInputStream in = new FileInputStream(f);
             java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    public static void writeJson(File f, Object json) throws IOException {
        File temp = new File(f.getParentFile(), f.getName() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(json.toString().getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
        if (f.exists() && !f.delete()) throw new IOException("Cannot replace " + f.getName());
        if (!temp.renameTo(f)) throw new IOException("Cannot rename temp file");
    }

    public static void deleteSession(File dir) { deleteRecursive(dir); }

    public static void deleteAllAudioKeepPatterns(File dir) {
        File full = new File(dir, "full.m4a");
        if (full.exists()) full.delete();
        File clips = new File(dir, "clips");
        deleteRecursive(clips);
        clips.mkdirs();
        try {
            JSONObject meta = readMeta(dir);
            meta.put("audioDeleted", true);
            meta.put("fullAudioFile", JSONObject.NULL);
            writeJson(new File(dir, "session.json"), meta);
        } catch (Exception ignored) {}
    }

    public static void deleteAll(Context context) {
        File root = sessionsRoot(context);
        File[] children = root.listFiles();
        if (children != null) for (File f : children) deleteRecursive(f);
    }

    private static void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] kids = file.listFiles();
            if (kids != null) for (File k : kids) deleteRecursive(k);
        }
        file.delete();
    }

    public static long folderSize(File file) {
        if (file == null || !file.exists()) return 0;
        if (file.isFile()) return file.length();
        long total = 0;
        File[] kids = file.listFiles();
        if (kids != null) for (File k : kids) total += folderSize(k);
        return total;
    }

    public static File createExportZip(Context context, File sessionDir, boolean includeClips, boolean includeFullAudio) throws Exception {
        File out = new File(context.getCacheDir(), sessionDir.getName() + "_snorelab_export.zip");
        try (ZipOutputStream zip = new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(out)))) {
            addFile(zip, new File(sessionDir, "session.json"), "session.json");
            addFile(zip, new File(sessionDir, "events.json"), "events.json");
            addFile(zip, new File(sessionDir, "frames.csv"), "frames.csv");
            writeEventsCsv(zip, readEvents(sessionDir));

            JSONObject config = new JSONObject();
            config.put("exportedAtEpochMs", System.currentTimeMillis());
            config.put("appVersion", "0.1.0-test");
            config.put("detectorVersion", SnoreDetector.VERSION);
            config.put("containsCandidateClips", includeClips);
            config.put("containsFullAudio", includeFullAudio);
            config.put("privacyNote", "Created locally by explicit user action; no automatic upload.");
            ZipEntry cfg = new ZipEntry("export_info.json");
            zip.putNextEntry(cfg);
            zip.write(config.toString(2).getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();

            if (includeClips) {
                File clips = new File(sessionDir, "clips");
                File[] clipFiles = clips.listFiles((d, n) -> n.endsWith(".wav"));
                if (clipFiles != null) {
                    java.util.Arrays.sort(clipFiles, Comparator.comparing(File::getName));
                    for (File clip : clipFiles) addFile(zip, clip, "audio/clips/" + clip.getName());
                }
            }
            if (includeFullAudio) {
                File full = new File(sessionDir, "full.m4a");
                if (full.exists()) addFile(zip, full, "audio/full.m4a");
            }
        }
        return out;
    }

    private static void writeEventsCsv(ZipOutputStream zip, JSONArray arr) throws IOException {
        ZipEntry entry = new ZipEntry("events.csv");
        zip.putNextEntry(entry);
        String header = "index,start_offset_ms,end_offset_ms,duration_ms,score_avg,score_max,dbfs_max,low_band_ratio_avg,review_label,clip_file\n";
        zip.write(header.getBytes(StandardCharsets.UTF_8));
        for (int i = 0; i < arr.length(); i++) {
            JSONObject e = arr.optJSONObject(i);
            if (e == null) continue;
            String clip = e.optString("clipFile", "").replace("\"", "\"\"");
            String line = String.format(Locale.US, "%d,%d,%d,%d,%.3f,%.3f,%.3f,%.6f,%s,\"%s\"\n",
                    i, e.optLong("startOffsetMs"), e.optLong("endOffsetMs"), e.optLong("durationMs"),
                    e.optDouble("scoreAvg"), e.optDouble("scoreMax"), e.optDouble("dbfsMax"),
                    e.optDouble("lowBandRatioAvg"), e.optString("reviewLabel", "UNREVIEWED"), clip);
            zip.write(line.getBytes(StandardCharsets.UTF_8));
        }
        zip.closeEntry();
    }

    private static void addFile(ZipOutputStream zip, File file, String name) throws IOException {
        if (file == null || !file.exists() || !file.isFile()) return;
        zip.putNextEntry(new ZipEntry(name));
        try (BufferedInputStream in = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) > 0) zip.write(buffer, 0, n);
        }
        zip.closeEntry();
    }

    public static void cleanupAudioOlderThan(Context context, int days) {
        if (days <= 0) return;
        long cutoff = System.currentTimeMillis() - days * 24L * 60L * 60L * 1000L;
        for (File dir : listSessions(context)) {
            JSONObject meta = readMeta(dir);
            long end = meta.optLong("endEpochMs", meta.optLong("startEpochMs", 0));
            if (end > 0 && end < cutoff) deleteAllAudioKeepPatterns(dir);
        }
    }

    public static String formatLocalDateTime(long epochMs) {
        return new SimpleDateFormat("M월 d일 (E) HH:mm", Locale.KOREAN).format(new Date(epochMs));
    }

    public static String formatClock(long epochMs) {
        return new SimpleDateFormat("HH:mm:ss", Locale.KOREAN).format(new Date(epochMs));
    }
}
