import { NextResponse } from "next/server";
import { deactivate } from "@/lib/license";

export async function POST() {
  try {
    const result = await deactivate();
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { success: false, message: "Could not deactivate license." },
      { status: 500 },
    );
  }
}
