import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import Logger from "@/lib/utils/logger";
import { authenticateRequest, pushTokensCollection } from "./helpers";

type PushTokenPayload = {
  userId: string;
  fcmToken: string;
  apnsToken?: string;
  platform: string;
  deviceId: string;
  appVersion: string;
};

const SUPPORTED_PLATFORMS = new Set(["ios", "android", "web"]);

function validatePayload(
  payload: Partial<PushTokenPayload>,
): payload is PushTokenPayload {
  if (!payload) return false;
  const { userId, fcmToken, platform, deviceId, appVersion } = payload;
  if (
    ![userId, fcmToken, platform, deviceId, appVersion].every(
      (v) => typeof v === "string" && v.trim(),
    )
  ) {
    return false;
  }
  if (!platform || !SUPPORTED_PLATFORMS.has(platform.toLowerCase())) {
    return false;
  }
  if (payload.apnsToken && typeof payload.apnsToken !== "string") {
    return false;
  }
  return true;
}

function docId(userId: string, deviceId: string) {
  return `${userId}__${deviceId}`;
}

export async function POST(req: NextRequest) {
  try {
    const decodedUser = await authenticateRequest(req);
    const body = (await req.json()) as Partial<PushTokenPayload>;

    if (!validatePayload(body)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (decodedUser.uid !== body.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const normalizedPlatform = body.platform.toLowerCase();
    const docRef = pushTokensCollection.doc(docId(body.userId, body.deviceId));
    await docRef.set(
      {
        userId: body.userId,
        deviceId: body.deviceId,
        platform: normalizedPlatform,
        fcmToken: body.fcmToken,
        apnsToken: body.apnsToken ?? null,
        appVersion: body.appVersion,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    Logger.error("[pushTokensApi] POST", "Failed to upsert push token", {
      error: error instanceof Error ? error.message : "unknown",
    });
    const status =
      error instanceof Error && /auth/i.test(error.message) ? 401 : 500;
    return NextResponse.json(
      { error: "Failed to upsert push token" },
      { status },
    );
  }
}
