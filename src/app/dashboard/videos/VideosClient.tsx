'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAppDispatch, useAppSelector } from '@/lib/redux/store';
import AppButton, { AppButtonVariant } from '@/components/ui/AppButton';
import ConfirmDeleteModal from '@/components/ui/ConfirmDeleteModal';
import {
  fetchVideos,
  createVideo,
  editVideo,
  removeVideo,
} from '@/lib/redux/features/videosSlice';
import { fetchUsers } from '@/lib/redux/features/usersSlice';
import type { WithId, VideoDoc, VideoType } from '@/lib/api/videos';
import {
  deleteStorageFileByUrl,
  isFirebaseStorageUrl,
} from '@/lib/api/storage';
import { Timestamp } from 'firebase/firestore';
import VideosList from './_components/VideosList';
import VideoFormModal from './_components/VideoFormModal';

type TypeFilter = 'all' | VideoType;

const inputClass =
  'block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500';

export default function VideosClient() {
  const dispatch = useAppDispatch();
  const { items, status, error } = useAppSelector((s) => s.videos);
  const users = useAppSelector((s) => s.users.items);
  const loading = status === 'loading';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'add' | 'edit'>('add');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WithId<VideoDoc> | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [notifying, setNotifying] = useState(false);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    dispatch(fetchVideos());
    dispatch(fetchUsers());
  }, [dispatch]);

  useEffect(() => {
    if (typeof document !== 'undefined') document.body.style.overflow = '';
  }, []);

  const openAdd = () => {
    setModalType('add');
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (it: WithId<VideoDoc>) => {
    setModalType('edit');
    setEditingId(it.id);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const initialItem = useMemo(
    () => (editingId ? items.find((x) => x.id === editingId) : undefined),
    [items, editingId],
  );

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((it) =>
        typeFilter === 'all' ? true : it.videoType === typeFilter,
      )
      .filter((it) =>
        !q
          ? true
          : it.title.toLowerCase().includes(q) ||
            it.uploader.toLowerCase().includes(q),
      )
      .slice()
      .sort((a, b) => {
        const dateA =
          a.uploadDate instanceof Timestamp
            ? a.uploadDate.toDate().toISOString()
            : a.uploadDate || '';
        const dateB =
          b.uploadDate instanceof Timestamp
            ? b.uploadDate.toDate().toISOString()
            : b.uploadDate || '';
        return dateB.localeCompare(dateA);
      });
  }, [items, typeFilter, search]);

  const handleSubmit = async (payload: VideoDoc) => {
    if (editingId) {
      await dispatch(editVideo({ id: editingId, data: payload })).unwrap();
      toast.success('Video updated');
    } else {
      await dispatch(createVideo(payload)).unwrap();
      toast.success('Video added');
    }
    setIsModalOpen(false);
  };

  const onDelete = (it: WithId<VideoDoc>) => {
    setDeleteTarget(it);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await dispatch(removeVideo(deleteTarget.id)).unwrap();
      // Clean up the Storage object only for files this dashboard uploaded.
      if (
        deleteTarget.videoType === 'hosted' &&
        deleteTarget.videoUrl &&
        isFirebaseStorageUrl(deleteTarget.videoUrl)
      ) {
        try {
          await deleteStorageFileByUrl(deleteTarget.videoUrl);
        } catch (err) {
          console.error('[videosApi] failed to delete storage object', err);
        }
      }
      toast.success('Video deleted');
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeleting(false);
      setIsDeleteOpen(false);
      setDeleteTarget(null);
    }
  };

  const onNotify = async (it: WithId<VideoDoc>) => {
    try {
      setNotifying(true);
      const response = await fetch('/api/video-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: it.id,
          videoTitle: it.title,
          videoDescription: it.description,
          videoThumbnailUrl: it.thumbnailUrl,
          videoUrl: it.videoUrl,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send notification');
      }

      const result = await response.json();
      toast.success(
        `Notification sent to ${result.inAppNotifications} users${
          result.pushNotifications > 0
            ? ` and ${result.pushNotifications} devices`
            : ''
        }`,
      );
    } catch (error) {
      console.error('[VideosClient] Failed to send notification', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to send notification',
      );
    } finally {
      setNotifying(false);
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <h2 className='text-xl font-semibold text-primary-800'>Videos</h2>
        <div className='flex items-center gap-3'>
          <AppButton
            variant={AppButtonVariant.Add}
            onClick={openAdd}
            disabled={loading}
          >
            Add Video
          </AppButton>
        </div>
      </div>

      <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
        <div className='inline-flex rounded-md border border-primary-300 bg-white p-1'>
          {(['all', 'youtube', 'hosted'] as const).map((t) => (
            <button
              key={t}
              type='button'
              onClick={() => setTypeFilter(t)}
              aria-pressed={typeFilter === t}
              className={`rounded cursor-pointer px-3 py-1.5 text-sm font-medium transition-colors ${
                typeFilter === t
                  ? 'bg-gray-600 text-white'
                  : 'text-primary-700 hover:bg-primary-50'
              }`}
            >
              {t === 'all' ? 'All' : t === 'youtube' ? 'YouTube' : 'Hosted'}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} sm:max-w-xs`}
          placeholder='Search by title or uploader'
        />
      </div>

      <VideosList
        items={visibleItems}
        loading={loading}
        notifying={notifying}
        error={status === 'failed' ? error || 'Failed to load videos' : null}
        onEdit={openEdit}
        onDelete={onDelete}
        onNotify={onNotify}
      />

      <VideoFormModal
        open={isModalOpen}
        mode={modalType}
        initial={initialItem}
        users={users}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />

      <ConfirmDeleteModal
        open={isDeleteOpen}
        disabled={deleting}
        onCancel={() => {
          setIsDeleteOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={confirmDelete}
        confirmLabel='Delete'
      />
    </div>
  );
}
