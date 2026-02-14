export function Skeleton({ width, height, borderRadius = 4 }: { width?: number | string; height?: number | string; borderRadius?: number }) {
  return (
    <div
      style={{
        width: width || "100%",
        height: height || 16,
        borderRadius,
        background: "var(--vp-bg-surface-hover)",
        animation: "skeletonPulse 1.5s ease-in-out infinite",
      }}
    />
  );
}
