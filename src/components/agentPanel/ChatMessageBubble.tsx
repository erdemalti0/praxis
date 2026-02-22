import { useState } from "react";
import type { ChatMessage, ContentBlock } from "../../types/agentPanel";
import { AGENT_CONFIGS } from "../../types/agentPanel";
import TextBlock from "./blocks/TextBlock";
import ThinkingBlock from "./blocks/ThinkingBlock";
import BashBlock from "./blocks/BashBlock";
import FileDiffBlock from "./blocks/FileDiffBlock";
import FileReadBlock from "./blocks/FileReadBlock";
import ToolUseBlock from "./blocks/ToolUseBlock";
import ErrorBlock from "./blocks/ErrorBlock";
import {
  User,
  Loader,
  ChevronRight,
  FileText,
  Terminal,
  Wrench,
  FileEdit,
} from "lucide-react";

/** Block types that represent tool operations */
const TOOL_BLOCK_TYPES = new Set([
  "tool_use",
  "tool_result",
  "file_read",
  "bash_command",
  "file_edit",
  "file_write",
]);

function isToolBlock(block: ContentBlock): boolean {
  return TOOL_BLOCK_TYPES.has(block.type);
}

/** Summarize a tool block into a compact one-liner */
function getToolSummary(block: ContentBlock): {
  icon: React.ReactNode;
  label: string;
  detail: string;
} {
  switch (block.type) {
    case "file_read":
      return {
        icon: <FileText size={12} color="var(--vp-accent-blue)" />,
        label: "Read",
        detail: block.path.split("/").pop() || block.path,
      };
    case "bash_command":
      return {
        icon: <Terminal size={12} color="var(--vp-accent-purple)" />,
        label: "Bash",
        detail:
          block.command.length > 60
            ? block.command.slice(0, 60) + "..."
            : block.command,
      };
    case "file_edit":
      return {
        icon: <FileEdit size={12} color="var(--vp-accent-amber)" />,
        label: "Edit",
        detail: block.path.split("/").pop() || block.path,
      };
    case "file_write":
      return {
        icon: <FileEdit size={12} color="var(--vp-accent-green-bright)" />,
        label: "Write",
        detail: block.path.split("/").pop() || block.path,
      };
    case "tool_use":
      return {
        icon: <Wrench size={12} color="var(--vp-accent-amber)" />,
        label: block.tool,
        detail: "",
      };
    case "tool_result":
      return {
        icon: <Wrench size={12} color="var(--vp-text-muted)" />,
        label: "Result",
        detail: block.output?.slice(0, 50) || "",
      };
    default:
      return { icon: null, label: "", detail: "" };
  }
}

// ─── Group types ────────────────────────────────────────────
type BlockGroup =
  | { type: "block"; block: ContentBlock }
  | { type: "activity"; blocks: ContentBlock[] };

/**
 * Simple grouping:
 *  - Text, thinking, error → always standalone (always visible)
 *  - 3+ consecutive tool blocks → collapsed activity group
 *  - 1-2 consecutive tool blocks → shown individually
 */
function groupBlocks(blocks: ContentBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    if (isToolBlock(block)) {
      // Collect consecutive tool blocks
      const toolBlocks: ContentBlock[] = [];
      while (i < blocks.length && isToolBlock(blocks[i])) {
        toolBlocks.push(blocks[i]);
        i++;
      }
      if (toolBlocks.length >= 3) {
        // Collapse into activity group
        groups.push({ type: "activity", blocks: toolBlocks });
      } else {
        // Show individually
        for (const tb of toolBlocks) {
          groups.push({ type: "block", block: tb });
        }
      }
    } else {
      // Text, thinking, error — always show
      groups.push({ type: "block", block });
      i++;
    }
  }

  return groups;
}

