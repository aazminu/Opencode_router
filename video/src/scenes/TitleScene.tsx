import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { inter, mono } from "../fonts";

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Title"
      style={{
        backgroundColor: "#0A0E14",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        fontFamily: inter,
      }}
    >
      <Interactive.Div
        name="Wordmark"
        style={{
          fontFamily: mono,
          fontSize: 170,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          color: "#FFFFFF",
          opacity: interpolate(frame, [4, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [4, 24], [0.92, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
        }}
      >
        opencode<span style={{ color: "#2DD4BF" }}>-router</span>
      </Interactive.Div>
      <Interactive.Div
        name="Underline"
        style={{
          height: 10,
          borderRadius: 5,
          marginTop: 12,
          backgroundColor: "#2DD4BF",
          width: interpolate(frame, [14, 34], [0, 1240], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />
      <Interactive.Div
        name="Subtitle"
        style={{
          marginTop: 64,
          fontSize: 78,
          fontWeight: 600,
          color: "#C9D1D9",
          opacity: interpolate(frame, [26, 40], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Automatic model routing for OpenCode
      </Interactive.Div>
      <Interactive.Div
        name="Plans"
        style={{
          marginTop: 20,
          fontSize: 78,
          fontWeight: 600,
          color: "#2DD4BF",
          opacity: interpolate(frame, [36, 50], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Go · Go Plus · Free
      </Interactive.Div>
    </AbsoluteFill>
  );
};
