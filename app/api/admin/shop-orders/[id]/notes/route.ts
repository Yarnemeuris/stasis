import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/admin-auth";
import { Permission } from "@/lib/permissions";
import { addShopOrderNote, ShopOrderError } from "@/lib/shop-orders";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY);
  if (authCheck.error) return authCheck.error;

  const { id } = await params;

  const notes = await prisma.shopOrderNote.findMany({
    where: { orderId: id },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  return NextResponse.json({
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      author: n.author,
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY);
  if (authCheck.error) return authCheck.error;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { body?: string };

  if (typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "body is required", code: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    const note = await addShopOrderNote({
      adminId: authCheck.session.user.id,
      adminEmail: authCheck.session.user.email,
      orderId: id,
      body: body.body,
    });

    const withAuthor = await prisma.shopOrderNote.findUnique({
      where: { id: note.id },
      include: { author: { select: { id: true, name: true, email: true, image: true } } },
    });

    return NextResponse.json({
      note: withAuthor && {
        id: withAuthor.id,
        body: withAuthor.body,
        createdAt: withAuthor.createdAt.toISOString(),
        author: withAuthor.author,
      },
    });
  } catch (err) {
    if (err instanceof ShopOrderError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[shop-orders/notes]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