/** Collapsible activity group */
function ActivityGroup({ blocks }: { blocks: ContentBlock[] }) {
  const [expanded, setExpanded] = useState(false);

  const editCount = blocks.filter(
    (b) => b.type === "file_edit" || b.type === "file_write",
  ).length;
  const readCount = blocks.filter((b) => b.type === "file_read").length;
  const bashCount = blocks.filter((b) => b.type === "bash_command").length;
  const otherCount = blocks.length - editCount - readCount - bashCount;

  const parts: string[] = [];
  if (readCount > 0) parts.push(`${readCount} read`);
  if (bashCount > 0) parts.push(`${bashCount} command`);
  if (editCount > 0) parts.push(`${editCount} edit`);
  if (otherCount > 0) parts.push(`${otherCount} other`);

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid var(--vp-border-subtle)",
        background: "var(--vp-bg-surface)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--vp-text-dim)",
          fontSize: 12,
          textAlign: "left",
        }}
      >
        <ChevronRight
          size={14}
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 150ms",
            flexShrink: 0,
          }}
        />
        <Wrench size={14} style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 500, color: "var(--vp-text-secondary)" }}>
          {blocks.length} operations
        </span>
        <span style={{ color: "var(--vp-text-dim)", fontSize: 11 }}>
          ({parts.join(", ")})
        </span>
      </button>

      {/* Collapsed: compact preview */}
      {!expanded && (
        <div
          style={{
            padding: "0 12px 8px 36px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {blocks.slice(0, 5).map((block, idx) => {
            const summary = getToolSummary(block);
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: "var(--vp-text-dim)",
                  lineHeight: 1.4,
                }}
              >
                {summary.icon}
                <span style={{ fontWeight: 500, minWidth: 36 }}>
                  {summary.label}
                </span>
                <span
                  style={{
                    fontFamily: "var(--vp-font-mono, monospace)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {summary.detail}
                </span>
              </div>
            );
          })}
          {blocks.length > 5 && (
            <span
              style={{
                fontSize: 11,
                color: "var(--vp-text-dim)",
                paddingLeft: 18,
              }}
            >
              +{blocks.length - 5} more...
            </span>
          )}
        </div>
      )}

      {/* Expanded: full tool blocks */}
      {expanded && (
        <div
          style={{
            padding: "8px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            borderTop: "1px solid var(--vp-border-subtle)",
          }}
        >
          {blocks.map((block, idx) => (
            <ContentBlockRenderer key={idx} block={block} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContentBlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "text":
      return <TextBlock text={block.text} />;
    case "thinking":
      return <ThinkingBlock text={block.text} />;
    case "bash_command":
      return (
        <BashBlock
          command={block.command}
          output={block.output}
          exitCode={block.exitCode}
        />
      );
    case "file_edit":
      return (
        <FileDiffBlock
          path={block.path}
          diff={block.diff}
          language={block.language}
        />
      );
    case "file_write":
      return (
        <FileDiffBlock
          path={block.path}
          diff={`+++ ${block.path}\n${block.content
            .split("\n")
            .map((l) => `+ ${l}`)
            .join("\n")}`}
          language={block.language}
        />
      );
    case "file_read":
      return (
        <FileReadBlock
          path={block.path}
          content={block.content}
          lineCount={block.lineCount}
        />
      );
    case "tool_use":
      return <ToolUseBlock tool={block.tool} input={block.input} />;
    case "tool_result":
      return null;
    case "error":
      return <ErrorBlock message={block.message} />;
    default:
      return null;
  }
}

export default function ChatMessageBubble({
  message,
}: {
  message: ChatMessage;
}) {
  const isUser = message.role === "user";
  const config = AGENT_CONFIGS[message.agentId];
  const groups = groupBlocks(message.blocks);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 16px",
        borderBottom: "1px solid var(--vp-border-subtle)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isUser
              ? "var(--vp-bg-surface-hover)"
              : `${config.color}20`,
            color: isUser ? "var(--vp-text-dim)" : config.color,
          }}
        >
          {isUser ? (
            <User size={14} />
          ) : config.logo ? (
            <img src={config.logo} alt={config.label} style={{ width: 16, height: 16, objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: 11, fontWeight: 600 }}>
              {config.label[0]}
            </span>
          )}
        </div>
        <span style={{ fontWeight: 500, color: "var(--vp-text-primary)" }}>
          {isUser ? "You" : config.label}
        </span>
        {message.model && (
          <span style={{ color: "var(--vp-text-dim)", fontSize: 11 }}>
            {message.model}
          </span>
        )}
        {message.isStreaming && (
          <Loader
            size={12}
            className="animate-spin"
            style={{ color: config.color }}
          />
        )}
        <span
          style={{
            marginLeft: "auto",
            color: "var(--vp-text-dim)",
            fontSize: 11,
          }}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {message.costUsd !== undefined && message.costUsd > 0 && (
          <span style={{ color: "var(--vp-text-dim)", fontSize: 11 }}>
            ${message.costUsd.toFixed(4)}
          </span>
        )}
      </div>

      {/* Content blocks — grouped */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingLeft: 32,
        }}
      >
        {groups.map((group, i) => {
          if (group.type === "activity") {
            return <ActivityGroup key={i} blocks={group.blocks} />;
          }
          return <ContentBlockRenderer key={i} block={group.block} />;
        })}
      </div>
    </div>
  );
}
