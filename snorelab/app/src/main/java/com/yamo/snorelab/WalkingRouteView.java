package com.yamo.snorelab;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

public class WalkingRouteView extends View {
    private final Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint route = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint start = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint end = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);
    private List<WalkingStore.Point> points = new ArrayList<>();

    public WalkingRouteView(Context context) {
        super(context);
        grid.setColor(0x223E4D67);
        grid.setStrokeWidth(dp(1));
        route.setColor(0xFF8B8FFF);
        route.setStyle(Paint.Style.STROKE);
        route.setStrokeWidth(dp(4));
        route.setStrokeCap(Paint.Cap.ROUND);
        route.setStrokeJoin(Paint.Join.ROUND);
        start.setColor(0xFF61D6A8);
        end.setColor(0xFFFFC56D);
        label.setColor(0xFF9DA9BF);
        label.setTextSize(dp(11));
        setMinimumHeight(Math.round(dp(190)));
    }

    public void setPoints(List<WalkingStore.Point> value) {
        points = value == null ? new ArrayList<>() : value;
        invalidate();
    }

    @Override protected void onDraw(Canvas c) {
        super.onDraw(c);
        float w = getWidth();
        float h = getHeight();
        if (w <= 0 || h <= 0) return;

        for (int i = 1; i < 4; i++) {
            float x = w * i / 4f;
            float y = h * i / 4f;
            c.drawLine(x, 0, x, h, grid);
            c.drawLine(0, y, w, y, grid);
        }

        c.drawText("GPS 경로 · 지도 배경 없이 기기 내부에서 표시", dp(10), h - dp(10), label);
        if (points.size() < 2) return;

        double minLat = Double.MAX_VALUE, maxLat = -Double.MAX_VALUE;
        double minLon = Double.MAX_VALUE, maxLon = -Double.MAX_VALUE;
        double avgLat = 0;
        for (WalkingStore.Point p : points) {
            minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
            minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
            avgLat += p.lat;
        }
        avgLat /= points.size();
        double lonScale = Math.max(0.2, Math.cos(Math.toRadians(avgLat)));
        double dx = Math.max(0.000001, (maxLon - minLon) * lonScale);
        double dy = Math.max(0.000001, maxLat - minLat);
        double span = Math.max(dx, dy);
        float pad = dp(18);
        float usableW = Math.max(1, w - pad * 2);
        float usableH = Math.max(1, h - pad * 2 - dp(18));

        Path path = new Path();
        float sx = 0, sy = 0, ex = 0, ey = 0;
        for (int i = 0; i < points.size(); i++) {
            WalkingStore.Point p = points.get(i);
            double nx = (((p.lon - minLon) * lonScale) - dx / 2.0) / span + 0.5;
            double ny = ((p.lat - minLat) - dy / 2.0) / span + 0.5;
            float x = pad + (float) nx * usableW;
            float y = pad + (1f - (float) ny) * usableH;
            if (i == 0) { path.moveTo(x, y); sx = x; sy = y; }
            else path.lineTo(x, y);
            if (i == points.size() - 1) { ex = x; ey = y; }
        }
        c.drawPath(path, route);
        c.drawCircle(sx, sy, dp(6), start);
        c.drawCircle(ex, ey, dp(6), end);
    }

    private float dp(float v) { return v * getResources().getDisplayMetrics().density; }
}
