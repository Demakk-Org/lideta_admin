import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  addCourseCategory,
  deleteCourseCategory,
  listCourseCategories,
  updateCourseCategory,
} from '@/lib/api/courseCategories';
import type { CourseCategory, WithId } from '@/lib/api/courseCategories';

export type CourseCategoriesState = {
  items: WithId<CourseCategory>[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: CourseCategoriesState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchCourseCategories = createAsyncThunk(
  'courseCategories/fetchAll',
  async () => {
    return listCourseCategories();
  },
);

export const createCourseCategory = createAsyncThunk(
  'courseCategories/create',
  async (payload: CourseCategory, { dispatch }) => {
    await addCourseCategory(payload);
    await dispatch(fetchCourseCategories());
  },
);

export const editCourseCategory = createAsyncThunk(
  'courseCategories/edit',
  async ({ id, data }: { id: string; data: CourseCategory }, { dispatch }) => {
    await updateCourseCategory(id, data);
    await dispatch(fetchCourseCategories());
  },
);

export const removeCourseCategory = createAsyncThunk(
  'courseCategories/remove',
  async (id: string, { dispatch }) => {
    await deleteCourseCategory(id);
    await dispatch(fetchCourseCategories());
  },
);

const courseCategoriesSlice = createSlice({
  name: 'courseCategories',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCourseCategories.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(
        fetchCourseCategories.fulfilled,
        (state, action: PayloadAction<WithId<CourseCategory>[]>) => {
          state.items = action.payload;
          state.status = 'succeeded';
        },
      )
      .addCase(fetchCourseCategories.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createCourseCategory.rejected, (state, action) => {
        state.error = action.error.message || 'Create failed';
      })
      .addCase(editCourseCategory.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      })
      .addCase(removeCourseCategory.rejected, (state, action) => {
        state.error = action.error.message || 'Delete failed';
      });
  },
});

export default courseCategoriesSlice.reducer;
