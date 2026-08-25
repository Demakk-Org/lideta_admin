import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  addCourse,
  deleteCourse,
  listCourses,
  publishCourse,
  setCourseStatus,
  updateCourse,
} from '@/lib/api/courses';
import type { CourseDoc, CourseWriteInput, WithId } from '@/lib/api/courses';

export type CoursesState = {
  items: WithId<CourseDoc>[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: CoursesState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchCourses = createAsyncThunk('courses/fetchAll', async () => {
  return listCourses();
});

export const createCourse = createAsyncThunk(
  'courses/create',
  async (payload: CourseWriteInput, { dispatch }) => {
    await addCourse(payload);
    await dispatch(fetchCourses());
  },
);

export const editCourse = createAsyncThunk(
  'courses/edit',
  async (
    { id, data }: { id: string; data: CourseWriteInput },
    { dispatch },
  ) => {
    await updateCourse(id, data);
    await dispatch(fetchCourses());
  },
);

export const publishCourseThunk = createAsyncThunk(
  'courses/publish',
  async (id: string, { dispatch }) => {
    await publishCourse(id);
    await dispatch(fetchCourses());
  },
);

export const unpublishCourseThunk = createAsyncThunk(
  'courses/unpublish',
  async (id: string, { dispatch }) => {
    await setCourseStatus(id, 'draft');
    await dispatch(fetchCourses());
  },
);

export const removeCourse = createAsyncThunk(
  'courses/remove',
  async (id: string, { dispatch }) => {
    await deleteCourse(id);
    await dispatch(fetchCourses());
  },
);

const coursesSlice = createSlice({
  name: 'courses',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCourses.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(
        fetchCourses.fulfilled,
        (state, action: PayloadAction<WithId<CourseDoc>[]>) => {
          state.items = action.payload;
          state.status = 'succeeded';
        },
      )
      .addCase(fetchCourses.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createCourse.rejected, (state, action) => {
        state.error = action.error.message || 'Create failed';
      })
      .addCase(editCourse.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      })
      .addCase(publishCourseThunk.rejected, (state, action) => {
        state.error = action.error.message || 'Publish failed';
      })
      .addCase(removeCourse.rejected, (state, action) => {
        state.error = action.error.message || 'Delete failed';
      });
  },
});

export default coursesSlice.reducer;
