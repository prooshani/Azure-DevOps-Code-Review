"use client";

import { IconAlert, IconBolt, IconCode, IconInfo } from "./icons";
import type { ReviewFinding } from "@/lib/types";

export function FindingCard({ finding }: { finding: ReviewFinding }) {
  const sev = finding.severity ?? "info";
  const sevClass = `sev-${sev}`;

  const SevIcon = sev === "info" ? IconInfo : IconAlert;
  const hasDiff = Boolean(finding.before || finding.after);

  return (
    <article className={`finding ${sevClass}`}>
      {/* ── Header ─────────────────────────────────────── */}
      <header className="finding-head">
        <span className="finding-sev-icon">
          <SevIcon width={15} height={15} />
        </span>

        <div className="finding-head-meta">
          <h4 className="finding-title">{finding.title || "Code issue"}</h4>
          <div className="finding-file-row">
            {finding.filePath ? (
              <span className="finding-file">
                <IconCode width={10} height={10} style={{ verticalAlign: "-1px", marginRight: 4 }} />
                {finding.filePath}
              </span>
            ) : null}
            {finding.lineStart > 0 ? (
              <span className="finding-line">L{finding.lineStart}</span>
            ) : null}
          </div>
        </div>

        <span className="finding-sev-badge">{sev}</span>
      </header>

      {/* ── Diff split panes ───────────────────────────── */}
      {hasDiff ? (
        <div className="finding-diff-split">
          <div className="finding-diff-pane del">
            <div className="finding-diff-pane-label">─ Before (current)</div>
            <pre className="finding-diff-code">{finding.before || "(no snippet)"}</pre>
          </div>
          <div className="finding-diff-pane add">
            <div className="finding-diff-pane-label">+ Suggested fix</div>
            <pre className="finding-diff-code">{finding.after || "(no snippet)"}</pre>
          </div>
        </div>
      ) : null}

      {/* ── Why + suggestion ───────────────────────────── */}
      <div className="finding-footer">
        {finding.why ? (
          <p className="finding-why">{finding.why}</p>
        ) : null}

        {finding.suggestion ? (
          <div className="finding-suggestion">
            <span className="finding-suggestion-icon">
              <IconBolt width={14} height={14} />
            </span>
            <span><strong>Suggestion. </strong>{finding.suggestion}</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
