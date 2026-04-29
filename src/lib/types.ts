export type LlmProvider = "openai" | "anthropic" | "gemini" | "ollama" | "lmstudio";

export type ProviderConfig = {
  provider: LlmProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export type AzureConfig = {
  pat: string;
  organizationUrl?: string;
  selectedRepositories: Array<{
    organization: string;
    organizationUrl: string;
    project: string;
    repositoryId: string;
    repositoryName: string;
  }>;
};

export type ReviewSettings = {
  azure: AzureConfig;
  providers: ProviderConfig[];
  workspaceRoots: string[];
  styleProfilePath?: string;
};

export type ReviewFinding = {
  filePath: string;
  lineStart: number;
  severity: "info" | "warning" | "error";
  title: string;
  why: string;
  suggestion: string;
  before?: string;
  after?: string;
};

export type ReviewResult = {
  summary: string;
  sources: {
    pullRequestId: number;
    linkedWorkItemIds: number[];
    relatedPullRequestIds: number[];
  };
  findings: ReviewFinding[];
};

export type PullRequestContext = {
  pullRequestId: number;
  title: string;
  description?: string;
  sourceBranch?: string;
  targetBranch?: string;
  linkedWorkItemIds: number[];
  linkedWorkItems: Array<{ id: number; title: string; state?: string; description?: string }>;
  changedFiles: Array<{ path: string; patch?: string }>;
  relatedPullRequests: Array<{ id: number; title: string; status?: string }>;
};

export type StyleProfile = {
  generatedAt: string;
  rules: string[];
  evidence: Array<{ rule: string; file: string; sample: string }>;
};
