"use client";

import { IconAlert, IconBolt, IconCode, IconInfo } from "./icons";
import type { ReviewFinding } from "@/lib/types";

/**
 * Formats code text with line numbers.
 * Uses the provided startLine to show actual file line numbers.
 */
function CodeWithLineNumbers({ code, startLine }: { code: string; startLine: number }) {
  const lines = code.split("\n");
  const hasLineNumbers = startLine > 0;

  return (
    <pre className="finding-diff-code">
      {lines.map((line, idx) => {
        // Detect diff line type
        let lineType: "neutral" | "add" | "del" | "context" = "context";
        let displayLine = line;

        if (line.startsWith("+")) {
          lineType = "add";
          displayLine = line.slice(1);
        } else if (line.startsWith("-")) {
          lineType = "del";
          displayLine = line.slice(1);
        } else if (line.startsWith(" ") && line.length > 1) {
          lineType = "context";
          displayLine = line.slice(1);
        }

        return (
          <div key={idx} className={`finding-diff-line finding-diff-line-${lineType}`}>
            <span className="finding-diff-line-num">
              {hasLineNumbers ? startLine + idx : "???"}
            </span>
            <span className="finding-diff-line-content">{displayLine || "\u00A0"}</span>
          </div>
        );
      })}
    </pre>
  );
}

export function FindingCard({ finding }: { finding: ReviewFinding }) {
  const sev = finding.severity ?? "info";
  const sevClass = `sev-${sev}`;

  const SevIcon = sev === "error" ? IconAlert : sev === "warning" ? IconAlert : IconInfo;
  const hasDiff = Boolean(finding.before || finding.after);

  return (
    <article className={`finding ${sevClass}`}>

      {/* ── File header bar — like Azure DevOps file row ─── */}
      <div className="finding-file-bar">
        <div className="finding-file-bar-left">
          <span className="finding-file-bar-icon">
            <IconCode width={12} height={12} />
          </span>
          {finding.filePath ? (
            <span className="finding-file-path" title={finding.filePath}>
              {finding.filePath}
            </span>
          ) : (
            <span className="finding-file-path" style={{ color: "var(--text-faint)" }}>
              (no file specified)
            </span>
          )}
          {/* Only show line when it's a meaningful specific line (> 0) */}
          {finding.lineStart > 0 ? (
            <span className="finding-line">L{finding.lineStart}</span>
          ) : finding.lineStart === 0 && finding.filePath ? (
            <span className="finding-line" style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              ???
            </span>
          ) : null}
        </div>
        <span className="finding-sev-badge">
          <SevIcon width={10} height={10} />
          {sev}
        </span>
      </div>

      {/* ── Diff split panes — like Azure DevOps diff view ── */}
      {hasDiff ? (
        <div className="finding-diff-split">
          <div className="finding-diff-pane del">
            <div className="finding-diff-pane-label">
              <span>─</span> Before (current)
            </div>
            <CodeWithLineNumbers code={finding.before || "(no snippet)"} startLine={finding.lineStart} />
          </div>
          <div className="finding-diff-pane add">
            <div className="finding-diff-pane-label">
              <span>+</span> Suggested fix
            </div>
            <CodeWithLineNumbers code={finding.after || "(no suggestion)"} startLine={finding.lineStart} />
          </div>
        </div>
      ) : null}

      {/* ── PR comment thread — like Azure DevOps comment ── */}
      <div className="finding-comment">
        <div className="finding-comment-thread">
          <div className="finding-comment-header">
            <span className="finding-comment-avatar">AI</span>
            <span className="finding-comment-author">AI Code Review</span>
            <span className="finding-comment-title">{finding.title || "Code issue"}</span>
          </div>

          <div className="finding-comment-body">
            {finding.why ? (
              <p className="finding-why">{finding.why}</p>
            ) : null}

            {finding.suggestion ? (
              <div className="finding-suggestion">
                <span className="finding-suggestion-icon">
                  <IconBolt width={14} height={14} />
                </span>
                <span>
                  <strong>Suggestion. </strong>{finding.suggestion}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

    </article>
  );
}
