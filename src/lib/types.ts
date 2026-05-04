export type LlmProvider = "openai" | "anthropic" | "gemini" | "ollama" | "lmstudio";

export type ProviderConfig = {
  provider: LlmProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  isActive?: boolean;
  label?: string;
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

export type GithubConfig = {
  token?: string;
  selectedRepositories: Array<{
    owner: string;
    name: string;
    fullName: string;
  }>;
};

export type LocalRepoConfig = {
  selectedRepositories: Array<{
    rootPath: string;
    name: string;
    defaultBaseBranch?: string;
  }>;
};

export type VcsProvider = "azure" | "github" | "local";

export type ReviewSettings = {
  azure: AzureConfig;
  github: GithubConfig;
  local: LocalRepoConfig;
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
  id?: string;
  createdAt?: string;
  summary: string;
  sources: {
    provider: VcsProvider;
    reference: string;
    pullRequestId: number;
    linkedWorkItemIds: number[];
    relatedPullRequestIds: number[];
  };
  findings: ReviewFinding[];
};

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

export type PullRequestContext = {
  provider: VcsProvider;
  reference: string;
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

export type ReviewTarget =
  | { provider: "azure"; pullRequestId: number }
  | { provider: "github"; pullRequestId: number; repositoryFullName?: string }
  | { provider: "github"; repositoryFullName: string; sourceBranch: string; targetBranch: string }
  | { provider: "local"; sourceBranch: string; targetBranch?: string; repositoryRoot?: string };

export type StyleProfile = {
  generatedAt: string;
  rules: string[];
  evidence: Array<{ rule: string; file: string; sample: string }>;
};
