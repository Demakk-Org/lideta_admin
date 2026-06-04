import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listBibleStudies } from '@/lib/api/bibleStudies';
import type { BibleStudy, WithId } from '@/lib/api/bibleStudies';

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
      });
  },
});

export default bibleStudiesSlice.reducer;
