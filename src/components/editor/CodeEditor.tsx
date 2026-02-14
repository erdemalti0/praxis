import { useRef, useEffect, useCallback } from "react";
import hljs from "highlight.js";
import { useEditorStore } from "../../stores/editorStore";

interface CodeEditorProps {
  filePath: string;
  content: string;
  language: string;
}

const FONT = '"SF Mono", "Fira Code", "JetBrains Mono", "Consolas", "Monaco", monospace';
const FONT_SIZE = 13;
const LINE_HEIGHT = 20;
const PADDING = 16;

export default function CodeEditor({ filePath, content, language }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const updateContent = useEditorStore((s) => s.updateContent);
  const saveActiveFile = useEditorStore((s) => s.saveActiveFile);

  const lines = content.split("\n");
  const lineCount = lines.length;

  // Sync scroll between textarea, highlight overlay, and line numbers
  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = ta.scrollTop;
    }
  }, []);

  // Highlight code
  const highlighted = (() => {
    try {
      if (language !== "plaintext" && hljs.getLanguage(language)) {
        return hljs.highlight(content, { language }).value;
      }
    } catch { /* fallback */ }
    return hljs.highlightAuto(content).value;
  })();

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveActiveFile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveActiveFile]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateContent(filePath, e.target.value);
    },
    [filePath, updateContent]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Tab → insert 2 spaces
      if (e.key === "Tab") {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const val = ta.value;
        const newVal = val.substring(0, start) + "  " + val.substring(end);
        updateContent(filePath, newVal);
        // Restore cursor after React re-render
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
      }
    },
    [filePath, updateContent]
  );

  // Line number gutter width
  const gutterWidth = Math.max(40, String(lineCount).length * 9 + 24);

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--vp-bg-primary)", position: "relative" }}>
      {/* Line numbers */}
      <div
        ref={lineNumbersRef}
        style={{
          width: gutterWidth,
          flexShrink: 0,
          overflow: "hidden",
          background: "var(--vp-bg-secondary)",
          borderRight: "1px solid var(--vp-border-subtle)",
          paddingTop: PADDING,
          userSelect: "none",
        }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div
            key={i}
            style={{
              height: LINE_HEIGHT,
              lineHeight: `${LINE_HEIGHT}px`,
              fontSize: FONT_SIZE - 1,
              fontFamily: FONT,
              color: "var(--vp-line-number)",
              textAlign: "right",
              paddingRight: 12,
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* Editor area */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Syntax highlight overlay */}
        <pre
          ref={highlightRef}
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            margin: 0,
            padding: PADDING,
            fontFamily: FONT,
            fontSize: FONT_SIZE,
            lineHeight: `${LINE_HEIGHT}px`,
            color: "var(--vp-code-text)",
            overflow: "hidden",
            pointerEvents: "none",
            whiteSpace: "pre",
            wordWrap: "normal",
            background: "transparent",
            border: "none",
          }}
        >
          <code
            className={`hljs language-${language}`}
            dangerouslySetInnerHTML={{ __html: highlighted + "\n" }}
            style={{
              background: "transparent",
              padding: 0,
              fontFamily: FONT,
              fontSize: FONT_SIZE,
              lineHeight: `${LINE_HEIGHT}px`,
            }}
          />
        </pre>

        {/* Transparent textarea on top */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            margin: 0,
            padding: PADDING,
            fontFamily: FONT,
            fontSize: FONT_SIZE,
            lineHeight: `${LINE_HEIGHT}px`,
            color: "transparent",
            caretColor: "var(--vp-text-primary)",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            overflow: "auto",
            whiteSpace: "pre",
            wordWrap: "normal",
            WebkitTextFillColor: "transparent",
          }}
        />
      </div>

      {/* hljs dark theme inline styles */}
      <style>{`
        .hljs { color: #d4d4d4; }
        .hljs-keyword { color: #c586c0; }
        .hljs-built_in { color: #4ec9b0; }
        .hljs-type { color: #4ec9b0; }
        .hljs-literal { color: #569cd6; }
        .hljs-number { color: #b5cea8; }
        .hljs-string { color: #ce9178; }
        .hljs-template-variable { color: #ce9178; }
        .hljs-regexp { color: #d16969; }
        .hljs-title { color: #dcdcaa; }
        .hljs-title.function_ { color: #dcdcaa; }
        .hljs-title.class_ { color: #4ec9b0; }
        .hljs-comment { color: #6a9955; font-style: italic; }
        .hljs-doctag { color: #608b4e; }
        .hljs-meta { color: #9cdcfe; }
        .hljs-attr { color: #9cdcfe; }
        .hljs-attribute { color: #9cdcfe; }
        .hljs-variable { color: #9cdcfe; }
        .hljs-params { color: #9cdcfe; }
        .hljs-property { color: #9cdcfe; }
        .hljs-punctuation { color: #d4d4d4; }
        .hljs-tag { color: #569cd6; }
        .hljs-name { color: #569cd6; }
        .hljs-selector-tag { color: #d7ba7d; }
        .hljs-selector-class { color: #d7ba7d; }
        .hljs-selector-id { color: #d7ba7d; }
        .hljs-section { color: #dcdcaa; }
        .hljs-link { color: #9cdcfe; }
        .hljs-operator { color: #d4d4d4; }
        .hljs-addition { color: #b5cea8; background: rgba(74,222,128,0.1); }
        .hljs-deletion { color: #ce9178; background: rgba(239,68,68,0.1); }
      `}</style>
    </div>
  );
}
