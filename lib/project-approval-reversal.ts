import prisma from "@/lib/prisma"
import { Prisma } from "@/app/generated/prisma/client"
import { appendLedgerEntry, CurrencyTransactionType } from "@/lib/currency"
import { getTierBits } from "@/lib/tiers"
import { deleteYSWSProjectSubmission, deleteUnifiedDbProjectRecords } from "@/lib/airtable"

type Stage = "design" | "build"

interface ReverseOptions {
  adminId: string
  adminEmail?: string | null
  reason?: string | null
  allowNegativeBalance?: boolean
}

export interface LedgerEntrySummary {
  id: string
  amount: number
  type: CurrencyTransactionType
  note: string | null
}

export interface ReversalOutcome {
  stage: Stage
  projectId: string
  userId: string
  postgres: {
    projectBefore: { designStatus: string; buildStatus: string; tier: number | null; bitsAwarded: number | null }
    projectAfter: { designStatus: string; buildStatus: string; tier: number | null; bitsAwarded: number | null }
    ledgerEntries: LedgerEntrySummary[]
    deletedSubmissionStages: Stage[]
    balanceBefore: number
    balanceAfter: number
  }
  airtable: {
    records: { stage: "Design" | "Build"; recordIds: string[]; unifiedRecordIds: string[] }[]
    errors: { stage: "Design" | "Build"; error: string }[]
  }
  unifiedDb: {
    attempted: string[]
    deleted: string[]
    skipped?: "no_write_access" | "empty" | "no_backlink"
    error?: string
  }
}

export class ReversalError extends Error {
  status: number
  code: string
  detail?: Record<string, unknown>
  constructor(code: string, message: string, status: number, detail?: Record<string, unknown>) {
    super(message)
    this.code = code
    this.status = status
    this.detail = detail
  }
}

async function computeProjectBalanceDelta(
  tx: Prisma.TransactionClient,
  userId: string,
  projectId: string,
  type: CurrencyTransactionType,
): Promise<number> {
  // Include the matching *_REVERSED entries so prior reversals net out correctly
  // and we don't over-reverse on a re-approval cycle.
  const reversedType =
    type === CurrencyTransactionType.PROJECT_APPROVED
      ? CurrencyTransactionType.PROJECT_APPROVED_REVERSED
      : type === CurrencyTransactionType.DESIGN_APPROVED
        ? CurrencyTransactionType.DESIGN_APPROVED_REVERSED
        : null
  const types = reversedType ? [type, reversedType] : [type]
  const { _sum } = await tx.currencyTransaction.aggregate({
    where: { userId, projectId, type: { in: types } },
    _sum: { amount: true },
  })
  return _sum.amount ?? 0
}

async function computeTotalBalance(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const { _sum } = await tx.currencyTransaction.aggregate({
    where: { userId },
    _sum: { amount: true },
  })
  return _sum.amount ?? 0
}

