"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import AppModal from "@/components/ui/AppModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import type { WithId, NewsDoc, NewsContentItem, NewsQuoteValue } from "@/lib/api/news";
import type { WithId as WithUserId, UserDoc } from "@/lib/api/users";
import { NewsContentType } from "@/lib/api/news";
import { uploadNewsImage } from "@/lib/api/storage";
import NewsDescriptionBlocksEditor, { type FormContentItem } from "./NewsDescriptionBlocksEditor";
import FileUploadButton from "@/components/ui/FileUploadButton";

export default function NewsFormModal({
  open,
  mode,
  initial,
  onClose,
  onSubmit,
  users,
}: {
  open: boolean;
  mode: "add" | "edit";
  initial?: Partial<WithId<NewsDoc>>;
  onClose: () => void;
  onSubmit: (payload: NewsDoc) => Promise<void> | void;
  users: WithUserId<UserDoc>[];
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImg, setUploadingImg] = useState(false);
  const [shortDesc, setShortDesc] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [statusVal, setStatusVal] = useState<"draft" | "published">("draft");
  const [contentItems, setContentItems] = useState<FormContentItem[]>([]);
  const [authorId, setAuthorId] = useState("");
  const [authorQuery, setAuthorQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    // initialize from initial
    setTitle(initial?.title ?? "");
    setCategory(initial?.category ?? "");
    setImageUrl(initial?.imageUrl ?? "");
    setShortDesc(initial?.short_description ?? "");
    setTagsText(Array.isArray(initial?.tags) ? (initial?.tags as string[]).join(", ") : "");
    setStatusVal((initial?.status as "draft" | "published" | undefined) ?? "draft");
    setAuthorId(initial?.author_id ?? "");
    setAuthorQuery("");
    const mapped: FormContentItem[] = (initial?.content ?? []).map((d) => {
      switch (d.type) {
        case NewsContentType.List:
          return { type: d.type, value: (d.value || []).join("\n") } as FormContentItem;
        case NewsContentType.Quote: {
          const q = d.value as NewsQuoteValue;
          return { type: d.type, value: { text: q.text ?? "", ...(q.ref ? { ref: q.ref } : {}) } } as FormContentItem;
        }
        case NewsContentType.Title:
          return { type: d.type, value: String(d.value ?? "") } as FormContentItem;
        case NewsContentType.Paragraph:
          return { type: d.type, value: String(d.value ?? "") } as FormContentItem;
        case NewsContentType.Banner:
          return { type: d.type, value: String(d.value ?? "") } as FormContentItem;
      }
    });
    setContentItems(mapped);
  }, [open, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!title.trim()) throw new Error("Title is required");
      if (!category.trim()) throw new Error("Category is required");
      if (!authorId.trim()) throw new Error("Author ID is required");

      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const content: NewsContentItem[] | undefined = contentItems.length
        ? contentItems.map((d) => {
            if (d.type === NewsContentType.List) {
              const arr = String(d.value ?? "")
                .split(/\r?\n|,/)
                .map((v: string) => v.trim())
                .filter(Boolean);
              return { type: NewsContentType.List, value: arr } as NewsContentItem;
            }
            if (d.type === NewsContentType.Quote) {
              const q =
                typeof d.value === "object" && d.value && !Array.isArray(d.value)
                  ? (d.value as NewsQuoteValue)
                  : ({ text: String(d.value ?? "") } as NewsQuoteValue);
              return { type: NewsContentType.Quote, value: q } as NewsContentItem;
            }
            if (d.type === NewsContentType.Banner) {
              return { type: NewsContentType.Banner, value: String(d.value ?? "") } as NewsContentItem;
            }
            if (d.type === NewsContentType.Title) {
              return { type: NewsContentType.Title, value: String(d.value ?? "") } as NewsContentItem;
            }
            return { type: NewsContentType.Paragraph, value: String(d.value ?? "") } as NewsContentItem;
          })
        : undefined;

      const payload: NewsDoc = {
        title: title.trim(),
        category: category.trim(),
        imageUrl: imageUrl.trim() || undefined,
        short_description: shortDesc.trim() || undefined,
        tags: tags.length ? tags : undefined,
        status: statusVal,
        content,
        author_id: authorId.trim(),
      };

      await onSubmit(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submit failed";
      toast.error(msg);
    }
  };

  return (
    <AppModal
      open={open}
      type={mode}
      onClose={onClose}
      title={mode === "add" ? "Add News" : "Edit News"}
      footer={
        <AppButton
          type="submit"
          disabled={!title.trim() || !category.trim() || !authorId.trim()}
          variant={mode === "add" ? AppButtonVariant.Add : AppButtonVariant.Edit}
          form="newsForm"
        >
          {mode === "add" ? "Add" : "Save"}
        </AppButton>
      }
    >
      <form id="newsForm" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-primary-800">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="News title"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Category"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Author</label>
            <input
              type="text"
              value={authorQuery}
              onChange={(e) => setAuthorQuery(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Search users by name or email"
            />
            <select
              value={authorId}
              onChange={(e) => setAuthorId(e.target.value)}
              className="mt-2 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="" disabled>
                Select an author
              </option>
              {users
                .filter((u) => {
                  const q = authorQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)
                  );
                })
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email} {u.email ? `(${u.email})` : ""}
                  </option>
                ))}
            </select>
            {authorId && (
              <div className="mt-2 flex items-center gap-2 text-sm text-primary-800">
                {(() => {
                  const found = users.find((u) => u.id === authorId);
                  return found ? (
                    <>
                      {found.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={found.imageUrl} alt={found.name} className="h-6 w-6 rounded object-cover border" />
                      ) : (
                        <div className="h-6 w-6 rounded border bg-primary-50 flex items-center justify-center text-[10px] text-primary-600">
                          {(found.name?.[0] || "U").toUpperCase()}
                        </div>
                      )}
                      <span>{found.name || found.email}</span>
                    </>
                  ) : null;
                })()}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Status</label>
            <select
              value={statusVal}
              onChange={(e) => setStatusVal(e.target.value as "draft" | "published")}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Created At</label>
            {mode === "edit" && initial?.createdAt ? (
              <input
                type="text"
                readOnly
                value={new Date(initial.createdAt).toLocaleString()}
                className="mt-1 block w-full rounded-md border border-primary-300 bg-gray-50 px-3 py-2 text-sm text-primary-800"
              />
            ) : (
              <p className="mt-2 text-xs text-primary-600">Will be set automatically on create</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">Image (optional)</label>
            <div className="mt-1 flex flex-col gap-3">
              <FileUploadButton
                label={uploadingImg ? "Uploading..." : "Upload Image"}
                accept="image/*"
                disabled={uploadingImg}
                onSelect={async (f) => {
                  try {
                    setUploadingImg(true);
                    const url = await uploadNewsImage(f, title || category);
                    setImageUrl(url);
                    toast.success("Image uploaded");
                  } catch {
                    toast.error("Image upload failed");
                  } finally {
                    setUploadingImg(false);
                  }
                }}
              />
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="flex-1 rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="https://..."
              />
              {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="preview" className="h-10 w-10 rounded object-cover border" />
              )}
            </div>
            {uploadingImg && <p className="mt-1 text-xs text-primary-600">Uploading...</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">Short Description</label>
            <textarea
              value={shortDesc}
              onChange={(e) => setShortDesc(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Short summary of the news"
              rows={3}
            />
          </div>
          <NewsDescriptionBlocksEditor items={contentItems} onChange={setContentItems} titleOrCategory={title || category} />
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">Tags (comma separated)</label>
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Community, Announcement, Service"
            />
          </div>
        </div>
      </form>
    </AppModal>
  );
}
