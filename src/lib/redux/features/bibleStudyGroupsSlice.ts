import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listBibleStudyGroups } from '@/lib/api/bibleStudyGroups';

export type BibleStudyGroupsState = {
  items: any[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: BibleStudyGroupsState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchBibleStudyGroups = createAsyncThunk('bibleStudyGroups/fetchAll', async () => {
  const data = await listBibleStudyGroups();
  return data;
});

const bibleStudyGroupsSlice = createSlice({
  name: 'bibleStudyGroups',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBibleStudyGroups.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchBibleStudyGroups.fulfilled, (state, action: PayloadAction<any[]>) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchBibleStudyGroups.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      });
  },
});

export default bibleStudyGroupsSlice.reducer;
