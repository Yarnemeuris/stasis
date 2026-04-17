import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { fetchHcaIdentity } from "@/lib/hca";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const identity = await fetchHcaIdentity(session.user.id);
  if (!identity) {
    return NextResponse.json({
      addresses: [],
      verified: false,
      hcaAvailable: false,
    });
  }

  return NextResponse.json({
    addresses: identity.addresses ?? [],
    verified: identity.verification_status === "verified",
    hcaAvailable: true,
  });
}
