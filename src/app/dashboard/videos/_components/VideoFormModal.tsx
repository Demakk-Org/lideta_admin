'use client';

import { useEffect, useMemo, useState } from 'react';
import AppModal from '@/components/ui/AppModal';
import AppButton, { AppButtonVariant } from '@/components/ui/AppButton';
import FileUploadButton from '@/components/ui/FileUploadButton';
import LyricsEditor from '@/components/ui/LyricsEditor';
import type { WithId, VideoDoc, VideoLyric, VideoType } from '@/lib/api/videos';
import { extractYouTubeVideoId, youtubeThumbnailUrl } from '@/lib/api/videos';
import type { WithId as WithUserId, UserDoc } from '@/lib/api/users';
import { uploadVideoFile, uploadVideoThumbnail } from '@/lib/api/storage';

const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // ~500MB

const inputClass =
  'mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500';

type FieldErrors = Partial<
  Record<
    | 'title'
    | 'description'
    | 'thumbnailUrl'
    | 'uploader'
    | 'videoUrl'
    | 'youtubeVideoId'
    | 'channelName',
    string
  >
>;

/** Label stored in the doc's `uploader` field for a selected user. */
function userDisplayName(u: WithUserId<UserDoc>): string {
  return u.name?.trim() || u.email?.trim() || '';
}

