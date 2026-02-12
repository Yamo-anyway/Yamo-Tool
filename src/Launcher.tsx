// src/Launcher.tsx
import React from "react";
import "./styles.css"; // 기존 런처 스타일 쓰는 파일

type Slot = {
  title: string;
  enabled: boolean;
  onClick?: () => void;
};

export default function Launcher() {
  const slots: Slot[] = Array.from({ length: 20 }).map((_, i) => ({
    title: `Slot ${i + 1}`,
    enabled: false,
  }));

  // ✅ 1번: PM100 Discovery (기존)
  slots[0] = {
    title: "PM100 Discovery",
    enabled: true,
    onClick: () => (window.location.hash = "#/pm100-discovery?slot=0"),
  };

  // ✅ 2번: PM100 Setup (신규)
  slots[1] = {
    title: "PM100 Setup",
    enabled: true,
    onClick: () => (window.location.hash = "#/pm100-setup?slot=1"),
  };

  return (
    <div className="launcher">
      <div className="grid">
        {slots.map((s, idx) => (
          <button
            key={idx}
            className={`slot ${s.enabled ? "" : "disabled"}`}
            disabled={!s.enabled}
            onClick={s.onClick}
            title={s.enabled ? s.title : "Not available"}
          >
            <div className="slotInner">
              <div className="slotIcon" />
              <div className="slotTitle">{s.title}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
