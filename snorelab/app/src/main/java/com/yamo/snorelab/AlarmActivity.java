package com.yamo.snorelab;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class AlarmActivity extends Activity {
    private static final int BG = 0xFF081713;
    private static final int NAV = 0xFF0B1E19;
    private static final int CARD = 0xFF102821;
    private static final int CARD2 = 0xFF0B211B;
    private static final int TEXT = 0xFFF3FFFB;
    private static final int MUTED = 0xFFA5C4B9;
    private static final int MINT = 0xFF66E1C5;
    private static final int MINT_DARK = 0xFF1F6E5C;
    private static final int MINT_SOFT = 0xFF173D34;
    private static final int DANGER = 0xFFFF7E8D;

    private FrameLayout content;
    private boolean editorOpen;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        buildRoot();
        showList();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4201);
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (!editorOpen && content != null) showList();
    }

    private void buildRoot() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);

        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(8), dp(6), dp(8), dp(8));
        nav.setBackgroundColor(NAV);
        nav.addView(navItem("⏰\n알람", MINT, v -> showList()), new LinearLayout.LayoutParams(0, dp(58), 1f));
        nav.addView(navItem("☾\n수면", MUTED, v -> { startActivity(new Intent(this, MainActivity.class)); finish(); }), new LinearLayout.LayoutParams(0, dp(58), 1f));
        nav.addView(navItem("🏃\n활동", MUTED, v -> { startActivity(new Intent(this, ExerciseActivity.class)); finish(); }), new LinearLayout.LayoutParams(0, dp(58), 1f));
        nav.addView(navItem("⚙\n설정", MUTED, v -> { startActivity(new Intent(this, MainActivity.class).putExtra("start_screen", "settings")); finish(); }), new LinearLayout.LayoutParams(0, dp(58), 1f));
        root.addView(nav, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        if (Build.VERSION.SDK_INT >= 21) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                int top;
                int bottom;
                if (Build.VERSION.SDK_INT >= 30) {
                    top = insets.getInsets(WindowInsets.Type.statusBars()).top;
                    bottom = insets.getInsets(WindowInsets.Type.navigationBars()).bottom;
                } else {
                    top = insets.getSystemWindowInsetTop();
                    bottom = insets.getSystemWindowInsetBottom();
                }
                // Extra breathing room below time/battery/status icons.
                v.setPadding(0, top + dp(12), 0, bottom);
                return insets;
            });
            root.requestApplyInsets();
        }
        setContentView(root);
    }

    private void showList() {
        editorOpen = false;
        content.removeAllViews();
        ScrollView scroll = new ScrollView(this);
        LinearLayout page = page();
        scroll.addView(page);
        content.addView(scroll);

        LinearLayout titleRow = new LinearLayout(this);
        titleRow.setOrientation(LinearLayout.HORIZONTAL);
        titleRow.setGravity(Gravity.CENTER_VERTICAL);
        titleRow.addView(text("알람", 26, TEXT, true), new LinearLayout.LayoutParams(0, dp(54), 1f));
        Button add = actionButton("＋ 새 알람", v -> showEditor(null));
        titleRow.addView(add, new LinearLayout.LayoutParams(dp(116), dp(44)));
        page.addView(titleRow);
        TextView sub = text("알람음 또는 텍스트 읽기 · 설정은 휴대폰에만 저장", 12, MUTED, false);
        sub.setPadding(0, 0, 0, dp(14));
        page.addView(sub);

        if (!AlarmScheduler.canScheduleExact(this)) {
            LinearLayout permission = card();
            permission.addView(text("정확한 시간 알람 권한이 필요합니다", 15, TEXT, true));
            TextView d = text("정확한 시각에 울리기 위해 Android의 알람 및 리마인더 접근을 허용해주세요.", 12, MUTED, false);
            d.setPadding(0, dp(7), 0, dp(10));
            permission.addView(d);
            permission.addView(actionButton("권한 설정 열기", v -> requestExactAlarmAccess()), match(dp(46)));
            page.addView(permission, cardParams());
        }

        List<AlarmStore.Item> alarms = AlarmStore.load(this);
        if (alarms.isEmpty()) {
            LinearLayout empty = card();
            empty.addView(text("등록된 알람이 없습니다.", 17, TEXT, true));
            TextView d = text("요일 반복, 한 번 건너뛰기, 재알림, 텍스트 읽기, 흔들어 종료를 설정할 수 있습니다.", 12, MUTED, false);
            d.setPadding(0, dp(8), 0, dp(10));
            empty.addView(d);
            empty.addView(actionButton("첫 알람 만들기", v -> showEditor(null)), match(dp(48)));
            page.addView(empty, cardParams());
        } else {
            for (AlarmStore.Item item : alarms) page.addView(alarmCard(item), cardParams());
        }
    }

    private View alarmCard(AlarmStore.Item item) {
        LinearLayout c = card();
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);

        LinearLayout left = new LinearLayout(this);
        left.setOrientation(LinearLayout.VERTICAL);
        left.addView(text(String.format(Locale.KOREAN, "%02d:%02d", item.hour, item.minute), 34, item.enabled ? TEXT : MUTED, true));
        left.addView(text(item.label == null || item.label.trim().isEmpty() ? "알람" : item.label, 13, item.enabled ? TEXT : MUTED, true));
        head.addView(left, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Switch enabled = new Switch(this);
        enabled.setChecked(item.enabled);
        head.addView(enabled, new LinearLayout.LayoutParams(dp(58), dp(52)));
        c.addView(head);

        String mode = "TTS".equals(item.alertMode) ? "텍스트 읽기" : "알람음";
        TextView modeText = text(mode + (item.shakeToStop ? "  ·  흔들기 " + item.shakeCount + "회" : ""), 12, MINT, true);
        modeText.setPadding(0, dp(8), 0, 0);
        c.addView(modeText);

        TextView repeat = text(dayText(item) + "  ·  " + retryText(item), 12, MUTED, false);
        repeat.setPadding(0, dp(5), 0, 0);
        c.addView(repeat);
        TextView next = text(item.enabled ? "다음  " + AlarmScheduler.nextDateText(item) : "알람 꺼짐", 12, item.enabled ? MINT : MUTED, false);
        next.setPadding(0, dp(5), 0, dp(10));
        c.addView(next);

        if (!item.skipDate.isEmpty()) {
            TextView skipped = text("이번 알람 건너뜀  " + item.skipDate, 12, 0xFFFFCE78, true);
            skipped.setPadding(0, 0, 0, dp(9));
            c.addView(skipped);
        }

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        Button skip = ghostButton("이번만 건너뛰기", MINT, v -> skipNext(item));
        Button edit = ghostButton("수정", TEXT, v -> showEditor(item));
        Button del = ghostButton("삭제", DANGER, v -> confirmDelete(item));
        buttons.addView(skip, new LinearLayout.LayoutParams(0, dp(42), 1.35f));
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(0, dp(42), 0.8f); bp.leftMargin = dp(7);
        buttons.addView(edit, bp);
        LinearLayout.LayoutParams dp = new LinearLayout.LayoutParams(0, dp(42), 0.8f); dp.leftMargin = this.dp(7);
        buttons.addView(del, dp);
        c.addView(buttons);

        enabled.setOnCheckedChangeListener((buttonView, isChecked) -> {
            item.enabled = isChecked;
            AlarmStore.save(this, item);
            if (isChecked) {
                if (!AlarmScheduler.scheduleNext(this, item)) Toast.makeText(this, "정확한 알람 권한을 허용해주세요.", Toast.LENGTH_LONG).show();
            } else {
                AlarmScheduler.cancelAll(this, item.id);
            }
            showList();
        });
        return c;
    }

    private void confirmDelete(AlarmStore.Item item) {
        new AlertDialog.Builder(this)
                .setTitle("알람 삭제")
                .setMessage(String.format(Locale.KOREAN, "%02d:%02d 알람을 삭제할까요?", item.hour, item.minute))
                .setNegativeButton("취소", null)
                .setPositiveButton("삭제", (d, which) -> {
                    AlarmScheduler.cancelAll(this, item.id);
                    AlarmStore.delete(this, item.id);
                    Toast.makeText(this, "알람을 삭제했습니다.", Toast.LENGTH_SHORT).show();
                    showList();
                }).show();
    }

    private void skipNext(AlarmStore.Item item) {
        String old = item.skipDate;
        item.skipDate = "";
        long next = AlarmScheduler.nextTriggerMillis(item, System.currentTimeMillis());
        item.skipDate = old;
        if (next <= 0) {
            Toast.makeText(this, "건너뛸 다음 알람이 없습니다.", Toast.LENGTH_SHORT).show();
            return;
        }
        String date = Instant.ofEpochMilli(next).atZone(ZoneId.systemDefault()).toLocalDate().format(DateTimeFormatter.ISO_LOCAL_DATE);
        item.skipDate = date;
        AlarmStore.save(this, item);
        if (item.enabled) AlarmScheduler.scheduleNext(this, item);
        Toast.makeText(this, date + " 알람을 한 번 건너뜁니다.", Toast.LENGTH_LONG).show();
        showList();
    }

    private void showEditor(AlarmStore.Item existing) {
        editorOpen = true;
        content.removeAllViews();
        AlarmStore.Item draft = existing == null ? new AlarmStore.Item() : copy(existing);

        ScrollView scroll = new ScrollView(this);
        LinearLayout page = page();
        scroll.addView(page);
        content.addView(scroll);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView back = text("‹", 34, TEXT, false);
        back.setGravity(Gravity.CENTER);
        back.setOnClickListener(v -> showList());
        top.addView(back, new LinearLayout.LayoutParams(dp(42), dp(52)));
        top.addView(text(existing == null ? "새 알람" : "알람 수정", 23, TEXT, true), new LinearLayout.LayoutParams(0, dp(52), 1f));
        page.addView(top);

        // 24-hour numeric time selection. No analog clock face and no AM/PM split.
        LinearLayout timeCard = card();
        timeCard.addView(text("알람 시간", 15, TEXT, true));
        LinearLayout timeRow = new LinearLayout(this);
        timeRow.setOrientation(LinearLayout.HORIZONTAL);
        timeRow.setGravity(Gravity.CENTER);
        Spinner hour = spinner(numberStrings(0, 23));
        hour.setSelection(draft.hour);
        Spinner minute = spinner(numberStrings(0, 59));
        minute.setSelection(draft.minute);
        timeRow.addView(hour, new LinearLayout.LayoutParams(0, dp(62), 1f));
        TextView colon = text(":", 32, MINT, true); colon.setGravity(Gravity.CENTER);
        timeRow.addView(colon, new LinearLayout.LayoutParams(dp(42), dp(62)));
        timeRow.addView(minute, new LinearLayout.LayoutParams(0, dp(62), 1f));
        timeCard.addView(timeRow);
        timeCard.addView(text("00:00 ~ 23:59 · 24시간 기준", 11, MUTED, false));
        page.addView(timeCard, cardParams());

        LinearLayout nameCard = card();
        nameCard.addView(text("알람 이름", 15, TEXT, true));
        EditText label = editText(draft.label, "예: 아침 운동");
        LinearLayout.LayoutParams lp = match(dp(54)); lp.topMargin = dp(9);
        nameCard.addView(label, lp);
        page.addView(nameCard, cardParams());

        // Sunday to Saturday visual chips; storage remains Monday=0 ... Sunday=6.
        LinearLayout repeatCard = card();
        repeatCard.addView(text("반복 요일", 15, TEXT, true));
        LinearLayout daysRow = new LinearLayout(this);
        daysRow.setOrientation(LinearLayout.HORIZONTAL);
        daysRow.setPadding(0, dp(10), 0, dp(6));
        String[] dayNames = {"일", "월", "화", "수", "목", "금", "토"};
        int[] storeIndex = {6, 0, 1, 2, 3, 4, 5};
        boolean[] selectedDays = draft.days.clone();
        TextView[] dayChips = new TextView[7];
        for (int i = 0; i < 7; i++) {
            final int uiIndex = i;
            final int dataIndex = storeIndex[i];
            TextView chip = dayChip(dayNames[i], selectedDays[dataIndex]);
            chip.setOnClickListener(v -> {
                selectedDays[dataIndex] = !selectedDays[dataIndex];
                styleDayChip(dayChips[uiIndex], selectedDays[dataIndex]);
            });
            dayChips[i] = chip;
            LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(0, dp(44), 1f);
            if (i > 0) cp.leftMargin = dp(5);
            daysRow.addView(chip, cp);
        }
        repeatCard.addView(daysRow);
        repeatCard.addView(text("선택한 요일만 반복 · 모두 해제하면 한 번만 울림", 11, MUTED, false));
        page.addView(repeatCard, cardParams());

        LinearLayout retryCard = card();
        retryCard.addView(text("놓친 알람 재알림", 15, TEXT, true));
        String[] intervals = {"1분 간격", "3분 간격", "5분 간격", "10분 간격", "15분 간격", "30분 간격"};
        int[] intervalValues = {1, 3, 5, 10, 15, 30};
        Spinner interval = spinner(intervals);
        int intPos = 2; for (int i = 0; i < intervalValues.length; i++) if (intervalValues[i] == draft.retryMinutes) intPos = i;
        interval.setSelection(intPos);
        retryCard.addView(interval, match(dp(52)));
        String[] counts = {"반복 안 함", "1회", "2회", "3회", "5회", "10회", "무제한 · 종료할 때까지"};
        int[] countValues = {0, 1, 2, 3, 5, 10, -1};
        Spinner count = spinner(counts);
        int countPos = 3; for (int i = 0; i < countValues.length; i++) if (countValues[i] == draft.retryCount) countPos = i;
        count.setSelection(countPos);
        retryCard.addView(count, match(dp(52)));
        page.addView(retryCard, cardParams());

        LinearLayout wakeCard = card();
        wakeCard.addView(text("알람 방식", 15, TEXT, true));
        wakeCard.addView(text("둘 중 하나를 선택합니다.", 11, MUTED, false));
        LinearLayout modeRow = new LinearLayout(this);
        modeRow.setOrientation(LinearLayout.HORIZONTAL);
        modeRow.setPadding(0, dp(10), 0, dp(8));
        String[] mode = {"TTS".equals(draft.alertMode) ? "TTS" : "SOUND"};
        Button soundMode = segmentButton("🔔 알람음", "SOUND".equals(mode[0]));
        Button ttsMode = segmentButton("🗣 텍스트 읽기", "TTS".equals(mode[0]));
        modeRow.addView(soundMode, new LinearLayout.LayoutParams(0, dp(48), 1f));
        LinearLayout.LayoutParams ttp = new LinearLayout.LayoutParams(0, dp(48), 1f); ttp.leftMargin = dp(8);
        modeRow.addView(ttsMode, ttp);
        wakeCard.addView(modeRow);

        LinearLayout soundSection = new LinearLayout(this);
        soundSection.setOrientation(LinearLayout.VERTICAL);
        soundSection.setPadding(0, dp(4), 0, 0);
        soundSection.addView(text("알람음 선택", 12, MUTED, true));
        String[] sounds = {"강력 알람", "빠른 펄스", "익스트림 경고"};
        String[] soundValues = {"STRONG", "PULSE", "EXTREME"};
        Spinner sound = spinner(sounds);
        sound.setSelection("PULSE".equals(draft.soundStyle) ? 1 : "EXTREME".equals(draft.soundStyle) ? 2 : 0);
        soundSection.addView(sound, match(dp(52)));
        wakeCard.addView(soundSection);

        LinearLayout ttsSection = new LinearLayout(this);
        ttsSection.setOrientation(LinearLayout.VERTICAL);
        ttsSection.setPadding(0, dp(4), 0, 0);
        ttsSection.addView(text("읽을 텍스트", 12, MUTED, true));
        EditText speech = editText(draft.speechText, "예: 일어날 시간입니다. 오늘은 러닝하는 날입니다.");
        speech.setSingleLine(false);
        speech.setMinLines(2);
        ttsSection.addView(speech, match(dp(82)));
        Button clearText = ghostButton("텍스트 지우기", MUTED, v -> speech.setText(""));
        LinearLayout.LayoutParams ctp = match(dp(40)); ctp.topMargin = dp(6);
        ttsSection.addView(clearText, ctp);
        ttsSection.addView(text("음성", 12, MUTED, true));
        String[] voices = {"여성형 · 기기 TTS", "남성형 · 기기 TTS"};
        Spinner voice = spinner(voices);
        voice.setSelection("MALE".equals(draft.voiceStyle) ? 1 : 0);
        ttsSection.addView(voice, match(dp(52)));
        TextView ttsNote = text("한글/영문을 자동 구분해 휴대폰 TTS 엔진으로 읽습니다.", 11, MUTED, false);
        ttsNote.setPadding(0, dp(3), 0, 0);
        ttsSection.addView(ttsNote);
        wakeCard.addView(ttsSection);

        Runnable refreshMode = () -> {
            boolean isTts = "TTS".equals(mode[0]);
            styleSegment(soundMode, !isTts);
            styleSegment(ttsMode, isTts);
            soundSection.setVisibility(isTts ? View.GONE : View.VISIBLE);
            ttsSection.setVisibility(isTts ? View.VISIBLE : View.GONE);
        };
        soundMode.setOnClickListener(v -> { mode[0] = "SOUND"; refreshMode.run(); });
        ttsMode.setOnClickListener(v -> { mode[0] = "TTS"; refreshMode.run(); });
        refreshMode.run();
        page.addView(wakeCard, cardParams());

        LinearLayout stopCard = card();
        stopCard.addView(text("알람 종료", 15, TEXT, true));
        stopCard.addView(text("화면의 ‘알람 종료’ 버튼은 항상 사용할 수 있습니다.", 11, MUTED, false));
        Switch shake = settingSwitch("추가로 흔들어서 종료", draft.shakeToStop);
        stopCard.addView(shake);
        LinearLayout shakeSection = new LinearLayout(this);
        shakeSection.setOrientation(LinearLayout.VERTICAL);
        shakeSection.addView(text("필요한 흔들기 횟수", 12, MUTED, true));
        String[] shakeOptions = numberStrings(3, 10);
        Spinner shakeCount = spinner(shakeOptions);
        shakeCount.setSelection(Math.max(0, Math.min(7, draft.shakeCount - 3)));
        shakeSection.addView(shakeCount, match(dp(52)));
        stopCard.addView(shakeSection);
        shakeSection.setVisibility(shake.isChecked() ? View.VISIBLE : View.GONE);
        shake.setOnCheckedChangeListener((buttonView, checked) -> shakeSection.setVisibility(checked ? View.VISIBLE : View.GONE));
        page.addView(stopCard, cardParams());

        Button save = actionButton("알람 저장", v -> {
            draft.hour = hour.getSelectedItemPosition();
            draft.minute = minute.getSelectedItemPosition();
            draft.label = label.getText().toString().trim();
            if (draft.label.isEmpty()) draft.label = "알람";
            for (int i = 0; i < 7; i++) draft.days[i] = selectedDays[i];
            draft.retryMinutes = intervalValues[interval.getSelectedItemPosition()];
            draft.retryCount = countValues[count.getSelectedItemPosition()];
            draft.alertMode = mode[0];
            draft.soundStyle = soundValues[sound.getSelectedItemPosition()];
            draft.speechText = speech.getText().toString().trim();
            if ("TTS".equals(draft.alertMode) && draft.speechText.isEmpty()) {
                Toast.makeText(this, "텍스트 읽기 방식은 읽을 문구를 입력해주세요.", Toast.LENGTH_LONG).show();
                return;
            }
            draft.voiceStyle = voice.getSelectedItemPosition() == 1 ? "MALE" : "FEMALE";
            draft.shakeToStop = shake.isChecked();
            draft.shakeCount = shakeCount.getSelectedItemPosition() + 3;
            draft.enabled = true;
            draft.skipDate = "";
            AlarmStore.save(this, draft);
            boolean ok = AlarmScheduler.scheduleNext(this, draft);
            if (!ok) {
                Toast.makeText(this, "저장했습니다. 정확한 시간 알람 권한을 허용하면 예약됩니다.", Toast.LENGTH_LONG).show();
                requestExactAlarmAccess();
            } else {
                Toast.makeText(this, "알람을 저장했습니다.", Toast.LENGTH_SHORT).show();
            }
            showList();
        });
        LinearLayout.LayoutParams sp = match(dp(54)); sp.topMargin = dp(4); sp.bottomMargin = dp(10);
        page.addView(save, sp);

        if (existing != null) {
            Button delete = ghostButton("이 알람 삭제", DANGER, v -> confirmDelete(existing));
            LinearLayout.LayoutParams delp = match(dp(48)); delp.bottomMargin = dp(18);
            page.addView(delete, delp);
        }
    }

    private AlarmStore.Item copy(AlarmStore.Item a) {
        AlarmStore.Item b = new AlarmStore.Item();
        b.id = a.id; b.hour = a.hour; b.minute = a.minute; b.label = a.label; b.enabled = a.enabled;
        System.arraycopy(a.days, 0, b.days, 0, 7);
        b.skipDate = a.skipDate; b.retryMinutes = a.retryMinutes; b.retryCount = a.retryCount;
        b.alertMode = a.alertMode; b.soundStyle = a.soundStyle; b.speechText = a.speechText; b.voiceStyle = a.voiceStyle;
        b.shakeToStop = a.shakeToStop; b.shakeCount = a.shakeCount;
        return b;
    }

    private void requestExactAlarmAccess() {
        if (Build.VERSION.SDK_INT < 31) return;
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception e) {
            try { startActivity(new Intent(Settings.ACTION_SETTINGS)); } catch (Exception ignored) {}
        }
    }

    private String dayText(AlarmStore.Item a) {
        if (!a.repeats()) return "한 번만";
        boolean all = true; for (boolean d : a.days) all &= d;
        if (all) return "매일";
        String[] names = {"월", "화", "수", "목", "금", "토", "일"};
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 7; i++) if (a.days[i]) { if (b.length() > 0) b.append(" "); b.append(names[i]); }
        return b.toString();
    }

    private String retryText(AlarmStore.Item a) {
        if (a.retryCount == 0) return "재알림 없음";
        if (a.retryCount < 0) return a.retryMinutes + "분 간격 · 무제한";
        return a.retryMinutes + "분 간격 · " + a.retryCount + "회";
    }

    private LinearLayout page() {
        LinearLayout p = new LinearLayout(this);
        p.setOrientation(LinearLayout.VERTICAL);
        p.setPadding(dp(18), dp(8), dp(18), dp(24));
        return p;
    }

    private LinearLayout card() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(16), dp(15), dp(16), dp(15));
        c.setBackground(rounded(CARD, 18, 0, Color.TRANSPARENT));
        return c;
    }

    private LinearLayout.LayoutParams cardParams() {
        LinearLayout.LayoutParams p = matchWrap();
        p.bottomMargin = dp(11);
        return p;
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView v = new TextView(this);
        v.setText(s);
        v.setTextSize(sp);
        v.setTextColor(color);
        if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return v;
    }

    private EditText editText(String value, String hint) {
        EditText e = new EditText(this);
        e.setText(value == null ? "" : value);
        e.setHint(hint);
        e.setTextColor(TEXT);
        e.setHintTextColor(0xFF73968A);
        e.setTextSize(15);
        e.setSingleLine(true);
        e.setPadding(dp(12), dp(9), dp(12), dp(9));
        e.setBackground(rounded(CARD2, 12, 1, MINT_DARK));
        return e;
    }

    private Button actionButton(String label, View.OnClickListener listener) {
        Button b = new Button(this);
        b.setText(label); b.setAllCaps(false); b.setTextColor(0xFF06251D); b.setTextSize(14);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD); b.setBackground(rounded(MINT, 14, 0, Color.TRANSPARENT));
        b.setOnClickListener(listener); return b;
    }

    private Button ghostButton(String label, int color, View.OnClickListener listener) {
        Button b = new Button(this);
        b.setText(label); b.setAllCaps(false); b.setTextColor(color); b.setTextSize(12);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD); b.setBackground(rounded(CARD2, 12, 1, color == DANGER ? 0xFF6B3540 : MINT_DARK));
        b.setOnClickListener(listener); return b;
    }

    private Button segmentButton(String label, boolean selected) {
        Button b = new Button(this);
        b.setText(label); b.setAllCaps(false); b.setTextSize(14); b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        styleSegment(b, selected);
        return b;
    }

    private void styleSegment(Button b, boolean selected) {
        b.setTextColor(selected ? 0xFF06251D : TEXT);
        b.setBackground(rounded(selected ? MINT : CARD2, 14, 1, selected ? MINT : MINT_DARK));
    }

    private TextView dayChip(String label, boolean selected) {
        TextView v = text(label, 14, TEXT, true);
        v.setGravity(Gravity.CENTER);
        styleDayChip(v, selected);
        return v;
    }

    private void styleDayChip(TextView v, boolean selected) {
        if (v == null) return;
        v.setTextColor(selected ? 0xFF06251D : MUTED);
        v.setBackground(rounded(selected ? MINT : CARD2, 12, 1, selected ? MINT : MINT_DARK));
    }

    private Switch settingSwitch(String label, boolean checked) {
        Switch s = new Switch(this);
        s.setText(label); s.setTextColor(TEXT); s.setTextSize(14); s.setChecked(checked);
        s.setPadding(0, dp(7), 0, dp(5));
        return s;
    }

    private Spinner spinner(String[] values) {
        Spinner s = new Spinner(this);
        ArrayAdapter<String> adapter = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_item, values) {
            @Override public View getView(int position, View convertView, ViewGroup parent) {
                TextView v = (TextView) super.getView(position, convertView, parent);
                styleSpinnerText(v, false); return v;
            }
            @Override public View getDropDownView(int position, View convertView, ViewGroup parent) {
                TextView v = (TextView) super.getDropDownView(position, convertView, parent);
                styleSpinnerText(v, true); return v;
            }
        };
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        s.setAdapter(adapter);
        s.setBackground(rounded(CARD2, 12, 1, MINT_DARK));
        return s;
    }

    private void styleSpinnerText(TextView v, boolean dropdown) {
        v.setTextColor(TEXT); v.setTextSize(16); v.setGravity(Gravity.CENTER_VERTICAL);
        v.setPadding(dp(14), dp(10), dp(14), dp(10));
        if (dropdown) v.setBackgroundColor(CARD2);
    }

    private TextView navItem(String label, int color, View.OnClickListener listener) {
        TextView v = text(label, 11, color, true);
        v.setGravity(Gravity.CENTER); v.setOnClickListener(listener); return v;
    }

    private GradientDrawable rounded(int fill, float radiusDp, int strokeDp, int strokeColor) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill); g.setCornerRadius(dp(radiusDp));
        if (strokeDp > 0) g.setStroke(dp(strokeDp), strokeColor);
        return g;
    }

    private static String[] numberStrings(int start, int end) {
        ArrayList<String> values = new ArrayList<>();
        for (int i = start; i <= end; i++) values.add(String.format(Locale.US, "%02d", i));
        return values.toArray(new String[0]);
    }

    private LinearLayout.LayoutParams match(int h) { return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, h); }
    private LinearLayout.LayoutParams matchWrap() { return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); }
    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    @Override public void onBackPressed() {
        if (editorOpen) showList(); else super.onBackPressed();
    }
}
