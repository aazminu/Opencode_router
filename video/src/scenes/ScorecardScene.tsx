import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { inter } from "../fonts";
import { TerminalWindow } from "../TerminalWindow";

const COMMAND = "/refresh-routing";

export const ScorecardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = Math.round(
    interpolate(frame, [8, 36], [0, COMMAND.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const cursorVisible = frame < 44 && Math.floor(frame / 8) % 2 === 0;

  return (
    <AbsoluteFill
      name="Scorecard"
      style={{
        backgroundColor: "#0A0E14",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        fontFamily: inter,
      }}
    >
      <Interactive.Div
        name="Terminal"
        style={{
          width: 1640,
          opacity: interpolate(frame, [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <TerminalWindow>
          <div style={{ fontSize: 60, lineHeight: 1.55 }}>
            <span style={{ color: "#2DD4BF", fontWeight: 700 }}>&gt; </span>
            {COMMAND.slice(0, typed)}
            <span style={{ color: "#2DD4BF", opacity: cursorVisible ? 1 : 0 }}>▌</span>
          </div>
          <Interactive.Div
            name="Header row"
            style={{
              display: "grid",
              gridTemplateColumns: "320px 1fr 170px",
              marginTop: 24,
              fontSize: 40,
              lineHeight: 1.6,
              color: "#8B98A9",
              opacity: interpolate(frame, [46, 54], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div>ROLE</div>
            <div>MODEL</div>
            <div style={{ textAlign: "right" }}>SCORE</div>
          </Interactive.Div>
          <Interactive.Div
            name="Plan row"
            style={{
              display: "grid",
              gridTemplateColumns: "320px 1fr 170px",
              fontSize: 60,
              lineHeight: 1.55,
              opacity: interpolate(frame, [54, 62], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(frame, [54, 64], ["-30px 0px", "0px 0px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <div style={{ color: "#79C0FF" }}>plan</div>
            <div>deepseek-v4.1-flash</div>
            <div style={{ textAlign: "right", color: "#3FB950" }}>83.5</div>
          </Interactive.Div>
          <Interactive.Div
            name="Build row"
            style={{
              display: "grid",
              gridTemplateColumns: "320px 1fr 170px",
              fontSize: 60,
              lineHeight: 1.55,
              opacity: interpolate(frame, [62, 70], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(frame, [62, 72], ["-30px 0px", "0px 0px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <div style={{ color: "#79C0FF" }}>build</div>
            <div>glm-5.3-flash</div>
            <div style={{ textAlign: "right", color: "#3FB950" }}>84.2</div>
          </Interactive.Div>
          <Interactive.Div
            name="General row"
            style={{
              display: "grid",
              gridTemplateColumns: "320px 1fr 170px",
              fontSize: 60,
              lineHeight: 1.55,
              opacity: interpolate(frame, [70, 78], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(frame, [70, 80], ["-30px 0px", "0px 0px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <div style={{ color: "#79C0FF" }}>general</div>
            <div>glm-5.3-flash</div>
            <div style={{ textAlign: "right", color: "#3FB950" }}>85.3</div>
          </Interactive.Div>
          <Interactive.Div
            name="Explore row"
            style={{
              display: "grid",
              gridTemplateColumns: "320px 1fr 170px",
              fontSize: 60,
              lineHeight: 1.55,
              opacity: interpolate(frame, [78, 86], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(frame, [78, 88], ["-30px 0px", "0px 0px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <div style={{ color: "#79C0FF" }}>explore</div>
            <div>nemotron-3.5-lightning-free</div>
            <div style={{ textAlign: "right", color: "#3FB950" }}>95.8</div>
          </Interactive.Div>
        </TerminalWindow>
      </Interactive.Div>
      <Interactive.Div
        name="Caption"
        style={{
          marginTop: 56,
          fontSize: 78,
          fontWeight: 600,
          color: "#FFFFFF",
          opacity: interpolate(frame, [100, 114], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [100, 114], ["0px 24px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        The best model for each agent.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
