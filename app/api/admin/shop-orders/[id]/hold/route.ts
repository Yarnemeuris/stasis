import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-auth";
import { Permission } from "@/lib/permissions";
import { holdShopOrder, ShopOrderError } from "@/lib/shop-orders";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY);
  if (authCheck.error) return authCheck.error;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };

  try {
    const order = await holdShopOrder({
      adminId: authCheck.session.user.id,
      adminEmail: authCheck.session.user.email,
      orderId: id,
      reason: body.reason,
    });
    return NextResponse.json({ status: order.status, heldAt: order.heldAt });
  } catch (err) {
    return handleShopOrderError(err);
  }
}

function handleShopOrderError(err: unknown): NextResponse {
  if (err instanceof ShopOrderError) {
    const status = err.code === "NOT_FOUND" ? 404 : err.code === "INVALID_STATE" ? 409 : 400;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
  console.error("[shop-orders/hold]", err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
