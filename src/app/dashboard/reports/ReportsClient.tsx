'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAppDispatch, useAppSelector } from '@/lib/redux/store';
import AppButton, { AppButtonVariant } from '@/components/ui/AppButton';
import ConfirmDeleteModal from '@/components/ui/ConfirmDeleteModal';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import PagedGridPage from '@/components/ui/PagedGridPage';
import { usePagedItems } from '@/lib/hooks/usePagedItems';
import {
  fetchReports,
  removeReportedMessage,
  setReportStatus,
} from '@/lib/redux/features/reportsSlice';
import type { ReportStatus } from '@/lib/api/reports';

const STATUS_FILTERS: Array<ReportStatus | 'all'> = [
  'pending',
  'reviewed',
  'dismissed',
  'all',
];

const STATUS_STYLES: Record<ReportStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  reviewed: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-200 text-gray-700',
};

/** Mirrors `ReportReason` in the mobile app. */
const REASON_LABELS: Record<string, string> = {
  spam: 'Spam or advertising',
  harassment: 'Harassment or bullying',
  hateSpeech: 'Hate speech',
  sexualContent: 'Sexual content',
  violence: 'Violence or threats',
  falseInformation: 'False or misleading teaching',
  other: 'Something else',
};

function formatDate(iso: string) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

export default function ReportsClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.reports);
  const loading = status === 'loading';

  const [filter, setFilter] = useState<ReportStatus | 'all'>('pending');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchReports());
  }, [dispatch]);

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((r) => r.status === filter)),
    [items, filter],
  );

  const { pageItems, paginationProps } = usePagedItems(filtered, {
    pageSize: 10,
    pageSizeOptions: [10, 25, 50, 100],
  });

  const changeStatus = async (
    id: string,
    next: ReportStatus,
    note?: string,
  ) => {
    setBusyId(id);
    try {
      await dispatch(
        setReportStatus({ id, data: { status: next, resolutionNote: note } }),
      ).unwrap();
      toast.success(`Marked ${next}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const runMessageDeletion = async () => {
    if (!confirmingId) return;
    setBusyId(confirmingId);
    try {
      await dispatch(removeReportedMessage(confirmingId)).unwrap();
      toast.success('Message deleted');
      setConfirmingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PagedGridPage
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-primary-800">
                Reported messages
              </h2>
              <p className="text-sm text-primary-700">
                Content members reported from Bible-study group chat.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    filter === value
                      ? 'bg-primary-700 text-white'
                      : 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                  }`}
                >
                  {value}
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
          empty={loading ? 'Loading…' : 'No reports here.'}
          columns={[
            {
              header: 'Reason',
              className: 'text-primary-900',
              cell: (row) => (
                <div>
                  <div className="font-medium">
                    {REASON_LABELS[row.reason] ?? row.reason}
                  </div>
                  {row.note && (
                    <div className="mt-1 max-w-xs text-xs text-primary-600">
                      “{row.note}”
                    </div>
                  )}
                </div>
              ),
            },
            {
              header: 'Reported content',
              cell: (row) => (
                <div className="max-w-sm">
                  <div className="text-xs text-primary-600">
                    {row.messageType}
                  </div>
                  <div className="mt-1 break-words whitespace-pre-wrap">
                    {row.contentSnapshot ?? '— no snapshot —'}
                  </div>
                </div>
              ),
            },
            {
              header: 'Sender / reporter',
              cell: (row) => (
                <div className="text-xs break-all text-primary-600">
                  <div>sender: {row.reportedUserId || '—'}</div>
                  <div>reporter: {row.reporterUserId || '—'}</div>
                </div>
              ),
            },
            { header: 'Filed', cell: (row) => formatDate(row.createdAt) },
            {
              header: 'Status',
              cell: (row) => (
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[row.status]}`}
                >
                  {row.status}
                </span>
              ),
            },
            {
              header: 'Actions',
              className: 'text-right',
              cell: (row) => {
                const busy = busyId === row.id;
                if (row.status !== 'pending') {
                  return (
                    <span className="text-xs text-primary-600">
                      {row.resolutionNote ?? '—'}
                    </span>
                  );
                }
                return (
                  <div className="inline-flex gap-2">
                    <AppButton
                      variant={AppButtonVariant.Delete}
                      className="px-3 py-1 text-xs"
                      disabled={busy}
                      onClick={() => setConfirmingId(row.id)}
                    >
                      Delete message
                    </AppButton>
                    <AppButton
                      variant={AppButtonVariant.Edit}
                      className="px-3 py-1 text-xs"
                      disabled={busy}
                      onClick={() =>
                        changeStatus(row.id, 'reviewed', 'Reviewed, kept.')
                      }
                    >
                      Keep
                    </AppButton>
                    <AppButton
                      variant={AppButtonVariant.Edit}
                      className="px-3 py-1 text-xs"
                      disabled={busy}
                      onClick={() =>
                        changeStatus(row.id, 'dismissed', 'No action needed.')
                      }
                    >
                      Dismiss
                    </AppButton>
                  </div>
                );
              },
            },
          ]}
        />
      </PagedGridPage>

      <ConfirmDeleteModal
        open={confirmingId !== null}
        title="Delete this message for everyone in the group? This cannot be undone."
        confirmLabel="Delete message"
        disabled={busyId !== null}
        onCancel={() => setConfirmingId(null)}
        onConfirm={runMessageDeletion}
      />
    </>
  );
}
