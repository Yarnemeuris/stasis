import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { sanitize } from "@/lib/sanitize"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const { userId } = await params

  // Only expose users who have at least one submission — anything else would
  // let reviewers enumerate users they haven't otherwise seen via the queue.
  const user = await prisma.user.findFirst({
    where: { id: userId, projects: { some: { submissions: { some: {} } } } },
    select: { id: true, name: true, email: true, image: true, slackId: true },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const note = await prisma.reviewerNote.findUnique({
    where: { aboutUserId: userId },
    select: { content: true, updatedAt: true },
  })

  return NextResponse.json({ user, note })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const { userId } = await params
  const body = await request.json()
  const { content } = body

  if (typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 })
  }

  // Same restriction as GET: only authors of submissions are addressable.
  const user = await prisma.user.findFirst({
    where: { id: userId, projects: { some: { submissions: { some: {} } } } },
    select: { id: true },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const sanitizedContent = sanitize(content.trim())

  if (sanitizedContent === "") {
    // Empty note — drop the row entirely so search "has note" stays accurate.
    await prisma.reviewerNote.deleteMany({ where: { aboutUserId: userId } })
    return NextResponse.json({ content: "", updatedAt: new Date().toISOString() })
  }

  const note = await prisma.reviewerNote.upsert({
    where: { aboutUserId: userId },
    update: { content: sanitizedContent },
    create: { aboutUserId: userId, content: sanitizedContent },
  })

  return NextResponse.json(note)
}
