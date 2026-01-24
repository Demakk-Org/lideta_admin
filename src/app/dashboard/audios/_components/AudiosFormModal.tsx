"use client";

import { useEffect, useMemo, useState } from "react";
import AppModal from "@/components/ui/AppModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import FileUploadButton from "@/components/ui/FileUploadButton";
import type { WithId, AudioDoc, AudioLyric } from "@/lib/api/audios";
import { uploadAudioFile, uploadAudioThumbnail } from "@/lib/api/storage";

export default function AudiosFormModal({
  open,
  mode,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "add" | "edit";
  initial?: WithId<AudioDoc>;
  onClose: () => void;
  onSubmit: (data: AudioDoc) => Promise<void> | void;
}) {
  const isEdit = mode === "edit" && !!initial;

  const [title, setTitle] = useState("");
  const [audioBy, setAudioBy] = useState("");
  const [uploader, setUploader] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>(undefined);
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);
  const [lyrics, setLyrics] = useState<AudioLyric[]>([]);

  useEffect(() => {
    if (initial) {
      setTitle(initial.title || "");
      setAudioBy(initial.audioBy || "");
      setUploader(initial.uploader || "");
      setDescription(initial.description || "");
      setTagsInput((initial.tags || []).join(", "));
      setThumbnailUrl(initial.thumbnailUrl);
      setAudioUrl(initial.audioUrl);
      setLyrics(initial.lyrics || []);
    } else {
      setTitle("");
      setAudioBy("");
      setUploader("");
      setDescription("");
      setTagsInput("");
      setThumbnailUrl(undefined);
      setAudioUrl(undefined);
      setLyrics([]);
    }
  }, [initial, open]);

  const tags = useMemo(() => tagsInput.split(/,|\n/).map((t) => t.trim()).filter(Boolean), [tagsInput]);

  const addLyric = () => setLyrics((p) => [...p, { text: "", time: "" }]);
  const updateLyric = (idx: number, patch: Partial<AudioLyric>) => {
    setLyrics((p) => p.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeLyric = (idx: number) => setLyrics((p) => p.filter((_, i) => i !== idx));

  const handleUploadThumb = async (file: File) => {
    const url = await uploadAudioThumbnail(file, title || audioBy || "audio");
    setThumbnailUrl(url);
  };
  const handleUploadAudio = async (file: File) => {
    const url = await uploadAudioFile(file, title || audioBy || "audio");
    setAudioUrl(url);
  };

  const submit = async (e: React.FormEvent) => {
    try {
      e.preventDefault();
      if (!title.trim()) return alert('Title is required');
      if (!audioUrl) return alert('Audio file is required');

      const payload: AudioDoc = {
        title: title.trim(),
        audioBy: audioBy.trim() || undefined,
        uploader: uploader.trim() || undefined,
        description: description.trim() || undefined,
        tags: tags.length ? tags : undefined,
        thumbnailUrl,
        audioUrl,
        lyrics: lyrics.length ? lyrics : undefined,
      };

      await onSubmit(payload);
    } catch (err) {
      console.error('Failed to submit audio', err);
    }
  };

  return (
    <AppModal
      open={open}
      type={mode}
      onClose={onClose}
      title={isEdit ? "Edit Audio" : "Add Audio"}
      footer={
        <AppButton type="submit" variant={mode === "add" ? AppButtonVariant.Add : AppButtonVariant.Edit} form="audioForm">
          {isEdit ? "Save" : "Create"}
        </AppButton>
      }
    >
      <form id="audioForm" className="space-y-6" onSubmit={submit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-primary-700">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="app-input" placeholder="Title" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-primary-700">Audio By</span>
            <input value={audioBy} onChange={(e) => setAudioBy(e.target.value)} className="app-input" placeholder="Speaker / Artist" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-primary-700">Uploader</span>
            <input value={uploader} onChange={(e) => setUploader(e.target.value)} className="app-input" placeholder="Uploader name" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-primary-700">Tags (comma separated)</span>
            <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="app-input" placeholder="tag1, tag2" />
          </label>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-sm text-primary-700">Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="app-input min-h-[110px]" placeholder="Description" />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-primary-700">Thumbnail</span>
            <FileUploadButton label="Upload thumbnail" accept="image/*" onSelect={handleUploadThumb} />
            {thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnailUrl} alt="thumbnail" className="mt-2 h-20 w-20 rounded object-cover border" />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-primary-700">Audio File</span>
            <FileUploadButton label="Upload audio" accept="audio/*" onSelect={handleUploadAudio} />
            {audioUrl && (
              <a href={audioUrl} target="_blank" rel="noreferrer" className="mt-2 text-sm text-primary-700 underline">Open current file</a>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-primary-800">Lyrics</h4>
            <AppButton type="button" variant={AppButtonVariant.Edit} onClick={addLyric}>Add line</AppButton>
          </div>
          <div className="mt-3 space-y-3">
            {lyrics.map((l, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <input className="app-input sm:col-span-7" placeholder="Text" value={l.text} onChange={(e) => updateLyric(idx, { text: e.target.value })} />
                <input className="app-input sm:col-span-3" placeholder="mm:ss" value={l.time} onChange={(e) => updateLyric(idx, { time: e.target.value })} />
                <div className="sm:col-span-2 flex sm:justify-end">
                  <AppButton
                    type="button"
                    variant={AppButtonVariant.Delete}
                    onClick={() => removeLyric(idx)}
                    className="min-w-[110px] whitespace-nowrap"
                  >
                    Remove
                  </AppButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      </form>
    </AppModal>
  );
}
