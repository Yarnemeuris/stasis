import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-auth";
import { Permission } from "@/lib/permissions";
import { unholdShopOrder, ShopOrderError } from "@/lib/shop-orders";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY);
  if (authCheck.error) return authCheck.error;

  const { id } = await params;

  try {
    const order = await unholdShopOrder({
      adminId: authCheck.session.user.id,
      adminEmail: authCheck.session.user.email,
      orderId: id,
    });
    return NextResponse.json({ status: order.status });
  } catch (err) {
    if (err instanceof ShopOrderError) {
      const status = err.code === "NOT_FOUND" ? 404 : err.code === "INVALID_STATE" ? 409 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[shop-orders/unhold]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
