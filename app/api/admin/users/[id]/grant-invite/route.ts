import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { SHOP_ITEM_IDS } from "@/lib/shop"
import { runInvitePurchaseSideEffects } from "@/lib/attend"
import { Prisma } from "@/app/generated/prisma/client"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const { id: userId } = await params

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  })
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.currencyTransaction.count({
        where: {
          userId,
          type: "SHOP_PURCHASE",
          shopItemId: SHOP_ITEM_IDS.STASIS_EVENT_INVITE,
        },
      })
      if (existing > 0) throw new Error("ALREADY_INVITED")

      const sumRow = await tx.currencyTransaction.aggregate({
        where: { userId },
        _sum: { amount: true },
      })
      const balance = sumRow._sum.amount ?? 0

      await tx.currencyTransaction.create({
        data: {
          userId,
          amount: 0,
          type: "SHOP_PURCHASE",
          shopItemId: SHOP_ITEM_IDS.STASIS_EVENT_INVITE,
          note: `Admin grant by ${authCheck.session.user.email}`,
          balanceBefore: balance,
          balanceAfter: balance,
          createdBy: authCheck.session.user.id,
        },
      })
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_INVITED") {
      return NextResponse.json({ error: "User already has an invite" }, { status: 409 })
    }
    console.error("[admin/grant-invite] Failed to create invite row:", err)
    return NextResponse.json({ error: "Failed to grant invite" }, { status: 500 })
  }

  await runInvitePurchaseSideEffects({ email: user.email, name: user.name })

  await prisma.auditLog.create({
    data: {
      action: "ADMIN_GRANT_INVITE",
      actorId: authCheck.session.user.id,
      actorEmail: authCheck.session.user.email,
      targetType: "user",
      targetId: userId,
    },
  })

  return NextResponse.json({ success: true })
}
