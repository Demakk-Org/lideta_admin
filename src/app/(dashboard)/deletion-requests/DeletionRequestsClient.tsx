'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAppDispatch, useAppSelector } from '@/lib/redux/store';
import AppButton, { AppButtonVariant } from '@/components/ui/AppButton';
import ConfirmDeleteModal from '@/components/ui/ConfirmDeleteModal';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import PagedGridPage from '@/components/ui/PagedGridPage';
import { useAuthReady } from '@/lib/hooks/useAuthReady';
import { usePagedItems } from '@/lib/hooks/usePagedItems';
import {
  deleteAccountForRequest,
  fetchDeletionRequests,
  setDeletionRequestStatus,
} from '@/lib/redux/features/deletionRequestsSlice';
import type {
  DeletionRequestDoc,
  DeletionRequestStatus,
  WithId,
} from '@/lib/api/deletionRequests';

const STATUS_FILTERS: Array<DeletionRequestStatus | 'all'> = [
  'pending',
  'verified',
  'completed',
  'rejected',
  'all',
];

const STATUS_STYLES: Record<DeletionRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  verified: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  rejected: 'bg-gray-200 text-gray-700',
};

function StatusPill({ status }: { status: DeletionRequestStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

function formatDate(iso: string) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

export default function DeletionRequestsClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.deletionRequests);
  // Firebase restores the session after mount, and these collections are
  // admin-only, so querying before `ready` fails the rules check.
  const { ready, uid } = useAuthReady();
  const loading = status === 'loading' || !ready;

  const [filter, setFilter] = useState<DeletionRequestStatus | 'all'>(
    'pending',
  );
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (ready && uid) dispatch(fetchDeletionRequests());
  }, [dispatch, ready, uid]);

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
    next: DeletionRequestStatus,
    note?: string,
  ) => {
    setBusyId(id);
    try {
      await dispatch(
        setDeletionRequestStatus({
          id,
          data: { status: next, resolutionNote: note },
        }),
      ).unwrap();
      toast.success(`Marked ${next}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const confirmingRequest = confirmingId
    ? items.find((r) => r.id === confirmingId)
    : undefined;

  const runDeletion = async () => {
    if (!confirmingId) return;
    setBusyId(confirmingId);
    try {
      const result = await dispatch(
        deleteAccountForRequest(confirmingId),
      ).unwrap();
      toast.success(result.message);
      setConfirmingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deletion failed');
    } finally {
      setBusyId(null);
    }
  };

  const actionsFor = (row: WithId<DeletionRequestDoc>) => {
    const busy = busyId === row.id;

    if (row.status === 'pending') {
      return (
        <div className="inline-flex gap-2">
          <AppButton
            variant={AppButtonVariant.Edit}
            className="px-3 py-1 text-xs"
            disabled={busy}
            onClick={() => changeStatus(row.id, 'verified')}
          >
            Mark verified
          </AppButton>
          <AppButton
            variant={AppButtonVariant.Edit}
            className="px-3 py-1 text-xs"
            disabled={busy}
            onClick={() =>
              changeStatus(row.id, 'rejected', 'Could not verify the requester.')
            }
          >
            Reject
          </AppButton>
        </div>
      );
    }

    if (row.status === 'verified') {
      return (
        <AppButton
          variant={AppButtonVariant.Delete}
          className="px-3 py-1 text-xs"
          disabled={busy}
          onClick={() => setConfirmingId(row.id)}
        >
          Delete account
        </AppButton>
      );
    }

    return (
      <span className="text-xs text-primary-600">
        {row.resolutionNote ?? '—'}
      </span>
    );
  };

  return (
    <>
      <PagedGridPage
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-primary-800">
                Deletion requests
              </h2>
              <p className="text-sm text-primary-700">
                Account deletion requests from the public form. Verify the
                requester owns the contact before deleting anything.
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
          empty={loading ? 'Loading…' : 'No requests here.'}
          columns={[
            {
              header: 'Contact',
              className: 'text-primary-900',
              cell: (row) => (
                <div>
                  <div className="font-medium break-all">{row.contact}</div>
                  <div className="text-xs text-primary-600">
                    {row.contactType}
                  </div>
                </div>
              ),
            },
            {
              header: 'Scope',
              cell: (row) => (
                <div>
                  <div>
                    {row.scope === 'account' ? 'Whole account' : 'Some data'}
                  </div>
                  {row.details && (
                    <div className="mt-1 max-w-xs text-xs text-primary-600">
                      {row.details}
                    </div>
                  )}
                </div>
              ),
            },
            {
              header: 'Requested',
              cell: (row) => formatDate(row.createdAt),
            },
            {
              header: 'Status',
              cell: (row) => <StatusPill status={row.status} />,
            },
            {
              header: 'Actions',
              className: 'text-right',
              cell: actionsFor,
            },
          ]}
        />
      </PagedGridPage>

      <ConfirmDeleteModal
        open={confirmingId !== null}
        title={
          confirmingRequest
            ? `Permanently delete the account for ${confirmingRequest.contact}? Its profile and saved activity go with it, and this cannot be undone.`
            : 'Delete this account?'
        }
        confirmLabel="Delete account"
        disabled={busyId !== null}
        onCancel={() => setConfirmingId(null)}
        onConfirm={runDeletion}
      />
    </>
  );
}
