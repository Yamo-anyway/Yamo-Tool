// src/Launcher.tsx
import React from "react";
import "./styles.css";

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

  // ✅ 1번: PM100 Tool (Discovery + Setup 통합 화면)
  slots[0] = {
    title: "PM100 Tool",
    enabled: true,
    onClick: () => (window.location.hash = "#/pm100-tool?slot=0"),
  };

  // ✅ 19번: PM100 Discovery (기존)
  slots[18] = {
    title: "PM100 Discovery",
    enabled: true,
    onClick: () => (window.location.hash = "#/pm100-discovery?slot=18"),
  };

  // ✅ 20번: PM100 Setup (기존)
  slots[19] = {
    title: "PM100 Setup",
    enabled: true,
    onClick: () => (window.location.hash = "#/pm100-setup?slot=19"),
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
