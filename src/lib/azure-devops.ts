import { WebApi, getPersonalAccessTokenHandler } from "azure-devops-node-api";
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

export async function listAccessibleRepositories(pat: string): Promise<RepoPick[]> {
  const profileRes = await fetch("https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1-preview.3", {
    headers: authHeader(pat),
  });
  if (!profileRes.ok) {
    throw new Error("PAT validation failed. Check token scope.");
  }

  const profile = (await profileRes.json()) as { id: string };
  const accountsRes = await fetch(
    `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${profile.id}&api-version=7.1-preview.1`,
    { headers: authHeader(pat) },
  );
  if (!accountsRes.ok) {
    throw new Error("Could not read Azure DevOps organizations for PAT.");
  }

  const accounts = (await accountsRes.json()) as { value?: Array<{ accountName: string }> };
  const output: RepoPick[] = [];

  for (const account of accounts.value ?? []) {
    const organization = account.accountName;
    const organizationUrl = `https://dev.azure.com/${organization}`;

    const projectsRes = await fetch(`${organizationUrl}/_apis/projects?api-version=7.1`, { headers: authHeader(pat) });
    if (!projectsRes.ok) {
      continue;
    }
    const projects = (await projectsRes.json()) as { value?: Array<{ name: string }> };

    for (const project of projects.value ?? []) {
      const reposRes = await fetch(
        `${organizationUrl}/${encodeURIComponent(project.name)}/_apis/git/repositories?api-version=7.1`,
        { headers: authHeader(pat) },
      );
      if (!reposRes.ok) {
        continue;
      }

      const repos = (await reposRes.json()) as { value?: Array<{ id: string; name: string }> };
      for (const repo of repos.value ?? []) {
        output.push({
          organization,
          organizationUrl,
          project: project.name,
          repositoryId: repo.id,
          repositoryName: repo.name,
        });
      }
    }
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
      const wi = await witApi.getWorkItem(id, ["System.Links"]);
      const links = wi.relations ?? [];
      return links
        .filter((l) => l.rel?.toLowerCase().includes("pullrequest"))
        .map((l) => {
          const prId = Number((l.url ?? "").split("/").at(-1));
          return Number.isFinite(prId) ? prId : null;
        })
        .filter((x): x is number => x !== null);
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
