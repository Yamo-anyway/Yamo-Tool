package com.yamo.snorelab;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.maplibre.android.MapLibre;
import org.maplibre.android.camera.CameraUpdateFactory;
import org.maplibre.android.geometry.LatLng;
import org.maplibre.android.geometry.LatLngBounds;
import org.maplibre.android.maps.MapLibreMap;
import org.maplibre.android.maps.MapView;
import org.maplibre.android.style.layers.LineLayer;
import org.maplibre.android.style.sources.GeoJsonSource;
import org.maplibre.geojson.LineString;
import org.maplibre.geojson.Point;

import java.util.ArrayList;
import java.util.List;

import static org.maplibre.android.style.layers.PropertyFactory.lineCap;
import static org.maplibre.android.style.layers.PropertyFactory.lineColor;
import static org.maplibre.android.style.layers.PropertyFactory.lineJoin;
import static org.maplibre.android.style.layers.PropertyFactory.lineOpacity;
import static org.maplibre.android.style.layers.PropertyFactory.lineWidth;

public class WalkingMapView extends FrameLayout {
    private static final String STYLE_URI = "https://tiles.openfreemap.org/styles/liberty";
    private static final String SOURCE_ID = "walking-route-source";
    private static final String LAYER_ID = "walking-route-layer";

    private final MapView mapView;
    private final TextView status;
    private MapLibreMap map;
    private GeoJsonSource routeSource;
    private List<WalkingStore.Point> points = new ArrayList<>();
    private boolean started;
    private boolean resumed;
    private boolean destroyed;

    public WalkingMapView(Context context) {
        super(context);
        setBackgroundColor(0xFF101B2D);

        MapLibre.getInstance(context.getApplicationContext());
        mapView = new MapView(context);
        mapView.onCreate(null);
        addView(mapView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        status = new TextView(context);
        status.setText("지도 불러오는 중…");
        status.setTextColor(Color.WHITE);
        status.setTextSize(12);
        status.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        status.setGravity(Gravity.CENTER);
        status.setBackgroundColor(0x990B1324);
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(36));
        sp.gravity = Gravity.TOP;
        addView(status, sp);

        mapView.getMapAsync(value -> {
            map = value;
            map.setStyle(STYLE_URI, style -> {
                routeSource = new GeoJsonSource(SOURCE_ID);
                style.addSource(routeSource);
                LineLayer routeLayer = new LineLayer(LAYER_ID, SOURCE_ID).withProperties(
                        lineColor("#32D7B4"),
                        lineWidth(5.0f),
                        lineOpacity(0.96f),
                        lineCap("round"),
                        lineJoin("round")
                );
                style.addLayer(routeLayer);
                status.setVisibility(GONE);
                updateRoute(true);
            });
        });
    }

    public void setPoints(List<WalkingStore.Point> value) {
        points = value == null ? new ArrayList<>() : new ArrayList<>(value);
        updateRoute(false);
    }

    private void updateRoute(boolean forceFit) {
        if (routeSource == null || map == null || points.isEmpty()) return;
        ArrayList<Point> geo = new ArrayList<>();
        LatLngBounds.Builder bounds = new LatLngBounds.Builder();
        for (WalkingStore.Point p : points) {
            geo.add(Point.fromLngLat(p.lon, p.lat));
            bounds.include(new LatLng(p.lat, p.lon));
        }
        if (geo.size() >= 2) routeSource.setGeoJson(LineString.fromLngLats(geo));
        else routeSource.setGeoJson(Point.fromLngLat(points.get(0).lon, points.get(0).lat));

        post(() -> {
            if (map == null || points.isEmpty()) return;
            try {
                WalkingStore.Point last = points.get(points.size() - 1);
                if (points.size() == 1) {
                    map.moveCamera(CameraUpdateFactory.newLatLngZoom(new LatLng(last.lat, last.lon), 16.0));
                } else {
                    map.animateCamera(CameraUpdateFactory.newLatLngBounds(bounds.build(), dp(30)), forceFit ? 0 : 450);
                }
            } catch (Exception ignored) {}
        });
    }

    @Override protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        if (destroyed) return;
        try { if (!started) { mapView.onStart(); started = true; } } catch (Exception ignored) {}
        try { if (!resumed) { mapView.onResume(); resumed = true; } } catch (Exception ignored) {}
    }

    @Override protected void onDetachedFromWindow() {
        if (!destroyed) {
            try { if (resumed) mapView.onPause(); } catch (Exception ignored) {}
            try { if (started) mapView.onStop(); } catch (Exception ignored) {}
            try { mapView.onDestroy(); } catch (Exception ignored) {}
            resumed = false;
            started = false;
            destroyed = true;
        }
        super.onDetachedFromWindow();
    }

    public void onLowMemory() {
        if (!destroyed) try { mapView.onLowMemory(); } catch (Exception ignored) {}
    }

    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
