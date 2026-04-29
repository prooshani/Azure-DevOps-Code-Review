import { WebApi, getPersonalAccessTokenHandler } from "azure-devops-node-api";
import { WorkItemExpand } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
import type { PullRequestContext, ReviewSettings } from "./types";

type RepoPick = {
  organization: string;
  organizationUrl: string;
  project: string;
  repositoryId: string;
  repositoryName: string;
};

function authHeader(pat: string): Record<string, string> {
  const token = Buffer.from(`:${pat}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

async function parseError(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    return `${fallback} (${response.status}) ${text.slice(0, 350)}`;
  } catch {
    return `${fallback} (${response.status})`;
  }
}

/** Enumerate all repos reachable by this PAT.
 *
 * @param pat   Azure DevOps Personal Access Token
 * @param orgUrl  Optional org URL e.g. https://dev.azure.com/myorg
 *               When supplied we skip the vssps profile lookup entirely —
 *               which avoids the need for vso.profile scope and works for
 *               Entra ID-backed orgs that block the profile endpoint.
 */
export async function listAccessibleRepositories(pat: string, orgUrl?: string): Promise<RepoPick[]> {
  const output: RepoPick[] = [];

  /** Discover repos under a single known org URL */
  async function scanOrg(organizationUrl: string) {
    // Derive org name from the URL (last segment after dev.azure.com/ or visualstudio.com/)
    const organization =
      organizationUrl.replace(/\/$/, "").split("/").pop() ?? organizationUrl;

    const projectsRes = await fetch(
      `${organizationUrl.replace(/\/$/, "")}/_apis/projects?api-version=7.1`,
      { headers: authHeader(pat) },
    );
    if (!projectsRes.ok) {
      throw new Error(await parseError(projectsRes, "Could not list projects"));
    }
    const projects = (await projectsRes.json()) as { value?: Array<{ name: string }> };

    for (const project of projects.value ?? []) {
      const reposRes = await fetch(
        `${organizationUrl.replace(/\/$/, "")}/${encodeURIComponent(project.name)}/_apis/git/repositories?api-version=7.1`,
        { headers: authHeader(pat) },
      );
      if (!reposRes.ok) continue;

      const repos = (await reposRes.json()) as { value?: Array<{ id: string; name: string }> };
      for (const repo of repos.value ?? []) {
        output.push({ organization, organizationUrl, project: project.name, repositoryId: repo.id, repositoryName: repo.name });
      }
    }
  }

  if (orgUrl) {
    // ── Direct mode: user supplied their org URL, no profile lookup needed ──
    await scanOrg(orgUrl.trim().replace(/\/$/, ""));
  } else {
    // ── Auto-discovery mode: resolve orgs via vssps profile ──
    const profileRes = await fetch(
      "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1-preview.3",
      { headers: authHeader(pat) },
    );
    if (!profileRes.ok) {
      throw new Error(
        await parseError(
          profileRes,
          "PAT validation failed — ensure the PAT has 'Profile (Read)' scope, or enter your Organization URL manually",
        ),
      );
    }

    const profile = (await profileRes.json()) as { id: string };
    const accountsRes = await fetch(
      `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${profile.id}&api-version=7.1-preview.1`,
      { headers: authHeader(pat) },
    );
    if (!accountsRes.ok) {
      throw new Error(await parseError(accountsRes, "Could not list organizations for PAT"));
    }

    const accounts = (await accountsRes.json()) as { value?: Array<{ accountName: string }> };
    for (const account of accounts.value ?? []) {
      try {
        await scanOrg(`https://dev.azure.com/${account.accountName}`);
      } catch {
        // skip orgs that fail — continue with others
      }
    }
  }

  if (!output.length) {
    throw new Error(
      orgUrl
        ? "No repositories found in that organization. Check the URL and ensure the PAT has Code (Read) + Project & Team (Read) scopes."
        : "No repositories found. Verify PAT scopes: Code (Read), Project & Team (Read). Or enter your Organization URL manually.",
    );
  }

  return output;
}

export async function fetchPullRequestContext(settings: ReviewSettings, pullRequestId: number): Promise<PullRequestContext> {
  const pat = settings.azure.pat;
  const picked = settings.azure.selectedRepositories[0];
  if (!picked) {
    throw new Error("Select at least one repository first.");
  }

  const api = new WebApi(picked.organizationUrl, getPersonalAccessTokenHandler(pat));
  const gitApi = await api.getGitApi();
  const witApi = await api.getWorkItemTrackingApi();

  const pr = await gitApi.getPullRequestById(pullRequestId, picked.project);
  if (!pr.repository?.id) {
    throw new Error(`PR ${pullRequestId} not found`);
  }

  const repoId = pr.repository.id;
  const project = pr.repository.project?.name ?? picked.project;

  const iterations = await gitApi.getPullRequestIterations(repoId, pullRequestId, project);
  const last = iterations.at(-1);
  const changes = last ? await gitApi.getPullRequestIterationChanges(repoId, pullRequestId, last.id!, project) : undefined;

  const linkedWorkRefs = await gitApi.getPullRequestWorkItemRefs(repoId, pullRequestId, project);
  const linkedIds = linkedWorkRefs.map((x) => Number(x.id)).filter((x) => Number.isFinite(x));
  const workItems = linkedIds.length ? await witApi.getWorkItems(linkedIds) : [];

  const relatedPullRequests = await Promise.all(
    linkedIds.map(async (id) => {
      try {
        // WorkItemExpand.Relations (= 1) includes the relations/links array on the work item.
        // Passing "System.Links" as a field name causes TF51535 — it is not a queryable field.
        const wi = await witApi.getWorkItem(id, undefined, undefined, WorkItemExpand.Relations);
        const links = wi.relations ?? [];
        return links
          .filter((l) => l.rel?.toLowerCase().includes("pullrequest"))
          .map((l) => {
            const prId = Number((l.url ?? "").split("/").at(-1));
            return Number.isFinite(prId) ? prId : null;
          })
          .filter((x): x is number => x !== null);
      } catch {
        // If we can't expand relations for this work item, skip rather than fail the whole review
        return [];
      }
    }),
  );

  return {
    pullRequestId,
    title: pr.title ?? "",
    description: pr.description ?? "",
    sourceBranch: pr.sourceRefName,
    targetBranch: pr.targetRefName,
    linkedWorkItemIds: linkedIds,
    linkedWorkItems: workItems.map((w) => ({
      id: w.id!,
      title: String(w.fields?.["System.Title"] ?? ""),
      state: String(w.fields?.["System.State"] ?? ""),
      description: String(w.fields?.["System.Description"] ?? ""),
    })),
    changedFiles:
      changes?.changeEntries?.map((c) => ({
        path: c.item?.path ?? "",
      })) ?? [],
    relatedPullRequests: [...new Set(relatedPullRequests.flat())].map((id) => ({
      id,
      title: `PR ${id}`,
    })),
  };
}
