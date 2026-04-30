"use client";

import { IconAlert, IconBolt, IconCode, IconInfo } from "./icons";
import type { ReviewFinding } from "@/lib/types";

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
          {/* Only show line when it's a meaningful specific line (> 1) */}
          {finding.lineStart > 1 ? (
            <span className="finding-line">L{finding.lineStart}</span>
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
            <pre className="finding-diff-code">{finding.before || "(no snippet)"}</pre>
          </div>
          <div className="finding-diff-pane add">
            <div className="finding-diff-pane-label">
              <span>+</span> Suggested fix
            </div>
            <pre className="finding-diff-code">{finding.after || "(no suggestion)"}</pre>
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
