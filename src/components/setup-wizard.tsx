"use client";

import { IconArrow, IconCheck, IconCpu, IconKey, IconRepo } from "./icons";

export type SetupStatus = {
  hasPat: boolean;
  hasRepoSelection: boolean;
  hasProvider: boolean;
};

export function SetupWizard({
  status,
  onJumpToSettings,
}: {
  status: SetupStatus;
  onJumpToSettings: (tab: "azure" | "ai" | "workspace") => void;
}) {
  const total = 3;
  const done =
    Number(status.hasPat) + Number(status.hasRepoSelection) + Number(status.hasProvider);
  const pct = Math.round((done / total) * 100);

  return (
    <section className="card wizard">
      <div className="card-header">
        <div className="card-title-block">
          <span className="badge badge-brand" style={{ width: "fit-content" }}>
            <span className="dot" /> Onboarding
          </span>
          <h2>Finish setup to start reviewing PRs</h2>
          <p className="card-subtitle">Three quick steps. We&apos;ll remember everything for next time.</p>
        </div>
      </div>

      <div className="wizard-progress">
        <div className="wizard-progress-meta">
          <span>Setup progress</span>
          <span>{done} of {total} complete · {pct}%</span>
        </div>
        <div className="wizard-progress-bar">
          <div className="wizard-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="wizard-steps">
        <StepCard
          num={1}
          done={status.hasPat}
          icon={<IconKey />}
          title="Connect Azure DevOps"
          desc="Add a PAT with Code/Work Items read scopes."
          onClick={() => onJumpToSettings("azure")}
        />
        <StepCard
          num={2}
          done={status.hasRepoSelection}
          icon={<IconRepo />}
          title="Select Repositories"
          desc="Pick the repos used for context and style."
          onClick={() => onJumpToSettings("azure")}
        />
        <StepCard
          num={3}
          done={status.hasProvider}
          icon={<IconCpu />}
          title="Configure AI Provider"
          desc="Use cloud or local model. Detect &amp; pick a model."
          onClick={() => onJumpToSettings("ai")}
        />
      </div>
    </section>
  );
}

function StepCard({
  num,
  done,
  icon,
  title,
  desc,
  onClick,
}: {
  num: number;
  done: boolean;
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button className={`step-card ${done ? "done" : ""}`} onClick={onClick} type="button">
      <div className="step-card-top">
        <span className="step-num">{done ? <IconCheck /> : num}</span>
        <span className="step-title">
          <span style={{ color: done ? "var(--success)" : "var(--brand-2)", display: "inline-flex", alignItems: "center", marginRight: 6 }}>{icon}</span>
          {title}
        </span>
        <span className="step-arrow"><IconArrow /></span>
      </div>
      <span className="step-desc">{desc}</span>
    </button>
  );
}
