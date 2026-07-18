import { NextResponse } from "next/server";
import { getAblyRest, isAblyEnabled } from "@/lib/ably";
import { requireUser } from "@/lib/session";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  if (!isAblyEnabled()) {
    return NextResponse.json({
      enabled: false,
      mode: "polling",
      message: "ABLY_API_KEY not configured — client will poll for updates",
    });
  }

  const rest = getAblyRest();
  if (!rest) {
    return NextResponse.json({ enabled: false, mode: "polling" });
  }

  const tokenRequest = await rest.auth.createTokenRequest({
    clientId: authResult.userId,
    capability: {
      "room:*": ["subscribe", "presence"],
    },
  });

  return NextResponse.json({ enabled: true, mode: "ably", tokenRequest });
}
