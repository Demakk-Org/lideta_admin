import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  authenticateRequest,
  buildDocId,
  pushTokensCollection,
  startRequestLog,
  tokenFingerprint,
} from "../helpers";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ deviceId: string }> },
) {
  const log = startRequestLog("[pushTokensApi] DELETE");
  log.info("request_start", {
    ip: _req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: _req.headers.get("user-agent") ?? null,
  });

  try {
    const decodedUser = await authenticateRequest(_req, log);

    const { deviceId } = await context.params;
    log.info("params_resolved", { uid: decodedUser.uid, deviceId: deviceId ?? null });

    if (!deviceId) {
      log.warn("missing_device_id");
      return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
    }

    const id = buildDocId(decodedUser.uid, deviceId);
    const docRef = pushTokensCollection.doc(id);

    // Firestore deletes are idempotent: removing a doc that was never there returns
    // success. That makes "I unregistered but still get pushes" impossible to tell
    // apart from "the row I meant to delete had a different id". One read on a
    // rarely-hit endpoint buys that distinction — and the fingerprint of the token
    // being removed, for cross-referencing against a delivery failure.
    log.info("firestore_read_start", { collection: "push_tokens", docId: id });
    const snap = await docRef.get();
    log.info("firestore_read_done", {
      docId: id,
      existed: snap.exists,
      platform: snap.get("platform") ?? null,
      appVersion: snap.get("appVersion") ?? null,
      fcmToken: tokenFingerprint(snap.get("fcmToken")),
    });

    if (!snap.exists) {
      // Still a 200 — the caller's intent ("this device should not receive pushes")
      // is satisfied. Logged as a warning because it usually means a doc-id mismatch.
      log.warn("delete_noop_doc_absent", { uid: decodedUser.uid, deviceId, docId: id });
      return NextResponse.json({ ok: true });
    }

    log.info("firestore_delete_start", { docId: id });
    const writeResult = await docRef.delete();

    log.info("deleted", {
      uid: decodedUser.uid,
      deviceId,
      docId: id,
      writeTime: writeResult.writeTime.toDate().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthError ? error.statusCode : 500;
    log.error("failed", {
      status,
      firebaseCode: (error as { code?: string })?.code ?? null,
      error: error instanceof Error ? error.message : "unknown",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Failed to delete push token" },
      { status },
    );
  }
}
