import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listBibleStudyCategories } from '@/lib/api/bibleStudyCategories';

export type BibleStudyCategoriesState = {
  items: unknown[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: BibleStudyCategoriesState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchBibleStudyCategories = createAsyncThunk('bibleStudyCategories/fetchAll', async () => {
  const data = await listBibleStudyCategories();
  return data;
});

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
        (state, action: PayloadAction<unknown[]>) => {
          state.items = action.payload;
          state.status = 'succeeded';
        }
      )
      .addCase(fetchBibleStudyCategories.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      });
  },
});

export default bibleStudyCategoriesSlice.reducer;
