'use client';

import AppButton, { AppButtonVariant } from '@/components/ui/AppButton';
import { EmptyGrid } from '@/components/ui/PagedGridPage';
import type { WithId, VideoDoc } from '@/lib/api/videos';
import { videoWatchUrl } from '@/lib/api/videos';
import { BellIcon } from '@heroicons/react/24/outline';
import { Timestamp } from 'firebase/firestore';

function formatDate(date: string | Timestamp): string {
  if (!date) return '';
  let isoString: string;
  if (date instanceof Timestamp) {
    isoString = date.toDate().toISOString();
  } else {
    isoString = date;
  }
  const d = new Date(isoString);
  return Number.isNaN(d.getTime()) ? isoString : d.toLocaleString();
}

function normalizeUploadDate(date: string | Timestamp): string {
  if (!date) return '';
  if (date instanceof Timestamp) {
    return date.toDate().toISOString();
  }
  return date;
}

export default function VideosList({
  items,
  loading,
  notifying,
  error,
  onEdit,
  onDelete,
  onNotify,
}: {
  items: WithId<VideoDoc>[];
  loading: boolean;
  notifying?: boolean;
  error: string | null;
  onEdit: (it: WithId<VideoDoc>) => void;
  onDelete: (it: WithId<VideoDoc>) => void;
  onNotify?: (it: WithId<VideoDoc>) => void;
}) {
  if (error) {
    return (
      <div className='rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700'>
        {error}
      </div>
    );
  }

  if (loading && items.length === 0) {
    return <EmptyGrid>Loading videos…</EmptyGrid>;
  }

  if (items.length === 0) return <EmptyGrid>No videos yet.</EmptyGrid>;

  return (
    <div className='grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3'>
      {items.map((it) => {
        const openUrl = videoWatchUrl(it);
        const isYouTube = it.videoType === 'youtube';
        return (
          <div
            key={it.id}
            className='rounded-md border border-primary-200 bg-white p-4 shadow-sm'
          >
            <div className='flex items-start gap-3'>
              {it.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.thumbnailUrl}
                  alt={it.title}
                  className='h-12 w-16 rounded border object-cover'
                />
              ) : (
                <div className='h-12 w-16 rounded border border-primary-200 bg-primary-50' />
              )}
              <div className='min-w-0'>
                <h3 className='truncate text-base font-semibold text-primary-900'>
                  {it.title}
                </h3>
                <span
                  className={`mt-1 inline-block rounded px-2 py-0.5 text-[11px] ${
                    isYouTube
                      ? 'bg-red-100 text-red-700'
                      : 'bg-primary-100 text-primary-700'
                  }`}
                >
                  {isYouTube ? 'YouTube' : 'Hosted'}
                </span>
                {it.uploader && (
                  <p className='text-xs text-primary-600'>By {it.uploader}</p>
                )}
                {it.uploadDate && (
                  <p className='mt-1 text-[11px] text-primary-500'>
                    {formatDate(normalizeUploadDate(it.uploadDate))}
                  </p>
                )}
              </div>
            </div>

            {it.description && (
              <p className='mt-3 line-clamp-2 text-sm text-primary-700'>
                {it.description}
              </p>
            )}
            <p className='mt-2 text-[11px] text-primary-500'>
              {it.tags.length} {it.tags.length === 1 ? 'tag' : 'tags'}
            </p>

            <div className='mt-3 flex items-center gap-2'>
              <AppButton
                variant={AppButtonVariant.Edit}
                onClick={() => onEdit(it)}
                disabled={loading}
              >
                Edit
              </AppButton>
              <AppButton
                variant={AppButtonVariant.Delete}
                onClick={() => onDelete(it)}
                disabled={loading}
              >
                Delete
              </AppButton>
              {onNotify && (
                <button
                  onClick={() => onNotify(it)}
                  disabled={loading || notifying}
                  className='inline-flex items-center rounded-md border border-primary-300 bg-white px-3 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed'
                  title='Send notification'
                >
                  <BellIcon className='h-4 w-4' />
                </button>
              )}
              {openUrl && (
                <a
                  href={openUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='ml-auto text-sm text-primary-700 underline'
                >
                  Open
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
