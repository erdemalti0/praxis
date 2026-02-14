import Timeline from "../timeline/Timeline";
import { Activity } from "lucide-react";

export default function BottomPanel() {
  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: "transparent" }}
    >
      <div
        className="px-4 py-2.5 flex items-center gap-2 shrink-0"
        style={{ borderBottom: "1px solid var(--vp-border-strong)" }}
      >
        <Activity size={13} style={{ color: "var(--vp-text-muted)" }} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--vp-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Timeline
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1">
        <Timeline />
      </div>
    </div>
  );
}
