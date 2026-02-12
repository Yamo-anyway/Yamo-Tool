import React from "react";

const COLS = 5;
const ROWS = 4;
const TOTAL = COLS * ROWS;

function iconSvgDataUri(label: string) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
    <rect x="6" y="6" width="84" height="84" rx="18" fill="#4a6cff"/>
    <text x="48" y="56" text-anchor="middle" font-size="22" fill="white"
      font-family="system-ui, -apple-system">
      ${label}
    </text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function Launcher() {
  const items = Array.from({ length: TOTAL }, (_, i) => ({
    i,
    title: `Slot ${i + 1}`,
    icon: iconSvgDataUri(String(i + 1)),
  }));

  const onClickSlot = (idx: number) => {
    if (idx !== 0) return; // ✅ 슬롯 1(인덱스 0)만 동작
    window.location.hash = `#/discovery?slot=${idx}`;
  };

  return (
    <div className="launcher">
      <div className="header">
        <div className="title">UDP Tools Launcher</div>
        <div className="sub">현재는 Slot 1만 동작합니다.</div>
      </div>

      <div className="grid">
        {items.map((it) => {
          const enabled = it.i === 0;
          return (
            <button
              key={it.i}
              className={`tile ${enabled ? "" : "tileDisabled"}`}
              onClick={() => onClickSlot(it.i)}
              disabled={!enabled}
              title={enabled ? "Open PM100 Discovery" : "준비중"}
            >
              <img className="icon" src={it.icon} alt={it.title} />
              <div className="label">{it.title}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
