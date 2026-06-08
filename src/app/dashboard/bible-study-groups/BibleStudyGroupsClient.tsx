"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/store";
import AppModal from "@/components/ui/AppModal";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import FileUploadButton from "@/components/ui/FileUploadButton";
import { uploadBibleStudyImage } from "@/lib/api/storage";
import {
  createBibleStudyGroup,
  editBibleStudyGroup,
  fetchBibleStudyGroups,
  removeBibleStudyGroup,
} from "@/lib/redux/features/bibleStudyGroupsSlice";
import { fetchBibleStudies } from "@/lib/redux/features/bibleStudiesSlice";
import { fetchUsers } from "@/lib/redux/features/usersSlice";
import {
  AGE_GROUP_LABELS,
  AgeGroup,
  GENDER_GROUP_LABELS,
  GenderGroup,
} from "@/lib/api/bibleStudyGroups";
import type {
  BibleStudyGroup,
  GPS,
  WithId,
} from "@/lib/api/bibleStudyGroups";

function toInputDT(v?: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function BibleStudyGroupsClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.bibleStudyGroups);
  const usersState = useAppSelector((s) => s.users);
  const studiesState = useAppSelector((s) => s.bibleStudies);
  const loading = status === "loading";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [groupName, setGroupName] = useState("");
  const [groupImageUrl, setGroupImageUrl] = useState("");
  const [uploadingImg, setUploadingImg] = useState(false);
  const [leaderUserId, setLeaderUserId] = useState("");
  const [bibleStudyIds, setBibleStudyIds] = useState<string[]>([]);
  const [studyToAdd, setStudyToAdd] = useState("");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(AgeGroup.All);
  const [genderGroup, setGenderGroup] = useState<GenderGroup>(GenderGroup.Any);
  const [startDate, setStartDate] = useState("");
  const [isRecruiting, setIsRecruiting] = useState(true);
  const [isActive, setIsActive] = useState(true);

  // Meeting details
  const [schedule, setSchedule] = useState("");
  const [dateStarted, setDateStarted] = useState("");
  const [locPrimary, setLocPrimary] = useState("");
  const [locSecondary, setLocSecondary] = useState("");
  const [isOnline, setIsOnline] = useState(false);
  const [gpsLat, setGpsLat] = useState("");
  const [gpsLng, setGpsLng] = useState("");

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (status === "idle") dispatch(fetchBibleStudyGroups());
    if (usersState.status === "idle") dispatch(fetchUsers());
    if (studiesState.status === "idle") dispatch(fetchBibleStudies());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, usersState.status, studiesState.status]);

  const userOptions = useMemo(
    () =>
      usersState.items.map((u) => ({
        id: u.id,
        label: u.name || u.email || u.id,
      })),
    [usersState.items],
  );

  const studyOptions = useMemo(
    () =>
      studiesState.items.map((s) => ({
        id: s.id,
        label: s.topicTitle || s.id,
      })),
    [studiesState.items],
  );

  const userLabel = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of usersState.items) map[u.id] = u.name || u.email || u.id;
    return map;
  }, [usersState.items]);

  const studyLabel = useMemo(() => {
    const map: Record<string, string> = {};
    for (const o of studyOptions) map[o.id] = o.label;
    return map;
  }, [studyOptions]);

  // Studies not already added to the group, for the "add a study" dropdown.
  const availableStudyOptions = useMemo(
    () => studyOptions.filter((o) => !bibleStudyIds.includes(o.id)),
    [studyOptions, bibleStudyIds],
  );

  const resetForm = () => {
    setGroupName("");
    setGroupImageUrl("");
    setLeaderUserId("");
    setBibleStudyIds([]);
    setStudyToAdd("");
    setAgeGroup(AgeGroup.All);
    setGenderGroup(GenderGroup.Any);
    setStartDate("");
    setIsRecruiting(true);
    setIsActive(true);
    setSchedule("");
    setDateStarted("");
    setLocPrimary("");
    setLocSecondary("");
    setIsOnline(false);
    setGpsLat("");
    setGpsLng("");
    setEditingId(null);
  };

  const openAdd = () => {
    setModalType("add");
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (it: WithId<BibleStudyGroup>) => {
    setModalType("edit");
    setEditingId(it.id);
    setGroupName(it.groupName ?? "");
    setGroupImageUrl(it.groupImageUrl ?? "");
    setLeaderUserId(it.leaderUserId ?? "");
    setBibleStudyIds(it.bibleStudyIds ?? []);
    setStudyToAdd("");
    setAgeGroup(it.ageGroup);
    setGenderGroup(it.genderGroup);
    setStartDate(toInputDT(it.startDate));
    setIsRecruiting(it.isRecruiting);
    setIsActive(it.isActive);
    setSchedule(it.meetingDetails.schedule ?? "");
    setDateStarted(toInputDT(it.meetingDetails.dateStarted));
    setLocPrimary(it.meetingDetails.location.primary ?? "");
    setLocSecondary(it.meetingDetails.location.secondary ?? "");
    setIsOnline(it.meetingDetails.location.isOnline === true);
    setGpsLat(
      it.meetingDetails.location.gps
        ? String(it.meetingDetails.location.gps.latitude)
        : "",
    );
    setGpsLng(
      it.meetingDetails.location.gps
        ? String(it.meetingDetails.location.gps.longitude)
        : "",
    );
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!groupName.trim()) throw new Error("Group name is required");
      if (!leaderUserId) throw new Error("A leader is required");
      if (!schedule.trim()) throw new Error("Meeting schedule is required");
      if (!locPrimary.trim()) throw new Error("Meeting location is required");

      const lat = gpsLat.trim() ? Number(gpsLat) : NaN;
      const lng = gpsLng.trim() ? Number(gpsLng) : NaN;
      const gps: GPS | null =
        Number.isFinite(lat) && Number.isFinite(lng)
          ? { latitude: lat, longitude: lng }
          : null;

      const payload = {
        groupName: groupName.trim(),
        groupImageUrl: groupImageUrl.trim(),
        leaderUserId,
        bibleStudyIds,
        ageGroup,
        genderGroup,
        startDate,
        isRecruiting,
        isActive,
        meetingDetails: {
          schedule: schedule.trim(),
          dateStarted,
          location: {
            primary: locPrimary.trim(),
            secondary: locSecondary.trim() || undefined,
            isOnline,
            gps,
          },
        },
      };

      if (editingId) {
        await dispatch(
          editBibleStudyGroup({ id: editingId, data: payload }),
        ).unwrap();
        toast.success("Group updated");
      } else {
        await dispatch(createBibleStudyGroup(payload)).unwrap();
        toast.success("Group added");
      }
      setIsModalOpen(false);
      resetForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submit failed";
      toast.error(msg);
    }
  };

  const onDelete = (id: string) => {
    setDeleteId(id);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId || isDeleting) return;
    setIsDeleting(true);
    try {
      await dispatch(removeBibleStudyGroup(deleteId)).unwrap();
      toast.success("Group deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-primary-800">
          Bible Study Groups
        </h2>
        <AppButton
          variant={AppButtonVariant.Add}
          onClick={openAdd}
          disabled={loading}
        >
          Add Group
        </AppButton>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
        {items.map((it) => (
          <div
            key={it.id}
            className="rounded-md border border-primary-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              {it.groupImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.groupImageUrl}
                  alt={it.groupName}
                  className="h-12 w-12 shrink-0 rounded object-cover border"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-primary-200 bg-primary-50 text-xs text-primary-500">
                  No img
                </div>
              )}
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-primary-900">
                  {it.groupName}
                </h3>
                <p className="truncate text-xs text-primary-600">
                  Leader: {userLabel[it.leaderUserId] ?? (it.leaderUserId || "—")}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
              <span className="rounded bg-primary-50 px-2 py-0.5 text-primary-700">
                {AGE_GROUP_LABELS[it.ageGroup]}
              </span>
              <span className="rounded bg-primary-50 px-2 py-0.5 text-primary-700">
                {GENDER_GROUP_LABELS[it.genderGroup]}
              </span>
              <span className="rounded bg-primary-50 px-2 py-0.5 text-primary-700">
                {it.membersUserIds.length} members
              </span>
              <span
                className={`rounded px-2 py-0.5 ${
                  it.isActive
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {it.isActive ? "Active" : "Inactive"}
              </span>
              {it.isRecruiting && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                  Recruiting
                </span>
              )}
            </div>
            <p className="mt-2 break-all text-[11px] text-primary-500">
              id: {it.id}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <AppButton
                variant={AppButtonVariant.Edit}
                className="px-3 py-1 text-xs"
                onClick={() => openEdit(it)}
              >
                Edit
              </AppButton>
              <AppButton
                variant={AppButtonVariant.Delete}
                className="px-3 py-1 text-xs"
                onClick={() => onDelete(it.id)}
              >
                Delete
              </AppButton>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="col-span-full text-center text-primary-600 py-8">
            No bible study groups yet.
          </div>
        )}
      </div>

      <AppModal
        open={isModalOpen}
        type={modalType}
        onClose={closeModal}
        title={modalType === "add" ? "Add Group" : "Edit Group"}
        footer={
          <AppButton
            type="submit"
            disabled={!groupName.trim() || !leaderUserId}
            variant={
              modalType === "add" ? AppButtonVariant.Add : AppButtonVariant.Edit
            }
            form="bibleStudyGroupForm"
          >
            {modalType === "add" ? "Add" : "Save"}
          </AppButton>
        }
      >
        <form id="bibleStudyGroupForm" onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary-800">
              Group Name
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Wednesday Young Adults"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-primary-800">
              Group Image (optional)
            </label>
            <div className="mt-1 flex flex-col gap-3">
              <FileUploadButton
                label={uploadingImg ? "Uploading..." : "Upload Image"}
                accept="image/*"
                disabled={uploadingImg}
                onSelect={async (f) => {
                  try {
                    setUploadingImg(true);
                    const url = await uploadBibleStudyImage(f, groupName || "group");
                    setGroupImageUrl(url);
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
                value={groupImageUrl}
                onChange={(e) => setGroupImageUrl(e.target.value)}
                className="flex-1 rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="https://..."
              />
              {groupImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={groupImageUrl}
                  alt="preview"
                  className="h-10 w-10 rounded object-cover border"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-primary-800">
              Leader
            </label>
            <select
              value={leaderUserId}
              onChange={(e) => setLeaderUserId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="">Select leader</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
            {userOptions.length === 0 && (
              <p className="mt-1 text-xs text-primary-600">No users loaded.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-primary-800">
              Bible Studies
            </label>
            <div className="flex items-center gap-2">
              <select
                value={studyToAdd}
                onChange={(e) => setStudyToAdd(e.target.value)}
                disabled={availableStudyOptions.length === 0}
                className="flex-1 rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">
                  {studyOptions.length === 0
                    ? "No bible studies created yet"
                    : availableStudyOptions.length === 0
                      ? "All studies added"
                      : "Select a study to add"}
                </option>
                {availableStudyOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <AppButton
                type="button"
                variant={AppButtonVariant.Add}
                className="px-3 py-2 text-xs"
                disabled={!studyToAdd}
                onClick={() => {
                  if (!studyToAdd) return;
                  setBibleStudyIds((p) =>
                    p.includes(studyToAdd) ? p : [...p, studyToAdd],
                  );
                  setStudyToAdd("");
                }}
              >
                Add
              </AppButton>
            </div>
            {bibleStudyIds.length === 0 ? (
              <p className="mt-2 text-xs text-primary-600">
                No studies added yet.
              </p>
            ) : (
              <ol className="mt-2 space-y-1">
                {bibleStudyIds.map((id, i) => (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-2 rounded-md border border-primary-200 bg-white px-3 py-1.5 text-sm"
                  >
                    <span className="min-w-0 truncate text-primary-800">
                      <span className="mr-2 text-xs text-primary-500">
                        #{i + 1}
                      </span>
                      {studyLabel[id] ?? id}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setBibleStudyIds((p) => p.filter((x) => x !== id))
                      }
                      className="shrink-0 text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-primary-800">
                Age Group
              </label>
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
                className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {Object.values(AgeGroup).map((g) => (
                  <option key={g} value={g}>
                    {AGE_GROUP_LABELS[g]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-primary-800">
                Gender Group
              </label>
              <select
                value={genderGroup}
                onChange={(e) => setGenderGroup(e.target.value as GenderGroup)}
                className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {Object.values(GenderGroup).map((g) => (
                  <option key={g} value={g}>
                    {GENDER_GROUP_LABELS[g]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-primary-800">
                Start Date
              </label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-medium text-primary-800">
              <input
                type="checkbox"
                checked={isRecruiting}
                onChange={(e) => setIsRecruiting(e.target.checked)}
                className="h-4 w-4 rounded border-primary-300"
              />
              Recruiting
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-primary-800">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-primary-300"
              />
              Active
            </label>
          </div>

          <fieldset className="space-y-3 rounded-md border border-primary-200 p-3">
            <legend className="px-1 text-sm font-semibold text-primary-800">
              Meeting Details
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-primary-700">
                  Schedule
                </label>
                <input
                  type="text"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Every Wednesday, 6:00 PM"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-primary-700">
                  Date Started
                </label>
                <input
                  type="datetime-local"
                  value={dateStarted}
                  onChange={(e) => setDateStarted(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-primary-700">
                  Location (primary)
                </label>
                <input
                  type="text"
                  value={locPrimary}
                  onChange={(e) => setLocPrimary(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Church hall / Zoom"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-primary-700">
                  Location (secondary)
                </label>
                <input
                  type="text"
                  value={locSecondary}
                  onChange={(e) => setLocSecondary(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Room 2 / link"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-primary-700">
                  GPS Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={gpsLat}
                  onChange={(e) => setGpsLat(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="9.0123"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-primary-700">
                  GPS Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={gpsLng}
                  onChange={(e) => setGpsLng(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="38.7468"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-primary-800">
              <input
                type="checkbox"
                checked={isOnline}
                onChange={(e) => setIsOnline(e.target.checked)}
                className="h-4 w-4 rounded border-primary-300"
              />
              Online meeting
            </label>
          </fieldset>
        </form>
      </AppModal>

      <ConfirmDeleteModal
        open={isDeleteOpen}
        onCancel={() => {
          if (!isDeleting) setIsDeleteOpen(false);
        }}
        onConfirm={confirmDelete}
        confirmLabel={isDeleting ? "Deleting..." : "Delete"}
        disabled={isDeleting}
      />
    </div>
  );
}
