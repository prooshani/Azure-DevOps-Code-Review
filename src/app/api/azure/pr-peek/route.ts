import { NextResponse } from "next/server";
import { WebApi, getPersonalAccessTokenHandler } from "azure-devops-node-api";

export interface PrPeekResult {
  id: number;
  title: string;
  description: string;
  status: "active" | "completed" | "abandoned" | "notSet";
  authorName: string;
  authorEmail: string;
  createdDate: string;
  sourceBranch: string;
  targetBranch: string;
  repositoryName: string;
  projectName: string;
  url: string;
  workItems: Array<{ id: number; title: string; state: string; type: string }>;
  changedFiles: number;
  commitsCount: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      pat?: string;
      organizationUrl?: string;
      project?: string;
      pullRequestId?: number;
    };

    if (!body.pat?.trim()) return NextResponse.json({ error: "PAT required" }, { status: 400 });
    if (!body.organizationUrl?.trim()) return NextResponse.json({ error: "Organization URL required" }, { status: 400 });
    if (!body.pullRequestId) return NextResponse.json({ error: "Pull Request ID required" }, { status: 400 });

    const api = new WebApi(body.organizationUrl.trim(), getPersonalAccessTokenHandler(body.pat.trim()));
    const gitApi = await api.getGitApi();
    const witApi = await api.getWorkItemTrackingApi();

    const pr = await gitApi.getPullRequestById(body.pullRequestId, body.project);
    if (!pr?.repository?.id) {
      return NextResponse.json(
        { error: `PR #${body.pullRequestId} not found. Check the number and ensure it belongs to a selected repository.` },
        { status: 404 },
      );
    }

    const repoId = pr.repository.id;
    const project = pr.repository.project?.name ?? body.project ?? "";

    const [workItemRefs, iterations] = await Promise.all([
      gitApi.getPullRequestWorkItemRefs(repoId, body.pullRequestId, project).catch(() => []),
      gitApi.getPullRequestIterations(repoId, body.pullRequestId, project).catch(() => []),
    ]);

    const wiIds = workItemRefs.map((r) => Number(r.id)).filter(Number.isFinite);
    const workItems = wiIds.length
      ? await witApi.getWorkItems(wiIds, ["System.Title", "System.State", "System.WorkItemType"]).catch(() => [])
      : [];

    // Count changed files in the last iteration
    let changedFiles = 0;
    const lastIter = iterations.at(-1);
    if (lastIter?.id) {
      try {
        const changes = await gitApi.getPullRequestIterationChanges(repoId, body.pullRequestId, lastIter.id, project);
        changedFiles = changes?.changeEntries?.length ?? 0;
      } catch { /* non-fatal */ }
    }

    // Build the web URL
    const orgBase = body.organizationUrl.trim().replace(/\/$/, "");
    const webUrl = `${orgBase}/${encodeURIComponent(project)}/_git/${encodeURIComponent(pr.repository.name ?? "")}` +
      `/pullrequest/${body.pullRequestId}`;

    const result: PrPeekResult = {
      id: body.pullRequestId,
      title: pr.title ?? `PR #${body.pullRequestId}`,
      description: pr.description ?? "",
      status: (pr.status as unknown as PrPeekResult["status"]) ?? "notSet",
      authorName: pr.createdBy?.displayName ?? "Unknown",
      authorEmail: pr.createdBy?.uniqueName ?? "",
      createdDate: pr.creationDate?.toISOString() ?? "",
      sourceBranch: (pr.sourceRefName ?? "").replace("refs/heads/", ""),
      targetBranch: (pr.targetRefName ?? "").replace("refs/heads/", ""),
      repositoryName: pr.repository.name ?? "",
      projectName: project,
      url: webUrl,
      workItems: workItems.map((w) => ({
        id: w.id!,
        title: String(w.fields?.["System.Title"] ?? ""),
        state: String(w.fields?.["System.State"] ?? ""),
        type: String(w.fields?.["System.WorkItemType"] ?? ""),
      })),
      changedFiles,
      commitsCount: iterations.length,
    };

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to fetch PR";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
