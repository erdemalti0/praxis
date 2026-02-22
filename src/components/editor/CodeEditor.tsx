import { useRef, useEffect, useCallback } from "react";
import hljs from "highlight.js/lib/core";
// Register only commonly used languages for editor
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import rust from "highlight.js/lib/languages/rust";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import diff from "highlight.js/lib/languages/diff";
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("diff", diff);
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

      {/* hljs theme – colors driven by CSS custom properties from applyTheme */}
      <style>{`
        .hljs { color: var(--vp-code-text, #d4d4d4); }
        .hljs-keyword,
        .hljs-selector-tag { color: var(--vp-syntax-keyword, #c586c0); }
        .hljs-built_in,
        .hljs-type { color: var(--vp-syntax-type, #4ec9b0); }
        .hljs-literal { color: var(--vp-syntax-literal, #569cd6); }
        .hljs-number { color: var(--vp-syntax-number, #b5cea8); }
        .hljs-string,
        .hljs-template-variable,
        .hljs-doctag { color: var(--vp-syntax-string, #ce9178); }
        .hljs-regexp { color: var(--vp-syntax-regexp, #d16969); }
        .hljs-title,
        .hljs-title.function_,
        .hljs-section { color: var(--vp-syntax-function, #dcdcaa); }
        .hljs-title.class_ { color: var(--vp-syntax-type, #4ec9b0); }
        .hljs-comment { color: var(--vp-syntax-comment, #6a9955); font-style: italic; }
        .hljs-meta { color: var(--vp-syntax-meta, #d7ba7d); }
        .hljs-attr,
        .hljs-attribute,
        .hljs-name { color: var(--vp-syntax-attribute, #9cdcfe); }
        .hljs-variable,
        .hljs-params,
        .hljs-property { color: var(--vp-syntax-variable, #9cdcfe); }
        .hljs-punctuation { color: var(--vp-code-text, #d4d4d4); }
        .hljs-tag { color: var(--vp-syntax-tag, #569cd6); }
        .hljs-selector-class,
        .hljs-selector-id { color: var(--vp-syntax-meta, #d7ba7d); }
        .hljs-link { color: var(--vp-syntax-variable, #9cdcfe); }
        .hljs-operator { color: var(--vp-syntax-operator, #d4d4d4); }
        .hljs-addition { color: var(--vp-syntax-addition, #4ade80); background: rgba(74,222,128,0.1); }
        .hljs-deletion { color: var(--vp-syntax-deletion, #f87171); background: rgba(239,68,68,0.1); }
      `}</style>
    </div>
  );
}
