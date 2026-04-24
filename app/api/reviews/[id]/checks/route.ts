import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/admin-auth';
import { Permission } from '@/lib/permissions';
import prisma from '@/lib/prisma';
import { type CheckResult, runReviewChecks } from '@/lib/github-checks';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission(Permission.REVIEW_PROJECTS);
    if ('error' in authCheck) return authCheck.error;

    const { id } = await params;
    const refresh = new URL(request.url).searchParams.get('refresh') === '1';

    // Route param can be a project ID or a submission ID. Resolve both, plus
    // locate the submission whose cached checks we should read/write.
    let githubRepo: string | null = null;
    let submissionId: string | null = null;
    let cachedChecks: CheckResult[] | null = null;
    let cachedAt: Date | null = null;

    const submission = await prisma.projectSubmission.findUnique({
      where: { id },
      include: { project: { select: { githubRepo: true, deletedAt: true } } },
    });

    if (submission) {
      if (submission.project.deletedAt) {
        return NextResponse.json({ error: 'Project not found - it may have been deleted' }, { status: 404 });
      }
      submissionId = submission.id;
      githubRepo = submission.project.githubRepo;
      cachedChecks = (submission.githubChecks as CheckResult[] | null) ?? null;
      cachedAt = submission.githubChecksAt;
    } else {
      const project = await prisma.project.findUnique({
        where: { id },
        select: { githubRepo: true, deletedAt: true },
      });
      if (!project) {
        return NextResponse.json({ error: 'Project not found - it may have been deleted' }, { status: 404 });
      }
      if (project.deletedAt) {
        return NextResponse.json({ error: 'Project not found - it may have been deleted' }, { status: 404 });
      }
      githubRepo = project.githubRepo;

      // Pick the most recent submission for this project to read/write cache.
      const latestSubmission = await prisma.projectSubmission.findFirst({
        where: { projectId: id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, githubChecks: true, githubChecksAt: true },
      });
      if (latestSubmission) {
        submissionId = latestSubmission.id;
        cachedChecks = (latestSubmission.githubChecks as CheckResult[] | null) ?? null;
        cachedAt = latestSubmission.githubChecksAt;
      }
    }

    if (!refresh && cachedChecks) {
      return NextResponse.json({ checks: cachedChecks, checkedAt: cachedAt, cached: true });
    }

    const checks = await runReviewChecks(githubRepo);
    const checkedAt = new Date();
    if (submissionId) {
      await prisma.projectSubmission.update({
        where: { id: submissionId },
        data: { githubChecks: checks as object, githubChecksAt: checkedAt },
      }).catch((err) => console.error('Failed to persist refreshed GitHub checks:', err));
    }
    return NextResponse.json({ checks, checkedAt, cached: false });
  } catch (err) {
    console.error('GitHub checks error:', err);
    const message = err instanceof TypeError && String(err).includes('fetch')
      ? 'Could not connect to GitHub - the proxy may be down or there is a network issue'
      : 'Failed to run GitHub repo checks';
    return NextResponse.json({ error: message, detail: String(err) }, { status: 500 });
  }
}