export async function reverseDesignApproval(
  projectId: string,
  opts: ReverseOptions,
): Promise<ReversalOutcome> {
  const pg = await prisma.$transaction(
    async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId } })
      if (!project) throw new ReversalError("not_found", "Project not found", 404)
      if (project.designStatus !== "approved") {
        throw new ReversalError("precondition_failed", "Design is not approved", 400)
      }

      const projectBefore = {
        designStatus: project.designStatus,
        buildStatus: project.buildStatus,
        tier: project.tier ?? null,
        bitsAwarded: project.bitsAwarded ?? null,
      }

      const designReviewAction = await tx.projectReviewAction.findFirst({
        where: { projectId, stage: "DESIGN", decision: "APPROVED" },
        orderBy: { createdAt: "desc" },
        select: { id: true, grantAmount: true },
      })

      // Ledger reversal: net DESIGN_APPROVED for this project (including any prior reversals)
      const designNet = await computeProjectBalanceDelta(tx, project.userId, projectId, CurrencyTransactionType.DESIGN_APPROVED)
      const designReversalAmount = -designNet // negating entry

      // For build-approval reversals that already happened previously, PROJECT_APPROVED may still net > 0
      // if someone is un-approving design on a project whose build was already un-approved then re-approved.
      // In practice schema guards this: design can only be un-approved while build is not approved.
      // Still, be defensive and reverse any lingering PROJECT_APPROVED too.
      const projectApprovedNet = await computeProjectBalanceDelta(tx, project.userId, projectId, CurrencyTransactionType.PROJECT_APPROVED)
      const projectApprovedReversalAmount = -projectApprovedNet

      const currentBalance = await computeTotalBalance(tx, project.userId)
      const projectedBalance = currentBalance + designReversalAmount + projectApprovedReversalAmount
      if (projectedBalance < 0 && !opts.allowNegativeBalance) {
        throw new ReversalError(
          "negative_balance",
          "Un-approving would drive user balance below zero",
          409,
          {
            currentBalance,
            projectedBalance,
            shortfall: -projectedBalance,
            reversalTotal: designReversalAmount + projectApprovedReversalAmount,
          },
        )
      }

      // Apply state change
      await tx.project.update({
        where: { id: projectId },
        data: { designStatus: "in_review", buildStatus: "draft" },
      })

      // Delete both stages' submissions (design cascades build to draft)
      const deletedSubmissionStages: Stage[] = []
      const designDeleted = await tx.projectSubmission.deleteMany({ where: { projectId, stage: "DESIGN" } })
      if (designDeleted.count > 0) deletedSubmissionStages.push("design")
      const buildDeleted = await tx.projectSubmission.deleteMany({ where: { projectId, stage: "BUILD" } })
      if (buildDeleted.count > 0) deletedSubmissionStages.push("build")

      await tx.projectSubmission.create({ data: { projectId, stage: "DESIGN" } })

      const reasonSuffix = opts.reason ? `: ${opts.reason}` : ""
      const ledgerEntries: LedgerEntrySummary[] = []

      if (designReversalAmount !== 0) {
        const entry = await appendLedgerEntry(tx, {
          userId: project.userId,
          projectId,
          amount: designReversalAmount,
          type: CurrencyTransactionType.DESIGN_APPROVED_REVERSED,
          note: `Design un-approved (reviewAction=${designReviewAction?.id ?? "unknown"})${reasonSuffix}`,
          createdBy: opts.adminId,
        })
        ledgerEntries.push({ id: entry.id, amount: entry.amount, type: entry.type as CurrencyTransactionType, note: entry.note })
      }

      if (projectApprovedReversalAmount !== 0) {
        const entry = await appendLedgerEntry(tx, {
          userId: project.userId,
          projectId,
          amount: projectApprovedReversalAmount,
          type: CurrencyTransactionType.PROJECT_APPROVED_REVERSED,
          note: `Design un-approved — lingering build bits reversed${reasonSuffix}`,
          createdBy: opts.adminId,
        })
        ledgerEntries.push({ id: entry.id, amount: entry.amount, type: entry.type as CurrencyTransactionType, note: entry.note })
      }

      const afterBalance = await computeTotalBalance(tx, project.userId)

      const updatedProject = await tx.project.findUnique({ where: { id: projectId } })

      return {
        project,
        projectBefore,
        projectAfter: {
          designStatus: updatedProject!.designStatus,
          buildStatus: updatedProject!.buildStatus,
          tier: updatedProject!.tier ?? null,
          bitsAwarded: updatedProject!.bitsAwarded ?? null,
        },
        ledgerEntries,
        deletedSubmissionStages,
        balanceBefore: currentBalance,
        balanceAfter: afterBalance,
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  )

  const airtableOutcome = await cleanupAirtableForStage(projectId, "design")
  const unifiedOutcome = await cleanupUnifiedDb(airtableOutcome.records.flatMap((r) => r.unifiedRecordIds))

  return {
    stage: "design",
    projectId,
    userId: pg.project.userId,
    postgres: {
      projectBefore: pg.projectBefore,
      projectAfter: pg.projectAfter,
      ledgerEntries: pg.ledgerEntries,
      deletedSubmissionStages: pg.deletedSubmissionStages,
      balanceBefore: pg.balanceBefore,
      balanceAfter: pg.balanceAfter,
    },
    airtable: airtableOutcome,
    unifiedDb: unifiedOutcome,
  }
}

