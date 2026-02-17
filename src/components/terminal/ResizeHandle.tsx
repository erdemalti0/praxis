import { useState, useCallback } from "react";

interface ResizeHandleProps {
  direction: "horizontal" | "vertical";
  onResize: (ratio: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export default function ResizeHandle({ direction, onResize, containerRef }: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const isHorizontal = direction === "horizontal";

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(true);

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const containerSize = isHorizontal ? rect.width : rect.height;
      const containerStart = isHorizontal ? rect.left : rect.top;

      const handleMouseMove = (ev: MouseEvent) => {
        const currentPos = isHorizontal ? ev.clientX : ev.clientY;
        const newRatio = (currentPos - containerStart) / containerSize;
        const clamped = Math.min(0.85, Math.max(0.15, newRatio));
        onResize(clamped);
      };

      const handleMouseUp = () => {
        setDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [direction, onResize, containerRef, isHorizontal]
  );

  const bgColor = dragging
    ? "var(--vp-accent-blue-glow)"
    : hovered
      ? "var(--vp-border-medium)"
      : "transparent";

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0,
        width: isHorizontal ? 4 : "100%",
        height: isHorizontal ? "100%" : 4,
        cursor: isHorizontal ? "col-resize" : "row-resize",
        background: bgColor,
        transition: dragging ? "none" : "background 0.15s",
        zIndex: 5,
      }}
    />
  );
}
