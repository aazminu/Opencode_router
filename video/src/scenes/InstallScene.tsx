import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { inter, mono } from "../fonts";

export const InstallScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Install"
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
        One line to install.
      </Interactive.Div>
      <Interactive.Div
        name="Config line"
        style={{
          marginTop: 64,
          padding: "44px 60px",
          fontFamily: mono,
          fontSize: 60,
          whiteSpace: "pre",
          color: "#E6EDF3",
          backgroundColor: "#11161D",
          border: "2px solid #263040",
          borderRadius: 28,
          boxShadow: "0 40px 120px rgba(0, 0, 0, 0.55)",
          opacity: interpolate(frame, [14, 28], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [14, 30], [0.96, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <span style={{ color: "#79C0FF" }}>"plugin"</span>: [<span style={{ color: "#2DD4BF" }}>"@s-berdia/opencode-router"</span>]
      </Interactive.Div>
      <Interactive.Div
        name="Next step"
        style={{
          marginTop: 56,
          fontSize: 78,
          fontWeight: 600,
          color: "#C9D1D9",
          opacity: interpolate(frame, [38, 52], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Then type <span style={{ fontFamily: mono, color: "#FFFFFF" }}>/refresh-routing</span>
      </Interactive.Div>
      <Interactive.Div
        name="Repo link"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          marginTop: 72,
          fontSize: 64,
          fontWeight: 600,
          color: "#2DD4BF",
          opacity: interpolate(frame, [66, 80], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [66, 80], ["0px 24px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <svg width={64} height={64} viewBox="0 0 24 24">
          <path
            fill="#2DD4BF"
            d="M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.08 1.12-6.54L2.5 9.41l6.56-.95L12 2.5z"
          />
        </svg>
        github.com/s-berdia/Opencode_router
      </Interactive.Div>
    </AbsoluteFill>
  );
};
