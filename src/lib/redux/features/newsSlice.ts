import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { addNews, deleteNews, listNews, updateNews } from '@/lib/api/news';
import type { WithId, NewsDoc } from '@/lib/api/news';

export type NewsState = {
  items: WithId<NewsDoc>[];
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

export const createNews = createAsyncThunk(
  'news/create',
  async (payload: NewsDoc, { dispatch }) => {
    await addNews(payload);
    await dispatch(fetchNews());
  }
);

export const editNews = createAsyncThunk(
  'news/edit',
  async ({ id, data }: { id: string; data: Partial<NewsDoc> }, { dispatch }) => {
    await updateNews(id, data);
    await dispatch(fetchNews());
  }
);

export const removeNews = createAsyncThunk(
  'news/remove',
  async (id: string, { dispatch }) => {
    await deleteNews(id);
    await dispatch(fetchNews());
  }
);

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
      .addCase(fetchNews.fulfilled, (state, action: PayloadAction<WithId<NewsDoc>[]>) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchNews.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createNews.rejected, (state, action) => {
        state.error = action.error.message || 'Create failed';
      })
      .addCase(editNews.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      })
      .addCase(removeNews.rejected, (state, action) => {
        state.error = action.error.message || 'Delete failed';
      });
  },
});

export default newsSlice.reducer;
