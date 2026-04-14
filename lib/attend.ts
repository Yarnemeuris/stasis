import { sendInviteConfirmationEmail } from "@/lib/loops"

export function splitName(fullName: string | null | undefined): {
  firstName: string
  lastName: string
} {
  const trimmed = (fullName ?? "").trim()
  if (!trimmed) return { firstName: "Hacker", lastName: "" }
  const parts = trimmed.split(/\s+/)
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  }
}

export async function registerAttendParticipant({
  firstName,
  lastName,
  email,
}: {
  firstName: string
  lastName: string
  email: string
}): Promise<void> {
  const apiKey = process.env.ATTEND_API_KEY
  if (!apiKey) {
    console.warn("ATTEND_API_KEY not configured, skipping Attend registration")
    return
  }

  const resp = await fetch(
    "https://attend.hackclub.com/api/v1/events/stasis/participants",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email,
      }),
    }
  )

  if (!resp.ok) {
    const body = await resp.text().catch(() => "<no body>")
    throw new Error(`Attend registration failed (${resp.status}): ${body}`)
  }
}

/**
 * Fire-and-forget side effects when a user purchases the Stasis Event Invite.
 * Logs errors but never throws.
 */
export async function runInvitePurchaseSideEffects({
  email,
  name,
}: {
  email: string
  name: string | null
}): Promise<void> {
  const { firstName, lastName } = splitName(name)

  await Promise.allSettled([
    sendInviteConfirmationEmail({ email, firstName }).catch((err) =>
      console.error("[invite-side-effects] Loops email failed:", err)
    ),
    registerAttendParticipant({ firstName, lastName, email }).catch((err) =>
      console.error("[invite-side-effects] Attend registration failed:", err)
    ),
  ])
}
