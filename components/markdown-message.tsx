"use client";
/* eslint-disable @next/next/no-img-element -- Generated chart data is inline and intentionally bypasses remote loaders. */
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { downloadText } from "../lib/files";
import { safeUrl, type ChatMessage } from "../lib/workspace";

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copy() { try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setError("Kopieren nicht erlaubt. Nutze den Download."); } }
  const extension = ({ javascript: "js", typescript: "ts", python: "py", bash: "sh", html: "html", css: "css", json: "json", sql: "sql", csv: "csv" } as Record<string, string>)[language] || "txt";
  return <div className="code-block"><div className="code-toolbar"><span>{language || "Code"}</span><div><button type="button" onClick={() => void copy()} aria-label="Code kopieren">{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? "Kopiert" : "Kopieren"}</button><button type="button" onClick={() => downloadText(`code.${extension}`, code)} aria-label="Code herunterladen"><Download size={14}/></button></div></div><pre><code>{code}</code></pre>{error && <p role="status">{error}</p>}</div>;
}
export default function MarkdownMessage({ message }: { message: ChatMessage }) {
  const searchDocument = message.searchHtml ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'"><base target="_blank">${message.searchHtml}` : "";
  return <div className="rich-message">
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => safeUrl(url) || ""} components={{
      a({ href, children }) { const safe = safeUrl(href); return safe ? <a href={safe} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>; },
      img() { return null; },
      pre({ children }) { return <div className="code-wrapper">{children}</div>; },
      code({ children, className }) { const code = String(children).replace(/\n$/, ""); const language = /language-([\w-]+)/.exec(className || "")?.[1] || ""; return className || String(children).includes("\n") ? <CodeBlock code={code} language={language}/> : <code className="inline-code">{children}</code>; },
      table({ children }) { return <div className="markdown-table"><table>{children}</table></div>; },
    }}>{message.content}</ReactMarkdown>
    {message.sources?.length ? <div className="source-list" aria-label="Verwendete Quellen"><strong>Quellen</strong>{message.sources.map((source, i) => <a key={`${source.url}-${i}`} href={safeUrl(source.url)} target="_blank" rel="noopener noreferrer"><span>{i + 1}</span>{source.title}<ExternalLink size={12}/></a>)}</div> : null}
    {searchDocument && <iframe className="search-suggestions" title="Google-Suchvorschläge" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={searchDocument}/>}
    {message.executions?.map((execution, i) => <details className="execution-result" key={i}><summary>Python-Ausführung · {execution.outcome === "OUTCOME_OK" ? "erfolgreich" : execution.outcome === "NOT_REPORTED" ? "Ergebnis nicht gemeldet" : "Fehler gemeldet"}</summary><CodeBlock code={execution.code} language="python"/><pre className="execution-output">{execution.output || "Keine Textausgabe."}</pre></details>)}
    {message.artifacts?.map((artifact, i) => { const src = `data:${artifact.mimeType};base64,${artifact.data}`; return <figure className="chat-chart" key={i}><img src={src} alt={`Von der Analyse erstellte Grafik ${i + 1}`}/><figcaption><a href={src} download={`analyse-${i + 1}.${artifact.mimeType === "image/jpeg" ? "jpg" : artifact.mimeType === "image/webp" ? "webp" : "png"}`}><Download size={14}/>Grafik herunterladen</a></figcaption></figure>; })}
    {message.warning && <p className="response-warning" role="status">{message.warning}</p>}
  </div>;
}
