package com.yamo.snorelab;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;

import org.json.JSONArray;
import org.json.JSONObject;

public class SnoreTimelineView extends View {
    private final Paint base = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint event = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint strong = new Paint(Paint.ANTI_ALIAS_FLAG);
    private JSONArray events = new JSONArray();
    private long durationMs = 1;

    public SnoreTimelineView(Context context) {
        super(context);
        base.setColor(0xFF33425B);
        event.setColor(0xFF6D72FF);
        strong.setColor(0xFFFF7D8D);
        setMinimumHeight(Math.round(dp(84)));
    }

    public void setData(JSONArray events, long durationMs) {
        this.events = events == null ? new JSONArray() : events;
        this.durationMs = Math.max(1, durationMs);
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float left = dp(10), right = getWidth() - dp(10);
        float centerY = getHeight() / 2f;
        float h = dp(5);
        canvas.drawRoundRect(new RectF(left, centerY - h/2, right, centerY + h/2), h, h, base);
        float width = Math.max(1f, right - left);
        for (int i = 0; i < events.length(); i++) {
            JSONObject e = events.optJSONObject(i);
            if (e == null) continue;
            long s = e.optLong("startOffsetMs", 0);
            long end = e.optLong("endOffsetMs", s + 1000);
            float x1 = left + width * (s / (float) durationMs);
            float x2 = left + width * (end / (float) durationMs);
            if (x2 - x1 < dp(3)) x2 = x1 + dp(3);
            double score = e.optDouble("scoreMax", 0);
            Paint p = score >= 72 ? strong : event;
            float barH = score >= 72 ? dp(28) : dp(18);
            canvas.drawRoundRect(new RectF(x1, centerY - barH/2, Math.min(right, x2), centerY + barH/2), dp(3), dp(3), p);
        }
    }

    private float dp(float v) {
        return v * getResources().getDisplayMetrics().density;
    }
}
