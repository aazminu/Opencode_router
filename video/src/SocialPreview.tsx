import { AbsoluteFill } from "remotion";
import { inter, mono } from "./fonts";

// GitHub social preview: 1280 x 640. All content stays at least 64px from each edge.
const BAR_WIDTH = 880;
const LIMIT = 0.85;

export const SocialPreview: React.FC = () => {
  return (
    <AbsoluteFill
      name="SocialPreview"
      style={{
        backgroundColor: "#0A0E14",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        fontFamily: inter,
        padding: 64,
      }}
    >
      <div style={{ fontFamily: mono, fontSize: 100, fontWeight: 700, lineHeight: 1.1, color: "#FFFFFF" }}>
        opencode<span style={{ color: "#2DD4BF" }}>-router</span>
      </div>
      <div style={{ marginTop: 14, fontSize: 40, fontWeight: 600, lineHeight: 1.25, color: "#FFFFFF" }}>
        Switch models before you hit your OpenCode limit.
      </div>
      <div
        style={{
          width: 960,
          marginTop: 30,
          padding: "26px 40px 30px",
          backgroundColor: "#11161D",
          border: "2px solid #263040",
          borderRadius: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 600, color: "#8B98A9" }}>build agent</div>
          <div
            style={{
              padding: "4px 18px",
              borderRadius: 20,
              fontSize: 22,
              fontWeight: 600,
              color: "#D29922",
              backgroundColor: "rgba(210, 153, 34, 0.14)",
              border: "2px solid rgba(210, 153, 34, 0.5)",
            }}
          >
            failover
          </div>
        </div>
        <div style={{ marginTop: 12, fontFamily: mono, fontSize: 34, fontWeight: 700, color: "#FFFFFF" }}>
          glm-5.3-flash <span style={{ color: "#2DD4BF" }}>→</span> deepseek-v4.1-flash
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginTop: 18,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 600, color: "#8B98A9" }}>5-hour use</div>
          <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: "#D29922" }}>85%</div>
        </div>
        <div
          style={{
            position: "relative",
            width: BAR_WIDTH,
            height: 22,
            marginTop: 10,
            borderRadius: 11,
            backgroundColor: "#1C2430",
          }}
        >
          <div style={{ width: BAR_WIDTH * LIMIT, height: 22, borderRadius: 11, backgroundColor: "#D29922" }} />
          <div
            style={{
              position: "absolute",
              left: BAR_WIDTH * LIMIT - 2,
              top: -8,
              width: 4,
              height: 38,
              borderRadius: 2,
              backgroundColor: "#FFFFFF",
            }}
          />
        </div>
      </div>
      <div style={{ marginTop: 24, fontSize: 28, fontWeight: 600, color: "#8B98A9" }}>
        Go · Go Plus · Free
        <span style={{ margin: "0 18px", color: "#3A4658" }}>|</span>
        <span style={{ fontFamily: mono, fontWeight: 400 }}>@s-berdia/opencode-router</span>
      </div>
    </AbsoluteFill>
  );
};
