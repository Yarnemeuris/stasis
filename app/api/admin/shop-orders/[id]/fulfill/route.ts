import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-auth";
import { Permission } from "@/lib/permissions";
import { fulfillShopOrder, ShopOrderError } from "@/lib/shop-orders";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY);
  if (authCheck.error) return authCheck.error;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    fulfillmentUsdCents?: number;
    trackingNumber?: string | null;
  };

  if (typeof body.fulfillmentUsdCents !== "number" || !Number.isInteger(body.fulfillmentUsdCents) || body.fulfillmentUsdCents < 0) {
    return NextResponse.json(
      { error: "fulfillmentUsdCents must be a non-negative integer", code: "INVALID_INPUT" },
      { status: 400 }
    );
  }

  try {
    const order = await fulfillShopOrder({
      adminId: authCheck.session.user.id,
      adminEmail: authCheck.session.user.email,
      orderId: id,
      fulfillmentUsdCents: body.fulfillmentUsdCents,
      trackingNumber: body.trackingNumber ?? null,
    });
    return NextResponse.json({
      status: order.status,
      fulfilledAt: order.fulfilledAt,
      trackingCarrier: order.trackingCarrier,
    });
  } catch (err) {
    if (err instanceof ShopOrderError) {
      const status = err.code === "NOT_FOUND" ? 404 : err.code === "INVALID_STATE" ? 409 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[shop-orders/fulfill]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