export async function reverseBuildApproval(
  projectId: string,
  opts: ReverseOptions,
): Promise<ReversalOutcome> {
  const pg = await prisma.$transaction(
    async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId } })
      if (!project) throw new ReversalError("not_found", "Project not found", 404)
      if (project.buildStatus !== "approved") {
        throw new ReversalError("precondition_failed", "Build is not approved", 400)
      }

      const projectBefore = {
        designStatus: project.designStatus,
        buildStatus: project.buildStatus,
        tier: project.tier ?? null,
        bitsAwarded: project.bitsAwarded ?? null,
      }

      const buildReviewAction = await tx.projectReviewAction.findFirst({
        where: { projectId, stage: "BUILD", decision: "APPROVED" },
        orderBy: { createdAt: "desc" },
        select: { id: true, grantAmount: true },
      })
      const designReviewAction = await tx.projectReviewAction.findFirst({
        where: { projectId, stage: "DESIGN", decision: "APPROVED" },
        orderBy: { createdAt: "desc" },
        select: { id: true, grantAmount: true },
      })

      const projectApprovedNet = await computeProjectBalanceDelta(tx, project.userId, projectId, CurrencyTransactionType.PROJECT_APPROVED)
      const projectApprovedReversalAmount = -projectApprovedNet

      // ADMIN_GRANT tied to this build approval (filter by projectId; only the build-approval path
      // writes ADMIN_GRANT with projectId set — manual grants go through admin tooling and would
      // also be scoped — so use the build review action's grantAmount as the authoritative number).
      const adminGrantReversalAmount = -(buildReviewAction?.grantAmount ?? 0) || 0

      // Restore pending DESIGN_APPROVED: mirror what design approval created (tierBits − BOM grant)
      const tierBits = project.tier ? getTierBits(project.tier) : 0
      const designBomGrant = Math.round(designReviewAction?.grantAmount ?? 0)
      const restorePending = tierBits > 0 ? Math.max(0, tierBits - designBomGrant) : 0

      const delta = projectApprovedReversalAmount + adminGrantReversalAmount + restorePending
      const currentBalance = await computeTotalBalance(tx, project.userId)
      const projectedBalance = currentBalance + delta

      if (projectedBalance < 0 && !opts.allowNegativeBalance) {
        throw new ReversalError(
          "negative_balance",
          "Un-approving would drive user balance below zero",
          409,
          {
            currentBalance,
            projectedBalance,
            shortfall: -projectedBalance,
            reversalTotal: delta,
          },
        )
      }

      await tx.project.update({
        where: { id: projectId },
        data: { buildStatus: "in_review", bitsAwarded: null },
      })

      const deletedSubmissionStages: Stage[] = []
      const buildDeleted = await tx.projectSubmission.deleteMany({ where: { projectId, stage: "BUILD" } })
      if (buildDeleted.count > 0) deletedSubmissionStages.push("build")
      await tx.projectSubmission.create({ data: { projectId, stage: "BUILD" } })

      const reasonSuffix = opts.reason ? `: ${opts.reason}` : ""
      const ledgerEntries: LedgerEntrySummary[] = []

      if (projectApprovedReversalAmount !== 0) {
        const entry = await appendLedgerEntry(tx, {
          userId: project.userId,
          projectId,
          amount: projectApprovedReversalAmount,
          type: CurrencyTransactionType.PROJECT_APPROVED_REVERSED,
          note: `Build un-approved (reviewAction=${buildReviewAction?.id ?? "unknown"})${reasonSuffix}`,
          createdBy: opts.adminId,
        })
        ledgerEntries.push({ id: entry.id, amount: entry.amount, type: entry.type as CurrencyTransactionType, note: entry.note })
      }

      if (adminGrantReversalAmount !== 0) {
        const entry = await appendLedgerEntry(tx, {
          userId: project.userId,
          projectId,
          amount: adminGrantReversalAmount,
          type: CurrencyTransactionType.ADMIN_DEDUCTION,
          note: `Reversed additional grant from build approval (reviewAction=${buildReviewAction?.id ?? "unknown"})${reasonSuffix}`,
          createdBy: opts.adminId,
        })
        ledgerEntries.push({ id: entry.id, amount: entry.amount, type: entry.type as CurrencyTransactionType, note: entry.note })
      }

      if (restorePending > 0) {
        const entry = await appendLedgerEntry(tx, {
          userId: project.userId,
          projectId,
          amount: restorePending,
          type: CurrencyTransactionType.DESIGN_APPROVED,
          note: `Pending bits restored — build un-approved${reasonSuffix}`,
          createdBy: opts.adminId,
        })
        ledgerEntries.push({ id: entry.id, amount: entry.amount, type: entry.type as CurrencyTransactionType, note: entry.note })
      }

      const afterBalance = await computeTotalBalance(tx, project.userId)
      const updatedProject = await tx.project.findUnique({ where: { id: projectId } })

      return {
        project,
        projectBefore,
        projectAfter: {
          designStatus: updatedProject!.designStatus,
          buildStatus: updatedProject!.buildStatus,
          tier: updatedProject!.tier ?? null,
          bitsAwarded: updatedProject!.bitsAwarded ?? null,
        },
        ledgerEntries,
        deletedSubmissionStages,
        balanceBefore: currentBalance,
        balanceAfter: afterBalance,
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  )

  const airtableOutcome = await cleanupAirtableForStage(projectId, "build")
  const unifiedOutcome = await cleanupUnifiedDb(airtableOutcome.records.flatMap((r) => r.unifiedRecordIds))

  return {
    stage: "build",
    projectId,
    userId: pg.project.userId,
    postgres: {
      projectBefore: pg.projectBefore,
      projectAfter: pg.projectAfter,
      ledgerEntries: pg.ledgerEntries,
      deletedSubmissionStages: pg.deletedSubmissionStages,
      balanceBefore: pg.balanceBefore,
      balanceAfter: pg.balanceAfter,
    },
    airtable: airtableOutcome,
    unifiedDb: unifiedOutcome,
  }
}

