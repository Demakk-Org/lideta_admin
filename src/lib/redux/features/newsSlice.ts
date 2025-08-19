import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listNews } from '@/lib/api/news';

export type NewsState = {
  items: any[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: NewsState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchNews = createAsyncThunk('news/fetchAll', async () => {
  const data = await listNews();
  return data;
});

const newsSlice = createSlice({
  name: 'news',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchNews.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchNews.fulfilled, (state, action: PayloadAction<any[]>) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchNews.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      });
  },
});

export default newsSlice.reducer;
