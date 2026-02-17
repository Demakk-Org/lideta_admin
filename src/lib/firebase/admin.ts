/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  getApps,
  initializeApp,
  applicationDefault,
  cert,
} from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import type { ServiceAccount } from "firebase-admin";
import Logger from "../utils/logger";

const DATABASE_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("FIREBASE_DATABASE_URL environment variable is missing.");
}

const ENV_SERVICE_ACCOUNT: Partial<ServiceAccount> = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

if (!getApps().length) {
  try {
    if (
      !ENV_SERVICE_ACCOUNT.projectId ||
      !ENV_SERVICE_ACCOUNT.clientEmail ||
      !ENV_SERVICE_ACCOUNT.privateKey
    ) {
      throw new Error(
        "Missing Firebase admin service account environment variables",
      );
    }

    const serviceAccount: ServiceAccount = {
      projectId: ENV_SERVICE_ACCOUNT.projectId,
      clientEmail: ENV_SERVICE_ACCOUNT.clientEmail,
      privateKey: ENV_SERVICE_ACCOUNT.privateKey,
    };

    process.env.GOOGLE_CLOUD_PROJECT ??= serviceAccount.projectId!;
    process.env.GCLOUD_PROJECT ??= serviceAccount.projectId!;

    initializeApp({
      credential: cert(serviceAccount),
      databaseURL: DATABASE_URL,
      projectId: serviceAccount.projectId,
    });

    Logger.info("firebase-admin", "Initialized Firebase Admin SDK", {
      projectId: serviceAccount.projectId,
      clientEmail: serviceAccount.clientEmail,
    });
  } catch (error) {
    Logger.error(
      "firebase-admin",
      "Falling back to Application Default Credentials",
      {
        error: (error as Error).message,
      },
    );

    initializeApp({
      credential: applicationDefault(),
      databaseURL: DATABASE_URL,
    });
  }
}

export const adminDb = getFirestore();
export const adminAuth = getAuth();
export const adminMessaging = getMessaging();
export { FieldValue };
