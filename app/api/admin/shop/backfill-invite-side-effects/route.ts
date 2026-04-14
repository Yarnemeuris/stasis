import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { runInvitePurchaseSideEffects } from "@/lib/attend"

export async function POST() {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  // Find all users who purchased the Stasis Event Invite
  const purchases = await prisma.currencyTransaction.findMany({
    where: {
      type: "SHOP_PURCHASE",
      shopItemId: "stasis-event-invite",
    },
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    distinct: ["userId"],
  })

  // Find users already processed (idempotency guard)
  const alreadyProcessed = await prisma.auditLog.findMany({
    where: {
      action: "ADMIN_BACKFILL_INVITE",
      targetType: "user",
      targetId: { in: purchases.map((p) => p.userId) },
    },
    select: { targetId: true },
  })

  const processedIds = new Set(alreadyProcessed.map((a) => a.targetId))
  const toProcess = purchases.filter((p) => !processedIds.has(p.userId))

  // Respond immediately, run in background
  runBackfill(
    toProcess.map((p) => p.user),
    authCheck.session.user.id,
    authCheck.session.user.email
  ).catch((err) =>
    console.error("[backfill-invite-side-effects] Unexpected error:", err)
  )

  return NextResponse.json({
    message: "Backfill started",
    total: purchases.length,
    skipped: processedIds.size,
    processing: toProcess.length,
  })
}

async function runBackfill(
  users: Array<{ id: string; email: string; name: string | null }>,
  adminId: string,
  adminEmail: string
) {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  console.log(
    `[backfill-invite-side-effects] Starting for ${users.length} users`
  )

  let succeeded = 0
  let failed = 0

  for (let i = 0; i < users.length; i++) {
    const user = users[i]

    if (i > 0) await delay(500)

    try {
      console.log(
        `[backfill-invite-side-effects] (${i + 1}/${users.length}) Processing user ${user.id}`
      )

      await runInvitePurchaseSideEffects({
        email: user.email,
        name: user.name,
      })

      // Mark as processed so re-runs skip this user
      await prisma.auditLog.create({
        data: {
          action: "ADMIN_BACKFILL_INVITE",
          actorId: adminId,
          actorEmail: adminEmail,
          targetType: "user",
          targetId: user.id,
        },
      })

      succeeded++
    } catch (err) {
      console.error(
        `[backfill-invite-side-effects] Error for user ${user.id}:`,
        err
      )
      failed++
    }
  }

  console.log(
    `[backfill-invite-side-effects] Complete: ${succeeded} succeeded, ${failed} failed out of ${users.length} total`
  )
}
