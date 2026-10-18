import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  interpolateColors,
  useCurrentFrame,
} from "remotion";
import { inter, mono } from "../fonts";

export const FailoverScene: React.FC = () => {
  const frame = useCurrentFrame();
  const usage = Math.round(
    interpolate(frame, [30, 108, 124, 168, 184], [8, 85, 6, 15, 2], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const usageColor = interpolateColors(frame, [84, 96, 110, 124], ["#3FB950", "#D29922", "#D29922", "#3FB950"]);

  return (
    <AbsoluteFill
      name="Failover"
      style={{
        backgroundColor: "#0A0E14",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        fontFamily: inter,
      }}
    >
      <Interactive.Div
        name="Headline"
        style={{
          fontSize: 150,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          color: "#FFFFFF",
          opacity: interpolate(frame, [0, 14], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0, 14], ["0px 30px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Switches early.
      </Interactive.Div>
      <Interactive.Div
        name="Agent card"
        style={{
          width: 1400,
          marginTop: 56,
          padding: "52px 80px 40px",
          backgroundColor: "#11161D",
          border: "2px solid #263040",
          borderRadius: 28,
          boxShadow: "0 40px 120px rgba(0, 0, 0, 0.55)",
          opacity: interpolate(frame, [10, 24], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [10, 26], ["0px 40px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 56, fontWeight: 600, color: "#8B98A9" }}>build agent</div>
          <div style={{ position: "relative", width: 340, height: 84 }}>
            <Interactive.Div
              name="Healthy chip"
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                height: 84,
                padding: "0 36px",
                borderRadius: 42,
                display: "flex",
                alignItems: "center",
                fontSize: 44,
                fontWeight: 600,
                color: "#3FB950",
                backgroundColor: "rgba(63, 185, 80, 0.14)",
                border: "2px solid rgba(63, 185, 80, 0.5)",
                opacity: interpolate(frame, [110, 118, 176, 184], [1, 0, 0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              healthy
            </Interactive.Div>
            <Interactive.Div
              name="Failover chip"
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                height: 84,
                padding: "0 36px",
                borderRadius: 42,
                display: "flex",
                alignItems: "center",
                fontSize: 44,
                fontWeight: 600,
                color: "#D29922",
                backgroundColor: "rgba(210, 153, 34, 0.14)",
                border: "2px solid rgba(210, 153, 34, 0.5)",
                opacity: interpolate(frame, [112, 120, 170, 178], [0, 1, 1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              failover
            </Interactive.Div>
          </div>
        </div>
        <div style={{ position: "relative", height: 124, marginTop: 20, overflow: "hidden", fontFamily: mono }}>
          <Interactive.Div
            name="First model"
            style={{
              position: "absolute",
              left: 0,
              top: 8,
              fontSize: 84,
              fontWeight: 700,
              color: "#FFFFFF",
              opacity: interpolate(frame, [110, 124, 170, 184], [1, 0, 0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(
                frame,
                [110, 124, 125, 170, 184],
                ["0px 0px", "0px -120px", "0px 120px", "0px 120px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                },
              ),
            }}
          >
            glm-5.3-flash
          </Interactive.Div>
          <Interactive.Div
            name="Next model"
            style={{
              position: "absolute",
              left: 0,
              top: 8,
              fontSize: 84,
              fontWeight: 700,
              color: "#FFFFFF",
              opacity: interpolate(frame, [110, 124, 170, 184], [0, 1, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(
                frame,
                [110, 124, 170, 184],
                ["0px 120px", "0px 0px", "0px 0px", "0px -120px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                },
              ),
            }}
          >
            deepseek-v4.1-flash
          </Interactive.Div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginTop: 24,
          }}
        >
          <div style={{ fontSize: 44, fontWeight: 600, color: "#8B98A9" }}>5-hour use</div>
          <div style={{ fontFamily: mono, fontSize: 64, fontWeight: 700, color: usageColor }}>{usage}%</div>
        </div>
        <div
          style={{
            position: "relative",
            width: 1240,
            height: 56,
            marginTop: 16,
            borderRadius: 28,
            backgroundColor: "#1C2430",
          }}
        >
          <Interactive.Div
            name="Usage bar"
            style={{
              height: 56,
              borderRadius: 28,
              backgroundColor: usageColor,
              width: interpolate(frame, [30, 108, 124, 168, 184], [99, 1054, 74, 186, 25], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 1051,
              top: -14,
              width: 6,
              height: 84,
              borderRadius: 3,
              backgroundColor: "#D29922",
            }}
          />
        </div>
        <div
          style={{
            position: "relative",
            height: 56,
            marginTop: 14,
            fontFamily: mono,
            fontSize: 36,
            color: "#D29922",
          }}
        >
          <div style={{ position: "absolute", left: 1054, translate: "-50% 0px" }}>85%</div>
        </div>
      </Interactive.Div>
      <div style={{ position: "relative", width: 1640, height: 110, marginTop: 48 }}>
        <Interactive.Div
          name="Switch caption"
          style={{
            position: "absolute",
            width: 1640,
            textAlign: "center",
            fontSize: 78,
            fontWeight: 600,
            color: "#FFFFFF",
            opacity: interpolate(frame, [40, 52, 160, 170], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          At 85%, it moves to the next model.
        </Interactive.Div>
        <Interactive.Div
          name="Reset caption"
          style={{
            position: "absolute",
            width: 1640,
            textAlign: "center",
            fontSize: 78,
            fontWeight: 600,
            color: "#FFFFFF",
            opacity: interpolate(frame, [172, 184], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          After the 5-hour reset, it moves back.
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
