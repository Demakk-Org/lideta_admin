"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/store";
import AppButton, { AppButtonVariant } from "@/components/ui/AppButton";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import {
  createCourse,
  editCourse,
  fetchCourses,
  publishCourseThunk,
  removeCourse,
  unpublishCourseThunk,
} from "@/lib/redux/features/coursesSlice";
import { fetchLessons } from "@/lib/redux/features/lessonsSlice";
import { fetchCourseCategories } from "@/lib/redux/features/courseCategoriesSlice";
import { fetchUsers } from "@/lib/redux/features/usersSlice";
import type {
  CourseDoc,
  CourseWriteInput,
  PrerequisiteCandidate,
  WithId,
} from "@/lib/api/courses";
import CoursesList from "./_components/CoursesList";
import CourseFormModal from "./_components/CourseFormModal";
import LessonsModal from "./_components/LessonsModal";

type StatusFilter = "all" | "draft" | "published";

export default function CoursesClient() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector((s) => s.courses);
  const lessonsState = useAppSelector((s) => s.lessons);
  const categoriesState = useAppSelector((s) => s.courseCategories);
  const usersState = useAppSelector((s) => s.users);
  const loading = status === "loading";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const [lessonsCourse, setLessonsCourse] = useState<WithId<CourseDoc> | null>(
    null,
  );

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (status === "idle") dispatch(fetchCourses());
    if (lessonsState.status === "idle") dispatch(fetchLessons());
    if (categoriesState.status === "idle") dispatch(fetchCourseCategories());
    if (usersState.status === "idle") dispatch(fetchUsers());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, lessonsState.status, categoriesState.status, usersState.status]);

  const categoryLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categoriesState.items) map[c.id] = c.name || c.id;
    return map;
  }, [categoriesState.items]);

  const lessonCounts = useMemo(() => {
    const map: Record<string, { total: number; published: number }> = {};
    for (const l of lessonsState.items) {
      if (!l.courseId) continue;
      const entry = map[l.courseId] ?? { total: 0, published: 0 };
      entry.total += 1;
      if (l.status === "published") entry.published += 1;
      map[l.courseId] = entry;
    }
    return map;
  }, [lessonsState.items]);

  const filteredItems = useMemo(
    () =>
      items.filter((it) => {
        if (statusFilter === "draft" && it.status === "published") return false;
        if (statusFilter === "published" && it.status !== "published") {
          return false;
        }
        return true;
      }),
    [items, statusFilter],
  );

  // The picker and its cycle check need every course, not the filtered view.
  const prerequisiteCandidates = useMemo<PrerequisiteCandidate[]>(
    () =>
      items
        .map((it) => ({
          id: it.id,
          title: it.title,
          status: it.status,
          prerequisiteCourseIds: it.prerequisiteCourseIds,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [items],
  );

  const editingItem = useMemo(
    () => (editingId ? items.find((x) => x.id === editingId) : undefined),
    [items, editingId],
  );

  // Lessons must be published before their course; the modal keeps them together.
  const lessonsCourseLive = useMemo(
    () =>
      lessonsCourse ? items.find((c) => c.id === lessonsCourse.id) ?? null : null,
    [items, lessonsCourse],
  );

  const handleSubmit = async (payload: CourseWriteInput) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (modalType === "edit" && editingId) {
        await dispatch(editCourse({ id: editingId, data: payload })).unwrap();
        toast.success("Course updated");
      } else {
        await dispatch(createCourse(payload)).unwrap();
        toast.success("Course added");
      }
      setIsModalOpen(false);
      setEditingId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublish = async (it: WithId<CourseDoc>) => {
    if (publishingId) return;
    setPublishingId(it.id);
    try {
      await dispatch(publishCourseThunk(it.id)).unwrap();
      toast.success("Course published");
    } catch (err) {
      // validateCoursePublish returns every problem at once.
      const msg = err instanceof Error ? err.message : "Publish failed";
      toast.error(msg, { duration: 8000 });
    } finally {
      setPublishingId(null);
    }
  };

  const handleUnpublish = async (it: WithId<CourseDoc>) => {
    if (publishingId) return;
    setPublishingId(it.id);
    try {
      await dispatch(unpublishCourseThunk(it.id)).unwrap();
      toast.success("Course unpublished");
    } catch {
      toast.error("Unpublish failed");
    } finally {
      setPublishingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId || isDeleting) return;
    setIsDeleting(true);
    try {
      await dispatch(removeCourse(deleteId)).unwrap();
      toast.success("Course deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
      setDeleteId(null);
    }
  };

  const deletingCourseLessons = deleteId
    ? lessonCounts[deleteId]?.total ?? 0
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-primary-800">Courses</h2>
        <div className="flex items-center gap-3">
          <label className="text-sm text-primary-700">
            <span className="mr-2">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-md border border-primary-300 bg-white px-2 py-1 text-sm"
            >
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <AppButton
            variant={AppButtonVariant.Add}
            onClick={() => {
              setModalType("add");
              setEditingId(null);
              setIsModalOpen(true);
            }}
            disabled={loading}
          >
            Add Course
          </AppButton>
        </div>
      </div>

      {lessonsState.status === "failed" && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Lessons could not be loaded, so every course shows 0 lessons.{" "}
          {lessonsState.error}
        </p>
      )}

      <CoursesList
        items={filteredItems}
        categoryLookup={categoryLookup}
        lessonCounts={lessonCounts}
        publishingId={publishingId}
        onEdit={(it) => {
          setModalType("edit");
          setEditingId(it.id);
          setIsModalOpen(true);
        }}
        onDelete={(id) => {
          setDeleteId(id);
          setIsDeleteOpen(true);
        }}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        onOpenLessons={(it) => setLessonsCourse(it)}
      />

      <CourseFormModal
        open={isModalOpen}
        mode={modalType}
        initial={editingItem}
        categories={categoriesState.items}
        prerequisiteCandidates={prerequisiteCandidates}
        submitting={submitting}
        onClose={() => {
          if (!submitting) setIsModalOpen(false);
        }}
        onSubmit={handleSubmit}
      />

      <LessonsModal
        open={!!lessonsCourse}
        courseId={lessonsCourseLive?.id ?? lessonsCourse?.id ?? null}
        courseTitle={lessonsCourseLive?.title ?? lessonsCourse?.title}
        onClose={() => setLessonsCourse(null)}
      />

      <ConfirmDeleteModal
        open={isDeleteOpen}
        onCancel={() => {
          if (!isDeleting) {
            setIsDeleteOpen(false);
            setDeleteId(null);
          }
        }}
        onConfirm={confirmDelete}
        confirmLabel={
          isDeleting
            ? "Deleting..."
            : deletingCourseLessons > 0
              ? // Lessons are a subcollection, so they go with the course.
                `Delete course and ${deletingCourseLessons} lessons`
              : "Delete"
        }
        disabled={isDeleting}
      />
    </div>
  );
}
