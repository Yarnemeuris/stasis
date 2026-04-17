import prisma from "@/lib/prisma";

const DISCOVERY_URL = "https://auth.hackclub.com/.well-known/openid-configuration";
const ME_ENDPOINT = "https://auth.hackclub.com/api/v1/me";

export interface HcaAddress {
  id: string;
  first_name: string | null;
  last_name: string | null;
  line_1: string | null;
  line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  phone_number: string | null;
  primary: boolean;
}

export interface HcaIdentity {
  id: string;
  ysws_eligible?: boolean;
  verification_status?: string | null;
  primary_email?: string | null;
  slack_id?: string | null;
  birthday?: string | null;
  addresses: HcaAddress[];
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
}

let cachedTokenEndpoint: string | null = null;

async function getTokenEndpoint(): Promise<string> {
  if (cachedTokenEndpoint) return cachedTokenEndpoint;
  const resp = await fetch(DISCOVERY_URL);
  if (!resp.ok) throw new Error(`Failed to fetch OIDC discovery: ${resp.status}`);
  const config = await resp.json();
  cachedTokenEndpoint = config.token_endpoint;
  return cachedTokenEndpoint!;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse | null> {
  const tokenEndpoint = await getTokenEndpoint();
  const resp = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.HCA_CLIENT_ID!,
      client_secret: process.env.HCA_CLIENT_SECRET!,
    }),
  });
  if (!resp.ok) return null;
  return resp.json() as Promise<TokenResponse>;
}

async function fetchMe(accessToken: string): Promise<HcaIdentity | null> {
  const resp = await fetch(ME_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return (data?.identity ?? null) as HcaIdentity | null;
}

/**
 * Fetches the user's HCA identity (including all configured addresses) using
 * the stored HCA access token. Transparently refreshes the token once on 401.
 * Returns null if the user has no HCA account or refresh ultimately fails.
 */
export async function fetchHcaIdentity(userId: string): Promise<HcaIdentity | null> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "hca" },
    select: { id: true, accessToken: true, refreshToken: true },
  });
  if (!account?.accessToken) return null;

  let identity = await fetchMe(account.accessToken);
  if (identity) return identity;

  if (!account.refreshToken) return null;

  const refreshed = await refreshAccessToken(account.refreshToken);
  if (!refreshed) return null;

  await prisma.account.update({
    where: { id: account.id },
    data: {
      accessToken: refreshed.access_token,
      ...(refreshed.refresh_token ? { refreshToken: refreshed.refresh_token } : {}),
      ...(refreshed.expires_in
        ? { accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000) }
        : {}),
    },
  });

  identity = await fetchMe(refreshed.access_token);
  return identity;
}

export function formatHcaAddress(addr: HcaAddress): string {
  const name = [addr.first_name, addr.last_name].filter(Boolean).join(" ").trim();
  const lineParts = [addr.line_1, addr.line_2].filter(Boolean).join(", ");
  const cityPart = [addr.city, addr.state].filter(Boolean).join(", ");
  const zipCountry = [addr.postal_code, addr.country].filter(Boolean).join(" ");
  const locationLine = [cityPart, zipCountry].filter(Boolean).join(" ");
  return [name, lineParts, locationLine].filter(Boolean).join(" — ");
}
