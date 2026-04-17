import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/admin-auth";
import { Permission } from "@/lib/permissions";
import { ShopOrderStatus } from "@/app/generated/prisma/enums";

export const dynamic = "force-dynamic";

const SORT_MAP = {
  longest_waiting: { placedAt: "asc" as const },
  newest: { placedAt: "desc" as const },
  oldest: { placedAt: "asc" as const },
  price_desc: { totalBitsCost: "desc" as const },
  price_asc: { totalBitsCost: "asc" as const },
};
type SortKey = keyof typeof SORT_MAP;

export async function GET(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY);
  if (authCheck.error) return authCheck.error;

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search")?.trim() || "";
  const itemId = searchParams.get("itemId")?.trim() || null;
  const statusParam = searchParams.get("status")?.trim() || "";
  const sortKey = (searchParams.get("sort") || "longest_waiting") as SortKey;
  const sortOrder = SORT_MAP[sortKey] ?? SORT_MAP.longest_waiting;

  const where: Record<string, unknown> = {};

  if (statusParam) {
    const statuses = statusParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s in ShopOrderStatus) as ShopOrderStatus[];
    if (statuses.length > 0) where.status = { in: statuses };
  }

  if (itemId) where.shopItemId = itemId;

  if (search) {
    const orderNumberMatch = /^#?(\d+)$/.exec(search);
    const searchClauses: Record<string, unknown>[] = [
      { user: { is: { email: { contains: search, mode: "insensitive" } } } },
      { user: { is: { name: { contains: search, mode: "insensitive" } } } },
      { user: { is: { slackId: { equals: search } } } },
      { trackingNumber: { contains: search, mode: "insensitive" } },
    ];
    if (orderNumberMatch) {
      searchClauses.push({ orderNumber: Number(orderNumberMatch[1]) });
    }
    where.OR = searchClauses;
  }

  // When sorting by "longest waiting" we only want the oldest PENDING/ON_HOLD
  // at the top — terminal orders can cluster at the bottom. Achieved by
  // returning them in two slices if no explicit status filter is set.
  const isDefaultSort = sortKey === "longest_waiting";

  const [orders, statusCounts] = await Promise.all([
    prisma.shopOrder.findMany({
      where,
      orderBy: isDefaultSort
        ? [{ status: "asc" }, { placedAt: "asc" }]
        : [sortOrder],
      take: 500,
      select: {
        id: true,
        orderNumber: true,
        quantity: true,
        totalBitsCost: true,
        estimatedUsdCents: true,
        status: true,
        placedAt: true,
        fulfilledAt: true,
        heldAt: true,
        rejectedAt: true,
        trackingNumber: true,
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
        shopItem: {
          select: { id: true, name: true, imageUrl: true },
        },
      },
    }),
    prisma.shopOrder.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const counts = {
    PENDING: 0,
    ON_HOLD: 0,
    FULFILLED: 0,
    REJECTED: 0,
    CANCELLED: 0,
  } as Record<ShopOrderStatus, number>;
  for (const c of statusCounts) counts[c.status] = c._count._all;

  const itemOptions = Array.from(
    new Map(orders.map((o) => [o.shopItem.id, { id: o.shopItem.id, name: o.shopItem.name }])).values()
  );

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      quantity: o.quantity,
      totalBitsCost: o.totalBitsCost,
      estimatedUsdCents: o.estimatedUsdCents,
      status: o.status,
      placedAt: o.placedAt.toISOString(),
      fulfilledAt: o.fulfilledAt?.toISOString() ?? null,
      heldAt: o.heldAt?.toISOString() ?? null,
      rejectedAt: o.rejectedAt?.toISOString() ?? null,
      trackingNumber: o.trackingNumber,
      user: o.user,
      shopItem: o.shopItem,
    })),
    counts,
    itemOptions,
  });
}
