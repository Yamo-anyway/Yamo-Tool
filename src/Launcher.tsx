// src/Launcher.tsx
import styled from "@emotion/styled";
import { Button } from "@mui/material";

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

  return (
    <div
      style={{
        minWidth: "950px",
        maxWidth: "950px",
        width: "950px",
        minHeight: "700px",
        maxHeight: "700px",
        height: "700px",
        padding: "30px",
      }}
    >
      {slots?.map((s, idx) => {
        if (s.enabled) {
          return (
            <StyledButton
              key={idx}
              onClick={s.onClick}
              title={s.enabled ? s.title : "Not available"}
            >
              {s.title}
            </StyledButton>
          );
        }
      })}
    </div>
  );
}

const StyledButton = styled(Button)`
  border: 1px solid #ffffff;
  text-transform: none;
  margin-right: 10px;

  height: 40px;
`;
