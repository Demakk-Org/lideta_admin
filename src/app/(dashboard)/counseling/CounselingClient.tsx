'use client';

import { useEffect, useMemo, useState } from 'react';
import AppButton, { AppButtonVariant } from '@/components/ui/AppButton';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import PagedGridPage from '@/components/ui/PagedGridPage';
import { useAuthReady } from '@/lib/hooks/useAuthReady';
import { usePagedItems } from '@/lib/hooks/usePagedItems';
import {
  COUNSELING_STATUSES,
  DECLINE_REASON_LABELS,
  watchCounselors,
  watchRequestsByStatus,
  type CounselingRequest,
  type CounselingStatus,
  type CounselorOption,
  type DeclineReason,
} from '@/lib/api/counseling';
import CounselingRequestModal from './_components/CounselingRequestModal';
import { STATUS_LABELS, categoryLabel, formatDateTime } from './_components/counselingFormat';

export default function CounselingClient() {
  // Admin-only collections; querying before auth restores fails the rules check.
  const { ready, uid } = useAuthReady();
  const [filter, setFilter] = useState<CounselingStatus>('submitted');
  const [items, setItems] = useState<CounselingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counselors, setCounselors] = useState<CounselorOption[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !uid) return;
    setLoading(true);
    setError(null);
    return watchRequestsByStatus(
      filter,
      (list) => {
        // The queue reads oldest first; finished lists read newest first.
        setItems(filter === 'submitted' || filter === 'assigned' ? list : [...list].reverse());
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
  }, [ready, uid, filter]);

  useEffect(() => {
    if (!ready || !uid) return;
    return watchCounselors(setCounselors, (err) => setError(err.message));
  }, [ready, uid]);

  const activeCounselorIds = useMemo(
    () => (counselors ? new Set(counselors.map((c) => c.uid)) : null),
    [counselors],
  );
  const counselorInactive = (row: CounselingRequest) =>
    row.status === 'assigned' &&
    !!row.assignedCounselorId &&
    !!activeCounselorIds &&
    !activeCounselorIds.has(row.assignedCounselorId);

  const { pageItems, paginationProps } = usePagedItems(items, {
    pageSize: 10,
    pageSizeOptions: [10, 25, 50, 100],
  });

  // Kept by id so a status change (e.g. another admin assigning) moves it off this list.
  const openRequest = openId ? items.find((r) => r.id === openId) : undefined;

  return (
    <>
      <PagedGridPage
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-primary-800">Counseling</h2>
              <p className="text-sm text-primary-700">
                Anonymous requests from members. Assign each one to a counselor; only
                they and the requester can read the conversation.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {COUNSELING_STATUSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setFilter(value);
                    setOpenId(null);
                  }}
                  className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    filter === value
                      ? 'bg-primary-700 text-white'
                      : 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                  }`}
                >
                  {STATUS_LABELS[value]}
                </button>
              ))}
            </div>
          </div>
        }
        pager={<Pagination {...paginationProps} />}
      >
        <DataTable
          rows={pageItems}
          getKey={(row) => row.id}
          empty={
            error ? (
              <span className="text-red-600">{error}</span>
            ) : loading || !ready ? (
              'Loading…'
            ) : (
              'No requests here.'
            )
          }
          columns={[
            {
              header: 'Requester',
              className: 'text-primary-900',
              cell: (row) => (
                <div>
                  <div className="font-medium">{row.alias}</div>
                  <div className="text-xs text-primary-600">{categoryLabel(row.category)}</div>
                </div>
              ),
            },
            {
              header: 'Message',
              cell: (row) => (
                <div className="max-w-md truncate text-primary-700" title={row.initialMessage}>
                  {row.initialMessage}
                </div>
              ),
            },
            {
              header: 'Submitted',
              cell: (row) => formatDateTime(row.createdAt),
            },
            {
              header: filter === 'declined' ? 'Reason' : 'Counselor',
              cell: (row) => {
                if (filter === 'declined') {
                  return row.declineReason
                    ? (DECLINE_REASON_LABELS[row.declineReason as DeclineReason] ?? row.declineReason)
                    : '—';
                }
                if (!row.counselorName) return '—';
                return (
                  <div>
                    <div>{row.counselorName}</div>
                    {counselorInactive(row) && (
                      <div className="text-xs font-semibold text-red-600">
                        Counselor no longer active
                      </div>
                    )}
                  </div>
                );
              },
            },
            {
              header: 'Actions',
              className: 'text-right',
              cell: (row) => (
                <AppButton
                  variant={AppButtonVariant.Edit}
                  className="px-3 py-1 text-xs"
                  onClick={() => setOpenId(row.id)}
                >
                  {row.status === 'submitted'
                    ? 'Review'
                    : row.status === 'assigned'
                      ? 'Manage'
                      : 'View'}
                </AppButton>
              ),
            },
          ]}
        />
      </PagedGridPage>

      <CounselingRequestModal
        request={openRequest}
        openedId={openId}
        counselors={counselors ?? []}
        currentUid={uid}
        counselorInactive={openRequest ? counselorInactive(openRequest) : false}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
