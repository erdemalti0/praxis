export type LayoutNode =
  | { type: "leaf"; sessionId: string | null }
  | {
      type: "split";
      direction: "horizontal" | "vertical";
      ratio: number;
      children: [LayoutNode, LayoutNode];
    };

/** MIME type for internal pane drag-and-drop (avoids conflict with file/text drops) */
export const PANE_DRAG_MIME = "application/x-praxis-pane";

/** Data carried during a pane drag operation */
export interface PaneDragData {
  sessionId: string;
  sourceGroupId: string;
  sourceWorkspaceId: string;
}