export default function VideoFormModal({
  open,
  mode,
  initial,
  users,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: 'add' | 'edit';
  initial?: WithId<VideoDoc>;
  users: WithUserId<UserDoc>[];
  onClose: () => void;
  onSubmit: (data: VideoDoc) => Promise<void> | void;
}) {
  const isEdit = mode === 'edit' && !!initial;

  const [videoType, setVideoType] = useState<VideoType>('youtube');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploaderId, setUploaderId] = useState('');
  const [uploaderQuery, setUploaderQuery] = useState('');
  /** Uploader text on an existing doc that matches no user in the list. */
  const [legacyUploader, setLegacyUploader] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [lyrics, setLyrics] = useState<VideoLyric[]>([]);

  // youtube branch
  const [youtubeInput, setYoutubeInput] = useState('');
  const [channelName, setChannelName] = useState('');

  // hosted branch
  const [videoUrl, setVideoUrl] = useState('');
  const [pasteVideoUrl, setPasteVideoUrl] = useState(false);

  const [thumbProgress, setThumbProgress] = useState<number | null>(null);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFormError(null);
    setThumbProgress(null);
    setVideoProgress(null);
    setTagDraft('');
    setSaving(false);
    setUploaderQuery('');
    if (initial) {
      setVideoType(initial.videoType);
      setTitle(initial.title || '');
      setDescription(initial.description || '');
      // Re-select the matching user; keep unmatched free text as-is so editing
      // an older doc never silently wipes its uploader.
      const existing = (initial.uploader || '').trim();
      const matched = users.find(
        (u) =>
          userDisplayName(u).toLowerCase() === existing.toLowerCase() ||
          (u.email || '').toLowerCase() === existing.toLowerCase(),
      );
      setUploaderId(matched?.id || '');
      setLegacyUploader(matched ? '' : existing);
      setTags(initial.tags || []);
      setThumbnailUrl(initial.thumbnailUrl || '');
      setLyrics(initial.lyrics || []);
      setYoutubeInput(initial.youtubeVideoId || '');
      setChannelName(initial.channelName || '');
      setVideoUrl(initial.videoUrl || '');
      setPasteVideoUrl(!!initial.videoUrl);
    } else {
      setVideoType('youtube');
      setTitle('');
      setDescription('');
      setUploaderId('');
      setLegacyUploader('');
      setTags([]);
      setThumbnailUrl('');
      setLyrics([]);
      setYoutubeInput('');
      setChannelName('');
      setVideoUrl('');
      setPasteVideoUrl(false);
    }
  }, [initial, open, users]);

  const selectedUploader = useMemo(
    () => users.find((u) => u.id === uploaderId),
    [users, uploaderId],
  );

  /** The string written to the doc's `uploader` field. */
  const uploader = selectedUploader
    ? userDisplayName(selectedUploader)
    : legacyUploader;

  const youtubeVideoId = useMemo(
    () =>
      videoType === 'youtube' ? extractYouTubeVideoId(youtubeInput) : undefined,
    [videoType, youtubeInput],
  );

  // Default the thumbnail to YouTube's hqdefault, but never overwrite a value
  // the user typed or uploaded themselves.
  useEffect(() => {
    if (videoType !== 'youtube' || !youtubeVideoId) return;
    setThumbnailUrl((prev) =>
      prev.trim() ? prev : youtubeThumbnailUrl(youtubeVideoId),
    );
  }, [videoType, youtubeVideoId]);

  const uploading = thumbProgress !== null || videoProgress !== null;
  const busy = uploading || saving;

  const addTag = (raw: string) => {
    const parts = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setTags((prev) => [...prev, ...parts.filter((p) => !prev.includes(p))]);
    setTagDraft('');
  };
  const removeTag = (tag: string) =>
    setTags((prev) => prev.filter((t) => t !== tag));

  const handleUploadThumb = async (file: File) => {
    setFormError(null);
    setThumbProgress(0);
    try {
      const url = await uploadVideoThumbnail(
        file,
        title || 'video',
        setThumbProgress,
      );
      setThumbnailUrl(url);
      setErrors((prev) => ({ ...prev, thumbnailUrl: undefined }));
    } catch (err) {
      console.error('[videosApi] thumbnail upload failed', err);
      setFormError('Thumbnail upload failed. Please try again.');
    } finally {
      setThumbProgress(null);
    }
  };

  const handleUploadVideo = async (file: File) => {
    setFormError(null);
    if (file.size > MAX_VIDEO_BYTES) {
      setFormError(
        `Video is ${(file.size / (1024 * 1024)).toFixed(0)}MB — the limit is 500MB. Please upload a smaller file or paste a URL instead.`,
      );
      return;
    }
    setVideoProgress(0);
    try {
      const url = await uploadVideoFile(
        file,
        title || 'video',
        setVideoProgress,
      );
      setVideoUrl(url);
      setErrors((prev) => ({ ...prev, videoUrl: undefined }));
    } catch (err) {
      console.error('[videosApi] video upload failed', err);
      setFormError('Video upload failed. Please try again.');
    } finally {
      setVideoProgress(null);
    }
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!title.trim()) next.title = 'Title is required';
    if (!description.trim()) next.description = 'Description is required';
    if (!uploader.trim()) next.uploader = 'Select an uploader';
    if (!thumbnailUrl.trim()) next.thumbnailUrl = 'Thumbnail is required';
    if (videoType === 'youtube') {
      if (!youtubeInput.trim())
        next.youtubeVideoId = 'YouTube URL or video id is required';
      else if (!youtubeVideoId)
        next.youtubeVideoId =
          'Could not read a valid YouTube video id from that value';
      if (!channelName.trim()) next.channelName = 'Channel name is required';
    } else if (!videoUrl.trim()) {
      next.videoUrl = 'Upload a video file or paste a video URL';
    }
    return next;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    const payload: VideoDoc = {
      title: title.trim(),
      description: description.trim(),
      thumbnailUrl: thumbnailUrl.trim(),
      uploadDate: initial?.uploadDate || new Date().toISOString(), // For new videos, API will use serverTimestamp
      uploader: uploader.trim(),
      tags,
      videoType,
      lyrics,
      ...(videoType === 'youtube'
        ? { youtubeVideoId: youtubeVideoId, channelName: channelName.trim() }
        : { videoUrl: videoUrl.trim() }),
    };

    try {
      setSaving(true);
      await onSubmit(payload);
    } catch (err) {
      console.error('[videosApi] failed to submit video', err);
      setFormError('Saving failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open={open}
      type={mode}
      onClose={onClose}
      title={isEdit ? 'Edit Video' : 'Add Video'}
      footer={
        <AppButton
          type='submit'
          variant={
            mode === 'add' ? AppButtonVariant.Add : AppButtonVariant.Edit
          }
          form='videoForm'
          disabled={busy}
        >
          {saving
            ? 'Saving…'
            : uploading
              ? 'Uploading…'
              : isEdit
                ? 'Save'
                : 'Create'}
        </AppButton>
      }
    >
      <form id='videoForm' className='space-y-5' onSubmit={submit}>
        {/* Type selector */}
        <div>
          <span className='block text-sm font-medium text-primary-800'>
            Video type
          </span>
          <div className='mt-1 inline-flex rounded-md border border-primary-300 bg-white p-1'>
            {(['youtube', 'hosted'] as const).map((t) => (
              <button
                key={t}
                type='button'
                onClick={() => {
                  setVideoType(t);
                  setErrors({});
                }}
                disabled={busy}
                aria-pressed={videoType === t}
                className={`rounded px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-70 ${
                  videoType === t
                    ? 'bg-gray-600 text-white'
                    : 'text-primary-700 hover:bg-primary-50'
                }`}
              >
                {t === 'youtube' ? 'YouTube' : 'Hosted'}
              </button>
            ))}
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <div>
            <label className='block text-sm font-medium text-primary-800'>
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder='Video title'
            />
            {errors.title && (
              <p className='mt-1 text-xs text-red-600'>{errors.title}</p>
            )}
          </div>
          <div>
            <label className='block text-sm font-medium text-primary-800'>
              Uploader
            </label>
            <input
              type='text'
              value={uploaderQuery}
              onChange={(e) => setUploaderQuery(e.target.value)}
              className={inputClass}
              placeholder='Search users by name or email'
            />
            <select
              value={uploaderId}
              onChange={(e) => {
                setUploaderId(e.target.value);
                setLegacyUploader('');
                setErrors((prev) => ({ ...prev, uploader: undefined }));
              }}
              className={`${inputClass} mt-2`}
            >
              <option value='' disabled>
                Select an uploader
              </option>
              {users
                .filter((u) => {
                  const q = uploaderQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    (u.name || '').toLowerCase().includes(q) ||
                    (u.email || '').toLowerCase().includes(q)
                  );
                })
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email} {u.email ? `(${u.email})` : ''}
                  </option>
                ))}
            </select>
            {selectedUploader && (
              <div className='mt-2 flex items-center gap-2 text-sm text-primary-800'>
                {selectedUploader.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedUploader.imageUrl}
                    alt={selectedUploader.name}
                    className='h-6 w-6 rounded object-cover border'
                  />
                ) : (
                  <div className='h-6 w-6 rounded border bg-primary-50 flex items-center justify-center text-[10px] text-primary-600'>
                    {(selectedUploader.name?.[0] || 'U').toUpperCase()}
                  </div>
                )}
                <span>{userDisplayName(selectedUploader)}</span>
              </div>
            )}
            {!selectedUploader && legacyUploader && (
              <p className='mt-2 text-xs text-primary-600'>
                Current uploader “{legacyUploader}” is not in the users list —
                pick a user above to replace it.
              </p>
            )}
            {errors.uploader && (
              <p className='mt-1 text-xs text-red-600'>{errors.uploader}</p>
            )}
          </div>
        </div>

        <div>
          <label className='block text-sm font-medium text-primary-800'>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} min-h-[110px]`}
            placeholder='Description'
          />
          {errors.description && (
            <p className='mt-1 text-xs text-red-600'>{errors.description}</p>
          )}
        </div>

        {/* Type-specific fields */}
        {videoType === 'youtube' ? (
          <div className='space-y-4 rounded-md border border-primary-200 bg-primary-50/40 p-3'>
            <div>
              <label className='block text-sm font-medium text-primary-800'>
                YouTube URL or video id
              </label>
              <input
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                className={inputClass}
                placeholder='https://www.youtube.com/watch?v=dQw4w9WgXcQ'
              />
              {youtubeVideoId ? (
                <p className='mt-1 text-xs text-primary-700'>
                  Video id:{' '}
                  <code className='rounded bg-primary-100 px-1'>
                    {youtubeVideoId}
                  </code>
                </p>
              ) : youtubeInput.trim() ? (
                <p className='mt-1 text-xs text-red-600'>
                  Could not read a valid YouTube video id from that value
                </p>
              ) : null}
              {errors.youtubeVideoId && !youtubeInput.trim() && (
                <p className='mt-1 text-xs text-red-600'>
                  {errors.youtubeVideoId}
                </p>
              )}
            </div>
            <div>
              <label className='block text-sm font-medium text-primary-800'>
                Channel name
              </label>
              <input
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                className={inputClass}
                placeholder='Channel name'
              />
              {errors.channelName && (
                <p className='mt-1 text-xs text-red-600'>
                  {errors.channelName}
                </p>
              )}
            </div>
            {youtubeVideoId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={youtubeThumbnailUrl(youtubeVideoId)}
                alt='YouTube preview'
                className='h-28 w-auto rounded border border-primary-200 object-cover'
              />
            )}
          </div>
        ) : (
          <div className='space-y-3 rounded-md border border-primary-200 bg-primary-50/40 p-3'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium text-primary-800'>
                Video file
              </span>
              <button
                type='button'
                onClick={() => setPasteVideoUrl((p) => !p)}
                disabled={busy}
                className='text-xs text-primary-700 underline disabled:opacity-70'
              >
                {pasteVideoUrl
                  ? 'Upload a file instead'
                  : 'Paste a URL instead'}
              </button>
            </div>
            {pasteVideoUrl ? (
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className={inputClass}
                placeholder='https://example.com/video.mp4'
              />
            ) : (
              <>
                <FileUploadButton
                  label='Upload video'
                  accept='video/*'
                  onSelect={handleUploadVideo}
                  disabled={busy}
                />
                <p className='text-xs text-primary-600'>
                  Maximum file size 500MB.
                </p>
              </>
            )}
            {videoProgress !== null && (
              <div>
                <div className='h-2 w-full overflow-hidden rounded bg-primary-100'>
                  <div
                    className='h-2 bg-primary-600 transition-all'
                    style={{ width: `${videoProgress}%` }}
                  />
                </div>
                <p className='mt-1 text-xs text-primary-700'>
                  Uploading video… {videoProgress}%
                </p>
              </div>
            )}
            {videoUrl && videoProgress === null && (
              <a
                href={videoUrl}
                target='_blank'
                rel='noreferrer'
                className='block text-sm text-primary-700 underline'
              >
                Open current video
              </a>
            )}
            {errors.videoUrl && (
              <p className='text-xs text-red-600'>{errors.videoUrl}</p>
            )}
          </div>
        )}

        {/* Thumbnail */}
        <div>
          <span className='block text-sm font-medium text-primary-800'>
            Thumbnail
          </span>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <FileUploadButton
              label='Upload thumbnail'
              accept='image/*'
              onSelect={handleUploadThumb}
              disabled={busy}
            />
            {thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailUrl}
                alt='thumbnail'
                className='h-16 w-16 rounded border object-cover'
              />
            )}
          </div>
          <input
            value={thumbnailUrl}
            onChange={(e) => setThumbnailUrl(e.target.value)}
            className={inputClass}
            placeholder='https://… (or upload an image above)'
          />
          {thumbProgress !== null && (
            <div className='mt-2'>
              <div className='h-2 w-full overflow-hidden rounded bg-primary-100'>
                <div
                  className='h-2 bg-primary-600 transition-all'
                  style={{ width: `${thumbProgress}%` }}
                />
              </div>
              <p className='mt-1 text-xs text-primary-700'>
                Uploading thumbnail… {thumbProgress}%
              </p>
            </div>
          )}
          {errors.thumbnailUrl && (
            <p className='mt-1 text-xs text-red-600'>{errors.thumbnailUrl}</p>
          )}
        </div>

        {/* Tags */}
        <div>
          <label className='block text-sm font-medium text-primary-800'>
            Tags
          </label>
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(tagDraft);
              } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
                removeTag(tags[tags.length - 1]);
              }
            }}
            onBlur={() => addTag(tagDraft)}
            className={inputClass}
            placeholder='Type a tag and press Enter'
          />
          {tags.length > 0 && (
            <div className='mt-2 flex flex-wrap gap-2'>
              {tags.map((t) => (
                <span
                  key={t}
                  className='inline-flex items-center gap-1 rounded bg-primary-100 px-2 py-0.5 text-[11px] text-primary-700'
                >
                  {t}
                  <button
                    type='button'
                    onClick={() => removeTag(t)}
                    aria-label={`Remove tag ${t}`}
                    className='text-primary-500 hover:text-primary-800'
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <LyricsEditor
          value={lyrics}
          onChange={setLyrics}
          title='Lyrics (optional)'
          disabled={busy}
        />

        {formError && <p className='text-sm text-red-600'>{formError}</p>}
      </form>
    </AppModal>
  );
}
