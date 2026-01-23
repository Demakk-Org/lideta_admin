import { NextRequest } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

const COLLECTION_NAME = "push_tokens";

export class AuthError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

export async function authenticateRequest(
  req: NextRequest,
): Promise<DecodedIdToken> {
  const token = req.cookies.get("token")?.value;
  if (!token) {
    throw new AuthError(401, "Missing authentication token");
  }

  try {
    return await adminAuth.verifyIdToken(token);
  } catch (error) {
    throw new AuthError(401, "Invalid authentication token");
  }
}

export const pushTokensCollection = adminDb.collection(COLLECTION_NAME);

export function buildDocId(userId: string, deviceId: string): string {
  return `${userId}__${deviceId}`;
}
