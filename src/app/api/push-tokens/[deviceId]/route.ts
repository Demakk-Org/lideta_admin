import { NextRequest, NextResponse } from "next/server";
import Logger from "@/lib/utils/logger";
import {
  authenticateRequest,
  buildDocId,
  pushTokensCollection,
} from "../helpers";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { deviceId?: string } },
) {
  try {
    const decodedUser = await authenticateRequest(_req);
    const deviceId = params.deviceId;

    if (!deviceId) {
      return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
    }

    const docRef = pushTokensCollection.doc(
      buildDocId(decodedUser.uid, deviceId),
    );
    await docRef.delete();

    return NextResponse.json({ ok: true });
  } catch (error) {
    Logger.error("[pushTokensApi] DELETE", "Failed to delete push token", {
      error: error instanceof Error ? error.message : "unknown",
    });
    const status =
      error instanceof Error &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    return NextResponse.json(
      { error: "Failed to delete push token" },
      { status },
    );
  }
}
