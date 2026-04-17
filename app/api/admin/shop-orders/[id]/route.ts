import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/admin-auth";
import { Permission } from "@/lib/permissions";
import { CurrencyTransactionType } from "@/app/generated/prisma/enums";
import { decryptShopOrderAddress, decryptShopOrderPhone } from "@/lib/shop-orders";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY);
  if (authCheck.error) return authCheck.error;

  const { id } = await params;

  const order = await prisma.shopOrder.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          slackId: true,
          verificationStatus: true,
          fraudConvicted: true,
          createdAt: true,
        },
      },
      shopItem: {
        select: { id: true, name: true, imageUrl: true, price: true },
      },
      notes: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Aggregate quick user stats for the right-rail + look up the admin who
  // most recently changed the status (for the banner attribution).
  const [balanceAgg, totalOrders, projectCount, bomSpent, lastActor] = await Promise.all([
    prisma.currencyTransaction.aggregate({
      where: { userId: order.userId },
      _sum: { amount: true },
    }),
    prisma.shopOrder.count({ where: { userId: order.userId } }),
    prisma.project.count({ where: { userId: order.userId, deletedAt: null } }),
    prisma.currencyTransaction.aggregate({
      where: {
        userId: order.userId,
        type: CurrencyTransactionType.SHOP_PURCHASE,
        amount: { lt: 0 },
      },
      _sum: { amount: true },
    }),
    order.lastActorId
      ? prisma.user.findUnique({
          where: { id: order.lastActorId },
          select: { id: true, name: true, email: true, image: true },
        })
      : Promise.resolve(null),
  ]);

  const address = decryptShopOrderAddress(order.encryptedAddress);
  const phone = decryptShopOrderPhone(order.encryptedPhone);

  return NextResponse.json({
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      quantity: order.quantity,
      unitBitsCost: order.unitBitsCost,
      totalBitsCost: order.totalBitsCost,
      estimatedUsdCents: order.estimatedUsdCents,
      fulfillmentUsdCents: order.fulfillmentUsdCents,
      status: order.status,
      trackingNumber: order.trackingNumber,
      trackingCarrier: order.trackingCarrier,
      holdReason: order.holdReason,
      rejectionReason: order.rejectionReason,
      placedAt: order.placedAt.toISOString(),
      heldAt: order.heldAt?.toISOString() ?? null,
      rejectedAt: order.rejectedAt?.toISOString() ?? null,
      fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
      lastActorId: order.lastActorId,
      lastActor,
      phone,
      address,
      user: {
        ...order.user,
        createdAt: order.user.createdAt.toISOString(),
      },
      shopItem: order.shopItem,
      notes: order.notes.map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
        author: n.author,
      })),
    },
    userStats: {
      bitsBalance: balanceAgg._sum.amount ?? 0,
      totalOrders,
      projectCount,
      bitsSpentOnParts: Math.abs(bomSpent._sum.amount ?? 0),
    },
  });
}
