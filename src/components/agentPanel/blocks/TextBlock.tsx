import { useMemo } from "react";
import { marked } from "marked";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("jsx", javascript);

marked.setOptions({
  gfm: true,
  breaks: true,
});

const renderer = new marked.Renderer();
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  let highlighted: string;
  if (lang && hljs.getLanguage(lang)) {
    highlighted = hljs.highlight(text, { language: lang }).value;
  } else {
    highlighted = hljs.highlightAuto(text).value;
  }
  return `<pre class="agent-code-block"><code class="hljs language-${lang || "auto"}">${highlighted}</code></pre>`;
};

export default function TextBlock({ text }: { text: string }) {
  const html = useMemo(() => {
    try {
      return marked.parse(text, { renderer }) as string;
    } catch {
      return text;
    }
  }, [text]);

  return (
    <div
      className="agent-text-block"
      style={{
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--vp-text-primary)",
        wordBreak: "break-word",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
