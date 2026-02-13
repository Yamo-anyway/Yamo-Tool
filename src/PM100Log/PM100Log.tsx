import React, { useEffect, useRef, useState } from "react";
import "./styles.css";

export default function PM100Log() {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // ✅ 1회만: 초기 로드 + 구독
  useEffect(() => {
    if (!window.api?.pm100?.tool?.log) return; // preload 실패해도 화면 안 죽게

    let off: undefined | (() => void);

    (async () => {
      try {
        const t = await window.api.pm100.tool.log.getAll();
        setText(t ?? "");
      } catch {
        // ignore
      }

      off = window.api.pm100.tool.log.onUpdated((allText) => {
        setText(allText ?? "");
      });
    })();

    return () => off?.();
  }, []);

  // ✅ 자동 스크롤
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);

  if (!window.api?.pm100?.tool?.log) {
    return (
      <div className="pmLogRoot">
        <div className="pmLogTop">
          <button className="pmBtnSmall" onClick={() => window.close()}>
            Close
          </button>
        </div>
        <div style={{ opacity: 0.8 }}>
          window.api not available (preload load failed)
        </div>
      </div>
    );
  }

  return (
    <div className="pmLogRoot">
      <div className="pmLogTop">
        <button className="pmBtnSmall" onClick={() => window.close()}>
          Close
        </button>

        <button
          className="pmBtnSmall"
          style={{ marginLeft: 10 }}
          onClick={() => window.api.pm100.tool.log.clear()}
        >
          Clear Log
        </button>
      </div>

      <textarea
        ref={ref}
        className="pmLogArea"
        value={text}
        readOnly
        placeholder="Logs..."
      />
    </div>
  );
}
