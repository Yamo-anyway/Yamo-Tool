package com.yamo.snorelab;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
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
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.TimePicker;
import android.widget.Toast;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

public class AlarmActivity extends Activity {
    private static final int BG = 0xFF0B1324;
    private static final int CARD = 0xFF16243B;
    private static final int CARD2 = 0xFF111C31;
    private static final int TEXT = 0xFFF5F7FF;
    private static final int MUTED = 0xFF9DA9BF;
    private static final int PRIMARY = 0xFF6D72FF;
    private static final int PRIMARY2 = 0xFF8B8FFF;
    private static final int DANGER = 0xFFFF6E7E;

    private FrameLayout content;
    private boolean editorOpen;
    private long editingId = -1L;

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
        nav.setOrientation(LinearLayout.HORIZONTAL); nav.setGravity(Gravity.CENTER); nav.setPadding(dp(10), dp(7), dp(10), dp(9)); nav.setBackgroundColor(0xFF0E182A);
        nav.addView(navItem("⏰\n알람", PRIMARY2, v -> showList()), new LinearLayout.LayoutParams(0, dp(56), 1f));
        nav.addView(navItem("☾\n수면", MUTED, v -> { startActivity(new Intent(this, MainActivity.class)); finish(); }), new LinearLayout.LayoutParams(0, dp(56), 1f));
        nav.addView(navItem("⚙\n설정", MUTED, v -> { startActivity(new Intent(this, MainActivity.class).putExtra("start_screen", "settings")); finish(); }), new LinearLayout.LayoutParams(0, dp(56), 1f));
        root.addView(nav, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        if (Build.VERSION.SDK_INT >= 21) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                int bottom = Build.VERSION.SDK_INT >= 30 ? insets.getInsets(WindowInsets.Type.navigationBars()).bottom : insets.getSystemWindowInsetBottom();
                v.setPadding(0, 0, 0, bottom); return insets;
            });
            root.requestApplyInsets();
        }
        setContentView(root);
    }

    private void showList() {
        editorOpen = false; editingId = -1L; content.removeAllViews();
        ScrollView scroll = new ScrollView(this); LinearLayout page = page(); scroll.addView(page); content.addView(scroll);

        LinearLayout titleRow = new LinearLayout(this); titleRow.setOrientation(LinearLayout.HORIZONTAL); titleRow.setGravity(Gravity.CENTER_VERTICAL);
        titleRow.addView(text("알람", 24, TEXT, true), new LinearLayout.LayoutParams(0, dp(52), 1f));
        Button add = actionButton("＋ 새 알람", true, v -> showEditor(null)); titleRow.addView(add, new LinearLayout.LayoutParams(dp(116), dp(44))); page.addView(titleRow);
        TextView sub = text("놓치기 어려운 알람 · 모든 설정은 휴대폰에 저장됩니다.", 12, MUTED, false); sub.setPadding(0, 0, 0, dp(14)); page.addView(sub);

        if (!AlarmScheduler.canScheduleExact(this)) {
            LinearLayout permission = card(); permission.addView(text("정확한 시간 알람 권한이 필요합니다", 15, TEXT, true));
            TextView d = text("Android 12 이상에서는 사용자가 '알람 및 리마인더' 접근을 허용해야 정확한 시각에 울릴 수 있습니다.", 12, MUTED, false); d.setPadding(0, dp(7), 0, dp(10)); permission.addView(d);
            permission.addView(actionButton("권한 설정 열기", true, v -> requestExactAlarmAccess()), match(dp(48))); page.addView(permission, cardParams());
        }

        List<AlarmStore.Item> alarms = AlarmStore.load(this);
        if (alarms.isEmpty()) {
            LinearLayout empty = card(); empty.addView(text("등록된 알람이 없습니다.", 16, TEXT, true));
            TextView d = text("요일 반복, 이번 한 번 건너뛰기, 재알림, 텍스트 읽기와 흔들어 종료를 사용할 수 있습니다.", 12, MUTED, false); d.setPadding(0, dp(8), 0, dp(8)); empty.addView(d);
            empty.addView(actionButton("첫 알람 만들기", true, v -> showEditor(null)), match(dp(50))); page.addView(empty, cardParams());
        } else {
            for (AlarmStore.Item item : alarms) page.addView(alarmCard(item), cardParams());
        }
    }

    private View alarmCard(AlarmStore.Item item) {
        LinearLayout c = card();
        LinearLayout head = new LinearLayout(this); head.setOrientation(LinearLayout.HORIZONTAL); head.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout left = new LinearLayout(this); left.setOrientation(LinearLayout.VERTICAL);
        left.addView(text(String.format(Locale.KOREAN, "%02d:%02d", item.hour, item.minute), 32, item.enabled ? TEXT : MUTED, true));
        left.addView(text(item.label, 13, item.enabled ? TEXT : MUTED, true));
        head.addView(left, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Switch enabled = new Switch(this); enabled.setChecked(item.enabled); head.addView(enabled, new LinearLayout.LayoutParams(dp(58), dp(52))); c.addView(head);

        TextView repeat = text(dayText(item) + "  ·  " + retryText(item), 12, MUTED, false); repeat.setPadding(0, dp(7), 0, 0); c.addView(repeat);
        TextView next = text(item.enabled ? "다음: " + AlarmScheduler.nextDateText(item) : "알람 꺼짐", 12, PRIMARY2, false); next.setPadding(0, dp(5), 0, dp(9)); c.addView(next);
        if (!item.skipDate.isEmpty()) {
            TextView skipped = text("이번 알람 건너뜀: " + item.skipDate, 12, 0xFFFFC56D, true); skipped.setPadding(0, 0, 0, dp(8)); c.addView(skipped);
        }

        LinearLayout buttons = new LinearLayout(this); buttons.setOrientation(LinearLayout.HORIZONTAL);
        Button skip = ghostButton("이번만 건너뛰기", v -> skipNext(item));
        Button edit = ghostButton("수정", v -> showEditor(item));
        buttons.addView(skip, new LinearLayout.LayoutParams(0, dp(42), 1f));
        LinearLayout.LayoutParams ep = new LinearLayout.LayoutParams(0, dp(42), 1f); ep.leftMargin = dp(8); buttons.addView(edit, ep); c.addView(buttons);

        enabled.setOnCheckedChangeListener((buttonView, isChecked) -> {
            item.enabled = isChecked;
            AlarmStore.save(this, item);
            if (isChecked) {
                if (!AlarmScheduler.scheduleNext(this, item)) Toast.makeText(this, "정확한 알람 권한을 허용해주세요.", Toast.LENGTH_LONG).show();
            } else AlarmScheduler.cancelAll(this, item.id);
            showList();
        });
        return c;
    }

    private void skipNext(AlarmStore.Item item) {
        String old = item.skipDate; item.skipDate = "";
        long next = AlarmScheduler.nextTriggerMillis(item, System.currentTimeMillis());
        item.skipDate = old;
        if (next <= 0) { Toast.makeText(this, "건너뛸 다음 알람이 없습니다.", Toast.LENGTH_SHORT).show(); return; }
        String date = Instant.ofEpochMilli(next).atZone(ZoneId.systemDefault()).toLocalDate().format(DateTimeFormatter.ISO_LOCAL_DATE);
        item.skipDate = date; AlarmStore.save(this, item);
        if (item.enabled) AlarmScheduler.scheduleNext(this, item);
        Toast.makeText(this, date + " 알람을 한 번 건너뜁니다.", Toast.LENGTH_LONG).show(); showList();
    }

    private void showEditor(AlarmStore.Item existing) {
        editorOpen = true; editingId = existing == null ? -1L : existing.id; content.removeAllViews();
        AlarmStore.Item draft = existing == null ? new AlarmStore.Item() : copy(existing);
        ScrollView scroll = new ScrollView(this); LinearLayout page = page(); scroll.addView(page); content.addView(scroll);

        LinearLayout top = new LinearLayout(this); top.setOrientation(LinearLayout.HORIZONTAL); top.setGravity(Gravity.CENTER_VERTICAL);
        TextView back = text("‹", 34, TEXT, false); back.setGravity(Gravity.CENTER); back.setOnClickListener(v -> showList()); top.addView(back, new LinearLayout.LayoutParams(dp(42), dp(50)));
        top.addView(text(existing == null ? "새 알람" : "알람 수정", 22, TEXT, true), new LinearLayout.LayoutParams(0, dp(50), 1f)); page.addView(top);

        LinearLayout timeCard = card(); timeCard.addView(text("알람 시간", 15, TEXT, true));
        TimePicker picker = new TimePicker(this); picker.setIs24HourView(true); picker.setHour(draft.hour); picker.setMinute(draft.minute); timeCard.addView(picker, matchWrap()); page.addView(timeCard, cardParams());

        LinearLayout msgCard = card(); msgCard.addView(text("알람 내용", 15, TEXT, true));
        EditText label = new EditText(this); label.setText(draft.label); label.setHint("예: 일어나세요. 오늘 7km 러닝 예정입니다."); label.setTextColor(TEXT); label.setHintTextColor(MUTED); label.setSingleLine(false); label.setMinLines(2); label.setBackgroundColor(CARD2); label.setPadding(dp(12), dp(10), dp(12), dp(10));
        LinearLayout.LayoutParams lp = match(dp(82)); lp.topMargin = dp(10); msgCard.addView(label, lp); page.addView(msgCard, cardParams());

        LinearLayout repeatCard = card(); repeatCard.addView(text("반복 요일", 15, TEXT, true));
        LinearLayout days = new LinearLayout(this); days.setOrientation(LinearLayout.HORIZONTAL); String[] names = {"월","화","수","목","금","토","일"}; CheckBox[] checks = new CheckBox[7];
        for (int i = 0; i < 7; i++) { CheckBox cb = new CheckBox(this); cb.setText(names[i]); cb.setTextColor(TEXT); cb.setChecked(draft.days[i]); checks[i] = cb; days.addView(cb, new LinearLayout.LayoutParams(0, dp(48), 1f)); }
        repeatCard.addView(days); repeatCard.addView(text("요일을 선택하지 않으면 한 번만 울립니다.", 11, MUTED, false)); page.addView(repeatCard, cardParams());

        LinearLayout retryCard = card(); retryCard.addView(text("놓친 알람 재알림", 15, TEXT, true));
        String[] intervals = {"1분 간격", "3분 간격", "5분 간격", "10분 간격", "15분 간격", "30분 간격"}; int[] intervalValues = {1,3,5,10,15,30};
        Spinner interval = spinner(intervals); int intPos = 2; for (int i=0;i<intervalValues.length;i++) if (intervalValues[i]==draft.retryMinutes) intPos=i; interval.setSelection(intPos); retryCard.addView(interval, match(dp(52)));
        String[] counts = {"반복 안 함", "1회", "2회", "3회", "5회", "10회", "무제한 · 종료할 때까지"}; int[] countValues = {0,1,2,3,5,10,-1};
        Spinner count = spinner(counts); int countPos=3; for (int i=0;i<countValues.length;i++) if (countValues[i]==draft.retryCount) countPos=i; count.setSelection(countPos); retryCard.addView(count, match(dp(52))); page.addView(retryCard, cardParams());

        LinearLayout soundCard = card(); soundCard.addView(text("소리 · 음성", 15, TEXT, true));
        String[] sounds = {"강력 알람", "빠른 펄스", "익스트림 경고"}; String[] soundValues = {"STRONG","PULSE","EXTREME"}; Spinner sound = spinner(sounds); sound.setSelection("PULSE".equals(draft.soundStyle)?1:"EXTREME".equals(draft.soundStyle)?2:0); soundCard.addView(sound, match(dp(52)));
        Switch tts = settingSwitch("알람 텍스트 큰 소리로 읽기", draft.ttsEnabled); soundCard.addView(tts);
        String[] voices = {"여성형 음성 · 기기 TTS", "남성형 음성 · 기기 TTS"}; Spinner voice = spinner(voices); voice.setSelection("MALE".equals(draft.voiceStyle)?1:0); soundCard.addView(voice, match(dp(52)));
        TextView note = text("한글/영문 구간을 자동 구분해 기기의 TTS 엔진으로 읽습니다. 실제 음색은 휴대폰의 TTS 엔진에 따라 조금 다를 수 있습니다.", 11, MUTED, false); note.setPadding(0, dp(4), 0, 0); soundCard.addView(note); page.addView(soundCard, cardParams());

        LinearLayout stopCard = card(); stopCard.addView(text("알람 종료", 15, TEXT, true)); Switch shake = settingSwitch("휴대폰을 강하게 3번 흔들어 종료", draft.shakeToStop); stopCard.addView(shake); stopCard.addView(text("알람 화면의 '알람 종료' 버튼으로도 언제든 종료할 수 있습니다.", 11, MUTED, false)); page.addView(stopCard, cardParams());

        Button save = actionButton("알람 저장", true, v -> {
            draft.hour = picker.getHour(); draft.minute = picker.getMinute(); draft.label = label.getText().toString().trim(); if (draft.label.isEmpty()) draft.label = "일어날 시간입니다";
            for (int i=0;i<7;i++) draft.days[i] = checks[i].isChecked(); draft.retryMinutes = intervalValues[interval.getSelectedItemPosition()]; draft.retryCount = countValues[count.getSelectedItemPosition()];
            draft.ttsEnabled = tts.isChecked(); draft.voiceStyle = voice.getSelectedItemPosition()==1?"MALE":"FEMALE"; draft.soundStyle = soundValues[sound.getSelectedItemPosition()]; draft.shakeToStop = shake.isChecked(); draft.enabled = true; draft.skipDate = "";
            AlarmStore.save(this, draft); boolean ok = AlarmScheduler.scheduleNext(this, draft); if (!ok) { Toast.makeText(this, "저장했습니다. 정확한 시간 알람 권한을 허용하면 예약됩니다.", Toast.LENGTH_LONG).show(); requestExactAlarmAccess(); } else Toast.makeText(this, "알람을 예약했습니다.", Toast.LENGTH_SHORT).show(); showList();
        }); page.addView(save, match(dp(56)));

        if (existing != null) {
            Button del = ghostButton("이 알람 삭제", v -> { AlarmScheduler.cancelAll(this, existing.id); AlarmStore.delete(this, existing.id); showList(); }); del.setTextColor(DANGER); LinearLayout.LayoutParams dpv = match(dp(48)); dpv.topMargin = dp(10); page.addView(del, dpv);
        }
    }

    private AlarmStore.Item copy(AlarmStore.Item a) {
        AlarmStore.Item b = new AlarmStore.Item(); b.id=a.id; b.hour=a.hour; b.minute=a.minute; b.label=a.label; b.enabled=a.enabled; for(int i=0;i<7;i++) b.days[i]=a.days[i]; b.skipDate=a.skipDate; b.retryMinutes=a.retryMinutes; b.retryCount=a.retryCount; b.ttsEnabled=a.ttsEnabled; b.voiceStyle=a.voiceStyle; b.soundStyle=a.soundStyle; b.shakeToStop=a.shakeToStop; return b;
    }

    private void requestExactAlarmAccess() {
        if (Build.VERSION.SDK_INT < 31) return;
        try { startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName()))); }
        catch (Exception e) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
    }

    private String dayText(AlarmStore.Item a) { String[] n={"월","화","수","목","금","토","일"}; StringBuilder b=new StringBuilder(); for(int i=0;i<7;i++) if(a.days[i]) { if(b.length()>0)b.append("·"); b.append(n[i]); } return b.length()==0?"한 번만":b.toString(); }
    private String retryText(AlarmStore.Item a) { if(a.retryCount==0)return "재알림 없음"; if(a.retryCount<0)return a.retryMinutes+"분마다 무제한"; return a.retryMinutes+"분마다 "+a.retryCount+"회"; }

    @Override public void onBackPressed() { if(editorOpen){ showList(); return; } super.onBackPressed(); }

    private LinearLayout page() { LinearLayout p=new LinearLayout(this); p.setOrientation(LinearLayout.VERTICAL); p.setPadding(dp(18),dp(18),dp(18),dp(30)); p.setBackgroundColor(BG); return p; }
    private LinearLayout card() { LinearLayout v=new LinearLayout(this); v.setOrientation(LinearLayout.VERTICAL); v.setPadding(dp(16),dp(15),dp(16),dp(15)); v.setBackground(round(CARD,18,0,0)); return v; }
    private TextView navItem(String s,int color,View.OnClickListener click){TextView v=text(s,13,color,true);v.setGravity(Gravity.CENTER);v.setOnClickListener(click);return v;}
    private TextView text(String s,int sp,int color,boolean bold){TextView v=new TextView(this);v.setText(s);v.setTextSize(sp);v.setTextColor(color);if(bold)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);v.setLineSpacing(0,1.08f);return v;}
    private Button actionButton(String s,boolean primary,View.OnClickListener click){Button b=new Button(this);b.setText(s);b.setAllCaps(false);b.setTextSize(14);b.setTypeface(Typeface.DEFAULT,Typeface.BOLD);b.setTextColor(Color.WHITE);b.setBackground(round(primary?PRIMARY:0xFF33425B,15,0,0));b.setOnClickListener(click);return b;}
    private Button ghostButton(String s,View.OnClickListener click){Button b=new Button(this);b.setText(s);b.setAllCaps(false);b.setTextSize(12);b.setTextColor(TEXT);b.setBackground(round(CARD2,12,1,0xFF35445F));b.setOnClickListener(click);return b;}
    private Switch settingSwitch(String s,boolean checked){Switch sw=new Switch(this);sw.setText(s);sw.setTextColor(TEXT);sw.setTextSize(13);sw.setChecked(checked);sw.setPadding(0,dp(8),0,dp(5));return sw;}
    private Spinner spinner(String[] values){Spinner s=new Spinner(this);ArrayAdapter<String>a=new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,values);s.setAdapter(a);return s;}
    private GradientDrawable round(int color,int radiusDp,int strokeDp,int strokeColor){GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(dp(radiusDp));if(strokeDp>0)g.setStroke(dp(strokeDp),strokeColor);return g;}
    private LinearLayout.LayoutParams cardParams(){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT);p.bottomMargin=dp(12);return p;}
    private LinearLayout.LayoutParams match(int h){return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,h);}
    private LinearLayout.LayoutParams matchWrap(){return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT);}
    private int dp(float v){return Math.round(v*getResources().getDisplayMetrics().density);}
}
