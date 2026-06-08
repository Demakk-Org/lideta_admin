import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  addBibleStudy,
  deleteBibleStudy,
  listBibleStudies,
  updateBibleStudy,
} from '@/lib/api/bibleStudies';
import type { BibleStudy, BibleStudyInput, WithId } from '@/lib/api/bibleStudies';
import { fetchBibleStudyCategories } from './bibleStudyCategoriesSlice';

export type BibleStudiesState = {
  items: WithId<BibleStudy>[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: BibleStudiesState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchBibleStudies = createAsyncThunk('bibleStudies/fetchAll', async () => {
  const data = await listBibleStudies();
  return data;
});

export const createBibleStudy = createAsyncThunk(
  'bibleStudies/create',
  async (payload: BibleStudyInput, { dispatch }) => {
    await addBibleStudy(payload);
    // Studies changed -> category counts may have changed; refresh both.
    await Promise.all([
      dispatch(fetchBibleStudies()),
      dispatch(fetchBibleStudyCategories()),
    ]);
  },
);

export const editBibleStudy = createAsyncThunk(
  'bibleStudies/edit',
  async ({ id, data }: { id: string; data: BibleStudyInput }, { dispatch }) => {
    await updateBibleStudy(id, data);
    await Promise.all([
      dispatch(fetchBibleStudies()),
      dispatch(fetchBibleStudyCategories()),
    ]);
  },
);

export const removeBibleStudy = createAsyncThunk(
  'bibleStudies/remove',
  async (id: string, { dispatch }) => {
    await deleteBibleStudy(id);
    await Promise.all([
      dispatch(fetchBibleStudies()),
      dispatch(fetchBibleStudyCategories()),
    ]);
  },
);

const bibleStudiesSlice = createSlice({
  name: 'bibleStudies',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBibleStudies.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchBibleStudies.fulfilled, (state, action: PayloadAction<WithId<BibleStudy>[]>) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchBibleStudies.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createBibleStudy.rejected, (state, action) => {
        state.error = action.error.message || 'Create failed';
      })
      .addCase(editBibleStudy.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      })
      .addCase(removeBibleStudy.rejected, (state, action) => {
        state.error = action.error.message || 'Delete failed';
      });
  },
});

export default bibleStudiesSlice.reducer;
