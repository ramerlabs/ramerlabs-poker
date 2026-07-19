import { NextResponse } from "next/server";
import { getAblyConfig, getAblyRest, isAblyEnabled, maskAblyKey } from "@/lib/ably";
import { requireUser } from "@/lib/session";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const cfg = await getAblyConfig();
  if (!(await isAblyEnabled())) {
    return NextResponse.json({
      enabled: false,
      mode: "polling",
      message: !cfg.adminEnabled
        ? "Ably is disabled in Admin settings — client will poll for updates"
        : !cfg.hasKey
          ? "No Ably API key configured — client will poll for updates"
          : "Ably unavailable — client will poll for updates",
    });
  }

  const rest = await getAblyRest();
  if (!rest) {
    return NextResponse.json({ enabled: false, mode: "polling" });
  }

  const tokenRequest = await rest.auth.createTokenRequest({
    clientId: authResult.userId,
    capability: {
      "room:*": ["subscribe", "presence"],
    },
  });

  return NextResponse.json({
    enabled: true,
    mode: "ably",
    tokenRequest,
    keyHint: maskAblyKey(cfg.apiKey),
  });
}
