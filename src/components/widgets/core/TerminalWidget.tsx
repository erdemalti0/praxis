import MainPanel from "../../layout/MainPanel";

export default function TerminalWidget() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <MainPanel />
    </div>
  );
}
