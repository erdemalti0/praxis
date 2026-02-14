export type LayoutNode =
  | { type: "leaf"; sessionId: string | null }
  | {
      type: "split";
      direction: "horizontal" | "vertical";
      ratio: number;
      children: [LayoutNode, LayoutNode];
    };
