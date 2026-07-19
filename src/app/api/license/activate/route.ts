import { NextResponse } from "next/server";
import { z } from "zod";
import { activate } from "@/lib/license";

const schema = z.object({
  license_key: z.string().min(1).max(128),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Enter a license key." }, { status: 400 });
    }
    const result = await activate(parsed.data.license_key);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Could not activate license. Buy a license at ramerlabs.com.",
      },
      { status: 500 },
    );
  }
}
