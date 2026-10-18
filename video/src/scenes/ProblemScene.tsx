import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { inter } from "../fonts";
import { TerminalWindow } from "../TerminalWindow";

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Problem"
      style={{
        backgroundColor: "#0A0E14",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: inter,
      }}
    >
      <Interactive.Div
        name="Terminal"
        style={{
          width: 1640,
          opacity: interpolate(frame, [0, 12, 72, 88], [0, 1, 1, 0.07], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [72, 88], [1, 0.94], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      >
        <TerminalWindow>
          <Interactive.Div
            name="Prompt line"
            style={{
              fontSize: 56,
              lineHeight: 1.6,
              opacity: interpolate(frame, [4, 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <span style={{ color: "#2DD4BF", fontWeight: 700 }}>&gt; build </span>refactor the auth module
          </Interactive.Div>
          <Interactive.Div
            name="Working line"
            style={{
              fontSize: 56,
              lineHeight: 1.6,
              color: "#8B98A9",
              opacity: interpolate(frame, [14, 24], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {"  glm-5.3-flash · working..."}
          </Interactive.Div>
          <Interactive.Div
            name="Error line"
            style={{
              fontSize: 56,
              lineHeight: 1.6,
              fontWeight: 700,
              color: "#F85149",
              opacity: interpolate(frame, [34, 38], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(
                frame,
                [34, 36, 38, 40, 42, 44],
                ["0px 0px", "-14px 0px", "14px 0px", "-8px 0px", "8px 0px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ),
            }}
          >
            {"Error: rate limit reached (429)"}
          </Interactive.Div>
          <Interactive.Div
            name="Retry line"
            style={{
              fontSize: 56,
              lineHeight: 1.6,
              color: "#F85149",
              opacity: interpolate(frame, [42, 50], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {"Try again in 4h 12m."}
          </Interactive.Div>
        </TerminalWindow>
      </Interactive.Div>
      <Interactive.Div
        name="Headline"
        style={{
          position: "absolute",
          fontSize: 150,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          color: "#FFFFFF",
          opacity: interpolate(frame, [80, 94], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [80, 94], ["0px 40px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Your agent stops.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
