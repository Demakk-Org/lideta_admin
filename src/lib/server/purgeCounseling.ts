import { adminDb, FieldValue } from '@/lib/firebase/admin';

// Collection names mirror cloud_functions functions/src/counseling/shared.ts.
const MAPPINGS = 'counseling_identity_mappings';
const REQUESTS = 'counseling_requests';
const SESSIONS = 'counseling_sessions';
const AUDIT = 'counseling_audit_logs';

/**
 * Deletes a member's counseling requests, sessions and messages, then the
 * mapping that links them to the account. Open sessions go with them.
 * Mapping is deleted last so a retry after a partial failure finds the rest.
 */
export async function purgeCounselingForUser(
  uid: string,
  adminUid: string,
): Promise<number> {
  const mappingRef = adminDb.collection(MAPPINGS).doc(uid);
  const mapping = await mappingRef.get();
  if (!mapping.exists) return 0;

  const requestIds = (mapping.get('requestIds') as string[] | undefined) ?? [];
  for (const requestId of requestIds) {
    // recursiveDelete also removes the messages subcollection.
    await adminDb.recursiveDelete(adminDb.collection(SESSIONS).doc(requestId));
    const batch = adminDb.batch();
    batch.delete(adminDb.collection(REQUESTS).doc(requestId));
    // Same shape as the backend's writeAudit; no uid of the requester.
    batch.set(adminDb.collection(AUDIT).doc(), {
      event: 'account.deleted',
      requestId,
      actorRole: 'admin',
      actorUid: adminUid,
      fromCounselorId: null,
      toCounselorId: null,
      reason: null,
      at: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }

  await mappingRef.delete();
  return requestIds.length;
}
