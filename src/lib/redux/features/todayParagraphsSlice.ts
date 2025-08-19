import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listTodayParagraphs } from '@/lib/api/todayParagraphs';

export type TodayParagraphsState = {
  items: any[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: TodayParagraphsState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchTodayParagraphs = createAsyncThunk('todayParagraphs/fetchAll', async () => {
  const data = await listTodayParagraphs();
  return data;
});

const todayParagraphsSlice = createSlice({
  name: 'todayParagraphs',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTodayParagraphs.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(
        fetchTodayParagraphs.fulfilled,
        (state, action: PayloadAction<any[]>) => {
          state.items = action.payload;
          state.status = 'succeeded';
        }
      )
      .addCase(fetchTodayParagraphs.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      });
  },
});

export default todayParagraphsSlice.reducer;
