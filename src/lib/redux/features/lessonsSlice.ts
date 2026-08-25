import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  addLesson,
  deleteLesson,
  listLessonsForCourses,
  reorderLessons,
  setLessonEstimatedMinutes,
  setLessonStatus,
  updateLesson,
} from '@/lib/api/lessons';
import { estimateLesson } from '@/lib/api/lessonEstimate';
import { listCourseOptions } from '@/lib/api/courses';
import type { LessonDoc, LessonWriteInput, WithId } from '@/lib/api/lessons';
import type { PublishStatus } from '@/lib/api/courses';
import { fetchCourses } from './coursesSlice';
import type { RootState } from '../store';

export type LessonsState = {
  items: WithId<LessonDoc>[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: LessonsState = {
  items: [],
  status: 'idle',
  error: null,
};

/**
 * Lessons live under their course, so "all lessons" means one read per course.
 * Course ids come from the loaded catalog when it is there, and from a direct
 * read when the lessons load runs first.
 */
export const fetchLessons = createAsyncThunk(
  'lessons/fetchAll',
  async (_: void, { getState }) => {
    const state = getState() as RootState;
    const loaded = state.courses.items.map((c) => c.id);
    const courseIds = loaded.length
      ? loaded
      : (await listCourseOptions()).map((c) => c.id);
    return listLessonsForCourses(courseIds);
  },
);

export const createLesson = createAsyncThunk(
  'lessons/create',
  async (payload: LessonWriteInput, { dispatch }) => {
    await addLesson(payload);
    await dispatch(fetchLessons());
  },
);

export const editLesson = createAsyncThunk(
  'lessons/edit',
  async ({ id, data }: { id: string; data: LessonWriteInput }, { dispatch }) => {
    await updateLesson(id, data);
    await dispatch(fetchLessons());
  },
);

export const changeLessonStatus = createAsyncThunk(
  'lessons/status',
  async (
    { id, courseId, status }: { id: string; courseId: string; status: PublishStatus },
    { dispatch },
  ) => {
    await setLessonStatus(id, courseId, status);
    await dispatch(fetchLessons());
    // lessonCount lives on the course document.
    await dispatch(fetchCourses());
  },
);

/**
 * Recomputes one lesson's `estimatedMinutes` from the content already in the
 * store and writes just that field. Returns the old and new values so the
 * caller can tell the admin what changed.
 */
export const reestimateLesson = createAsyncThunk(
  'lessons/reestimate',
  async (
    { id, courseId }: { id: string; courseId: string },
    { dispatch, getState },
  ) => {
    const lesson = (getState() as RootState).lessons.items.find(
      (l) => l.id === id,
    );
    if (!lesson) throw new Error('Lesson not found');

    const { minutes } = estimateLesson(lesson.content);
    const before = lesson.estimatedMinutes;
    if (minutes !== before) {
      await setLessonEstimatedMinutes(id, courseId, minutes);
      await dispatch(fetchLessons());
    }
    return { before, after: minutes };
  },
);

export const reorderLessonsThunk = createAsyncThunk(
  'lessons/reorder',
  async (
    { courseId, orderedIds }: { courseId: string; orderedIds: string[] },
    { dispatch },
  ) => {
    await reorderLessons(courseId, orderedIds);
    await dispatch(fetchLessons());
  },
);

export const removeLesson = createAsyncThunk(
  'lessons/remove',
  async ({ id, courseId }: { id: string; courseId: string }, { dispatch }) => {
    await deleteLesson(id, courseId);
    await dispatch(fetchLessons());
    await dispatch(fetchCourses());
  },
);

const lessonsSlice = createSlice({
  name: 'lessons',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchLessons.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(
        fetchLessons.fulfilled,
        (state, action: PayloadAction<WithId<LessonDoc>[]>) => {
          state.items = action.payload;
          state.status = 'succeeded';
        },
      )
      .addCase(fetchLessons.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createLesson.rejected, (state, action) => {
        state.error = action.error.message || 'Create failed';
      })
      .addCase(editLesson.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      })
      .addCase(removeLesson.rejected, (state, action) => {
        state.error = action.error.message || 'Delete failed';
      });
  },
});

export default lessonsSlice.reducer;
