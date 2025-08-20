"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import AppModal from "@/components/ui/AppModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import type { WithId, UserDoc } from "@/lib/api/users";
import { UserRole } from "@/lib/api/users";
import { uploadUserImage } from "@/lib/api/storage";
import FileUploadButton from "@/components/ui/FileUploadButton";

export default function UsersFormModal({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: Partial<WithId<UserDoc>>;
  onClose: () => void;
  onSubmit: (payload: Partial<UserDoc>) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ageText, setAgeText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImg, setUploadingImg] = useState(false);
  const [roleVal, setRoleVal] = useState<"" | UserRole>("");

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setEmail(initial?.email ?? "");
    setAgeText(typeof initial?.age === "number" ? String(initial?.age) : "");
    setImageUrl(initial?.imageUrl ?? "");
    setRoleVal((initial?.role as UserRole | undefined) ?? "");
  }, [open, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!name.trim()) throw new Error("Name is required");

      const ageNum = ageText.trim() ? Number(ageText) : undefined;
      if (ageText.trim() && !Number.isFinite(ageNum)) throw new Error("Age must be a number");

      const payload: Partial<UserDoc> = {
        name: name.trim(),
        imageUrl: imageUrl.trim() || undefined,
        age: typeof ageNum === "number" ? ageNum : undefined,
        role: roleVal || undefined,
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
      type="edit"
      onClose={onClose}
      title="Edit User"
      footer={
        <AppButton
          type="submit"
          disabled={!name.trim()}
          variant={AppButtonVariant.Edit}
          form="userForm"
        >
          Save
        </AppButton>
      }
    >
      <form id="userForm" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-primary-800">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Full name"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Email</label>
            <input
              type="email"
              value={email}
              readOnly
              className="mt-1 block w-full rounded-md border border-primary-300 bg-gray-50 px-3 py-2 text-sm text-primary-800"
              placeholder="Email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Age</label>
            <input
              type="number"
              value={ageText}
              onChange={(e) => setAgeText(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Age (optional)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-800">Role</label>
            <select
              value={roleVal}
              onChange={(e) => setRoleVal((e.target.value as UserRole) || "")}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">User (no admin)</option>
              <option value={UserRole.Admin}>Admin</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-primary-800">Profile Image (optional)</label>
            <div className="mt-1 flex flex-col gap-3">
              <FileUploadButton
                label={uploadingImg ? "Uploading..." : "Upload Image"}
                accept="image/*"
                disabled={uploadingImg}
                onSelect={async (f) => {
                  try {
                    setUploadingImg(true);
                    const url = await uploadUserImage(f, name || email);
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
        </div>
      </form>
    </AppModal>
  );
}
