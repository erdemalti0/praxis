import { useUIStore } from "../../stores/uiStore";
import TimelineEntry from "./TimelineEntry";
import { Clock } from "lucide-react";

export default function Timeline() {
  const entries = useUIStore((s) => s.historyEntries);

  if (entries.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-2 py-4"
        style={{ color: "var(--vp-text-faint)" }}
      >
        <Clock size={20} />
        <p className="text-xs">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto h-full py-1">
      {entries.slice(0, 100).map((entry, i) => (
        <TimelineEntry key={`${entry.sessionId}-${entry.timestamp}-${i}`} entry={entry} />
      ))}
    </div>
  );
}
