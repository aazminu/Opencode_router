import { mono } from "./fonts";

export const TerminalWindow: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div
      style={{
        width: "100%",
        backgroundColor: "#11161D",
        border: "2px solid #263040",
        borderRadius: 28,
        overflow: "hidden",
        boxShadow: "0 40px 120px rgba(0, 0, 0, 0.55)",
        fontFamily: mono,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          height: 72,
          paddingLeft: 32,
          backgroundColor: "#161C25",
          borderBottom: "2px solid #263040",
        }}
      >
        <div style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#FF5F57" }} />
        <div style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#FEBC2E" }} />
        <div style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#28C840" }} />
        <div style={{ marginLeft: 24, fontSize: 30, color: "#8B98A9" }}>~/my-app — opencode</div>
      </div>
      <div style={{ padding: "44px 60px 52px", color: "#E6EDF3", whiteSpace: "pre" }}>{children}</div>
    </div>
  );
};
