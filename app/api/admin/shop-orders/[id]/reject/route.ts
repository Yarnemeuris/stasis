import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-auth";
import { Permission } from "@/lib/permissions";
import { rejectShopOrder, ShopOrderError } from "@/lib/shop-orders";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY);
  if (authCheck.error) return authCheck.error;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };

  try {
    const order = await rejectShopOrder({
      adminId: authCheck.session.user.id,
      adminEmail: authCheck.session.user.email,
      orderId: id,
      reason: body.reason,
    });
    return NextResponse.json({ status: order.status, rejectedAt: order.rejectedAt });
  } catch (err) {
    if (err instanceof ShopOrderError) {
      const status = err.code === "NOT_FOUND" ? 404 : err.code === "INVALID_STATE" ? 409 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[shop-orders/reject]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