async function cleanupAirtableForStage(projectId: string, stage: Stage): Promise<ReversalOutcome["airtable"]> {
  const stagesToDelete: ("Design" | "Build")[] = stage === "design" ? ["Design", "Build"] : ["Build"]

  const records: ReversalOutcome["airtable"]["records"] = []
  const errors: ReversalOutcome["airtable"]["errors"] = []

  for (const s of stagesToDelete) {
    const res = await deleteYSWSProjectSubmission(projectId, s)
    records.push({ stage: s, recordIds: res.deleted, unifiedRecordIds: res.unifiedRecordIds })
    if (res.error) errors.push({ stage: s, error: res.error })
  }

  return { records, errors }
}

async function cleanupUnifiedDb(unifiedRecordIds: string[]): Promise<ReversalOutcome["unifiedDb"]> {
  const unique = Array.from(new Set(unifiedRecordIds)).filter(Boolean)
  if (unique.length === 0) {
    return { attempted: [], deleted: [], skipped: "no_backlink" }
  }
  const res = await deleteUnifiedDbProjectRecords(unique)
  return {
    attempted: res.attempted,
    deleted: res.deleted,
    skipped: res.skipped === "no_write_access" ? "no_write_access" : res.skipped === "empty" ? "empty" : undefined,
    error: res.error,
  }
}
