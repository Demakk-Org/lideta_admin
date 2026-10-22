'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AppButton, { AppButtonVariant } from '@/components/ui/AppButton';
import AppModal from '@/components/ui/AppModal';
import {
  DECLINE_REASONS,
  DECLINE_REASON_LABELS,
  MAX_REASSIGN_REASON,
  assignCounselor,
  closeCounseling,
  declineCounselingRequest,
  reassignCounselor,
  type CounselingRequest,
  type CounselorOption,
  type DeclineReason,
} from '@/lib/api/counseling';
import { UserRole } from '@/lib/api/users';
import { STATUS_LABELS, STATUS_STYLES, categoryLabel, formatDateTime } from './counselingFormat';

type Props = {
  /** Live copy from the open list; undefined once it leaves that list. */
  request: CounselingRequest | undefined;
  openedId: string | null;
  counselors: CounselorOption[];
  currentUid: string | null;
  counselorInactive: boolean;
  onClose: () => void;
};

const selectClass =
  'mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

export default function CounselingRequestModal({
  request,
  openedId,
  counselors,
  currentUid,
  counselorInactive,
  onClose,
}: Props) {
  // Last version seen, so the modal can say it changed instead of vanishing.
  const [shown, setShown] = useState<CounselingRequest | undefined>(request);
  const [busy, setBusy] = useState(false);
  const [counselorUid, setCounselorUid] = useState('');
  const [reason, setReason] = useState('');
  const [declineReason, setDeclineReason] = useState<DeclineReason>('needsMoreDetail');
  const [confirmingClose, setConfirmingClose] = useState(false);

  useEffect(() => {
    if (request) setShown(request);
  }, [request]);

  useEffect(() => {
    setShown(request);
    setCounselorUid('');
    setReason('');
    setDeclineReason('needsMoreDetail');
    setConfirmingClose(false);
    // Reset only when a different request is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedId]);

  const open = openedId !== null && shown !== undefined;
  if (!open || !shown) return null;

  // Gone from the list while idle = someone else changed its status.
  const changedElsewhere = !request && !busy;
  const isSubmitted = shown.status === 'submitted' && !changedElsewhere;
  const isAssigned = shown.status === 'assigned' && !changedElsewhere;
  const pickable = counselors.filter((c) => c.uid !== shown.assignedCounselorId);
  const me = counselors.find((c) => c.uid === currentUid);

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppModal
      open
      type="edit"
      title={shown.alias}
      onClose={onClose}
      cancelLabel="Close"
      widthClass="max-w-2xl"
    >
      <div className="space-y-4 text-sm text-primary-800">
        {changedElsewhere && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
            Another admin already handled this request. Close this window and check
            the other tabs.
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-primary-600">Status</dt>
            <dd>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[shown.status]}`}
              >
                {STATUS_LABELS[shown.status]}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-primary-600">Category</dt>
            <dd>{categoryLabel(shown.category)}</dd>
          </div>
          <div>
            <dt className="text-xs text-primary-600">Submitted</dt>
            <dd>{formatDateTime(shown.createdAt)}</dd>
          </div>
          {shown.counselorName && (
            <div>
              <dt className="text-xs text-primary-600">Counselor</dt>
              <dd>
                {shown.counselorName}
                {counselorInactive && (
                  <span className="ml-1 text-xs font-semibold text-red-600">
                    (no longer active)
                  </span>
                )}
              </dd>
            </div>
          )}
          {shown.closedAt && (
            <div>
              <dt className="text-xs text-primary-600">
                {shown.status === 'declined' ? 'Declined' : 'Closed'}
              </dt>
              <dd>
                {formatDateTime(shown.closedAt)}
                {shown.closedBy && (
                  <span className="text-xs text-primary-600"> by {shown.closedBy}</span>
                )}
              </dd>
            </div>
          )}
          {shown.declineReason && (
            <div>
              <dt className="text-xs text-primary-600">Reason</dt>
              <dd>
                {DECLINE_REASON_LABELS[shown.declineReason as DeclineReason] ??
                  shown.declineReason}
              </dd>
            </div>
          )}
        </dl>

        <div>
          <div className="text-xs text-primary-600">Request</div>
          <p className="mt-1 whitespace-pre-wrap rounded-md border border-primary-100 bg-primary-50 px-3 py-2">
            {shown.initialMessage}
          </p>
        </div>

        {isSubmitted && (
          <>
            <section className="space-y-2 border-t border-primary-100 pt-4">
              <h3 className="font-semibold text-primary-800">Assign</h3>
              <label className="block">
                <span className="text-xs text-primary-600">Counselor</span>
                <select
                  className={selectClass}
                  value={counselorUid}
                  onChange={(e) => setCounselorUid(e.target.value)}
                  disabled={busy}
                >
                  <option value="">Choose a counselor…</option>
                  {pickable.map((c) => (
                    <option key={c.uid} value={c.uid}>
                      {c.name}
                      {c.role === UserRole.Admin ? ' (admin)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {pickable.length === 0 && (
                <p className="text-xs text-primary-600">
                  No counselors yet. Give a user the Counselor role on the Users page.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <AppButton
                  variant={AppButtonVariant.Add}
                  className="px-3 py-1 text-xs"
                  disabled={busy || !counselorUid}
                  onClick={() =>
                    run(() => assignCounselor(shown.id, counselorUid), 'Counselor assigned')
                  }
                >
                  Assign
                </AppButton>
                {me && (
                  <AppButton
                    variant={AppButtonVariant.Edit}
                    className="px-3 py-1 text-xs"
                    disabled={busy}
                    onClick={() =>
                      run(() => assignCounselor(shown.id, me.uid), 'Assigned to you')
                    }
                  >
                    Assign to me
                  </AppButton>
                )}
              </div>
            </section>

            <section className="space-y-2 border-t border-primary-100 pt-4">
              <h3 className="font-semibold text-primary-800">Decline</h3>
              <p className="text-xs text-primary-600">
                The requester sees the reason in the app.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <select
                  className={`${selectClass} w-auto`}
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value as DeclineReason)}
                  disabled={busy}
                >
                  {DECLINE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {DECLINE_REASON_LABELS[r]}
                    </option>
                  ))}
                </select>
                <AppButton
                  variant={AppButtonVariant.Delete}
                  className="px-3 py-1 text-xs"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => declineCounselingRequest(shown.id, declineReason),
                      'Request declined',
                    )
                  }
                >
                  Decline
                </AppButton>
              </div>
            </section>
          </>
        )}

        {isAssigned && (
          <>
            <section className="space-y-2 border-t border-primary-100 pt-4">
              <h3 className="font-semibold text-primary-800">Reassign</h3>
              <label className="block">
                <span className="text-xs text-primary-600">New counselor</span>
                <select
                  className={selectClass}
                  value={counselorUid}
                  onChange={(e) => setCounselorUid(e.target.value)}
                  disabled={busy}
                >
                  <option value="">Choose a counselor…</option>
                  {pickable.map((c) => (
                    <option key={c.uid} value={c.uid}>
                      {c.name}
                      {c.uid === currentUid ? ' (me)' : c.role === UserRole.Admin ? ' (admin)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-primary-600">
                  Reason (optional, kept in the audit log)
                </span>
                <input
                  className={selectClass}
                  value={reason}
                  maxLength={MAX_REASSIGN_REASON}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy}
                />
              </label>
              <AppButton
                variant={AppButtonVariant.Add}
                className="px-3 py-1 text-xs"
                disabled={busy || !counselorUid}
                onClick={() =>
                  run(
                    () =>
                      reassignCounselor({
                        requestId: shown.id,
                        counselorUid,
                        expectedVersion: shown.assignmentVersion,
                        reason,
                      }),
                    'Counselor reassigned',
                  )
                }
              >
                Reassign
              </AppButton>
            </section>

            <section className="space-y-2 border-t border-primary-100 pt-4">
              <h3 className="font-semibold text-primary-800">Close session</h3>
              <p className="text-xs text-primary-600">
                Normally the counselor or the requester closes it. The conversation is
                deleted 90 days after closing.
              </p>
              {confirmingClose ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span>Close this session for both sides?</span>
                  <AppButton
                    variant={AppButtonVariant.Delete}
                    className="px-3 py-1 text-xs"
                    disabled={busy}
                    onClick={() => run(() => closeCounseling(shown.id), 'Session closed')}
                  >
                    Yes, close
                  </AppButton>
                  <AppButton
                    variant={AppButtonVariant.Edit}
                    className="px-3 py-1 text-xs"
                    disabled={busy}
                    onClick={() => setConfirmingClose(false)}
                  >
                    Keep open
                  </AppButton>
                </div>
              ) : (
                <AppButton
                  variant={AppButtonVariant.Edit}
                  className="px-3 py-1 text-xs"
                  disabled={busy}
                  onClick={() => setConfirmingClose(true)}
                >
                  Close session
                </AppButton>
              )}
            </section>
          </>
        )}
      </div>
    </AppModal>
  );
}
