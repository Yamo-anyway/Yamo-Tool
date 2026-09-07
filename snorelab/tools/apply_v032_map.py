from pathlib import Path

path = Path("snorelab/app/src/main/java/com/yamo/snorelab/ExerciseActivity.java")
s = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str):
    global s
    if old not in s:
        raise SystemExit(f"patch target not found: {label}")
    s = s.replace(old, new, 1)

replace_once(
    "    private WalkingRouteView liveRoute;\n",
    "    private WalkingMapView liveRoute;\n",
    "live map field",
)

replace_once(
    "        TextView p = text(\"GPS 경로와 활동 기록은 휴대폰 내부에만 저장됩니다. 현재 활동 기능은 인터넷·지도 서버·외부 위치 API를 사용하지 않습니다.\", 12, MUTED, false);\n",
    "        TextView p = text(\"GPS 경로와 활동 기록은 휴대폰 내부에만 저장됩니다. 지도 배경을 표시할 때만 OpenFreeMap 지도 타일을 인터넷으로 불러오며, 기록한 GPS 경로를 서버에 업로드하지 않습니다.\", 12, MUTED, false);\n",
    "privacy map disclosure",
)

replace_once(
    "        liveRoute = new WalkingRouteView(this);\n",
    "        liveRoute = new WalkingMapView(this);\n",
    "live route view",
)

replace_once(
    "        LinearLayout routeCard = card(); routeCard.addView(text(\"이동 경로\", 15, TEXT, true)); WalkingRouteView rv = new WalkingRouteView(this); rv.setPoints(WalkingStore.readRoute(dir, 1200)); LinearLayout.LayoutParams rp = match(dp(230)); rp.topMargin = dp(8); routeCard.addView(rv, rp); page.addView(routeCard, cardParams());\n",
    "        LinearLayout routeCard = card(); routeCard.addView(text(\"이동 경로\", 15, TEXT, true)); WalkingMapView rv = new WalkingMapView(this); rv.setPoints(WalkingStore.readRoute(dir, 1200)); LinearLayout.LayoutParams rp = match(dp(230)); rp.topMargin = dp(8); routeCard.addView(rv, rp); page.addView(routeCard, cardParams());\n",
    "detail route map",
)

path.write_text(s, encoding="utf-8")
print("Applied SnoreLab V0.3.2 real map patch")
