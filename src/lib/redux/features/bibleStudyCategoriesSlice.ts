import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  addBibleStudyCategory,
  deleteBibleStudyCategory,
  listBibleStudyCategories,
  recountBibleStudyCategoryCounts,
  updateBibleStudyCategory,
} from '@/lib/api/bibleStudyCategories';
import type {
  BibleStudyCategory,
  BibleStudyCategoryInput,
  WithId,
} from '@/lib/api/bibleStudyCategories';

export type BibleStudyCategoriesState = {
  items: WithId<BibleStudyCategory>[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: BibleStudyCategoriesState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchBibleStudyCategories = createAsyncThunk(
  'bibleStudyCategories/fetchAll',
  async () => {
    return listBibleStudyCategories();
  },
);

export const createBibleStudyCategory = createAsyncThunk(
  'bibleStudyCategories/create',
  async (payload: BibleStudyCategoryInput, { dispatch }) => {
    await addBibleStudyCategory(payload);
    await dispatch(fetchBibleStudyCategories());
  },
);

export const editBibleStudyCategory = createAsyncThunk(
  'bibleStudyCategories/edit',
  async (
    { id, data }: { id: string; data: BibleStudyCategoryInput },
    { dispatch },
  ) => {
    await updateBibleStudyCategory(id, data);
    await dispatch(fetchBibleStudyCategories());
  },
);

export const removeBibleStudyCategory = createAsyncThunk(
  'bibleStudyCategories/remove',
  async (id: string, { dispatch }) => {
    await deleteBibleStudyCategory(id);
    await dispatch(fetchBibleStudyCategories());
  },
);

export const recountBibleStudyCategories = createAsyncThunk(
  'bibleStudyCategories/recount',
  async (_: void, { dispatch }) => {
    await recountBibleStudyCategoryCounts();
    await dispatch(fetchBibleStudyCategories());
  },
);

const bibleStudyCategoriesSlice = createSlice({
  name: 'bibleStudyCategories',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBibleStudyCategories.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(
        fetchBibleStudyCategories.fulfilled,
        (state, action: PayloadAction<WithId<BibleStudyCategory>[]>) => {
          state.items = action.payload;
          state.status = 'succeeded';
        },
      )
      .addCase(fetchBibleStudyCategories.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createBibleStudyCategory.rejected, (state, action) => {
        state.error = action.error.message || 'Create failed';
      })
      .addCase(editBibleStudyCategory.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      })
      .addCase(removeBibleStudyCategory.rejected, (state, action) => {
        state.error = action.error.message || 'Delete failed';
      });
  },
});

export default bibleStudyCategoriesSlice.reducer;
