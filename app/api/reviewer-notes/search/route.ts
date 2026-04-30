import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const q = (request.nextUrl.searchParams.get("q") || "").trim()
  if (q.length < 2) {
    return NextResponse.json({ users: [] })
  }

  const users = await prisma.user.findMany({
    where: {
      // Restrict to users who have at least one submission — reviewers
      // already encounter these users through the queue, so this leaks no
      // info beyond what they could already discover by reviewing.
      projects: { some: { submissions: { some: {} } } },
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { slackId: { contains: q, mode: "insensitive" } },
        { id: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, email: true, image: true, slackId: true },
    take: 20,
    orderBy: [{ name: "asc" }, { email: "asc" }],
  })

  if (users.length === 0) {
    return NextResponse.json({ users: [] })
  }

  const noteUserIds = new Set(
    (
      await prisma.reviewerNote.findMany({
        where: {
          aboutUserId: { in: users.map((u) => u.id) },
          content: { not: "" },
        },
        select: { aboutUserId: true },
      })
    ).map((n) => n.aboutUserId)
  )

  return NextResponse.json({
    users: users.map((u) => ({ ...u, hasNote: noteUserIds.has(u.id) })),
  })
}
