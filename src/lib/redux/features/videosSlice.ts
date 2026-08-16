import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listVideos, createVideo as apiCreate, updateVideo as apiUpdate, deleteVideo as apiDelete, type WithId, type VideoDoc } from '@/lib/api/videos';

export type VideosState = {
  items: WithId<VideoDoc>[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: VideosState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchVideos = createAsyncThunk('videos/fetchAll', async () => {
  console.log('[videosSlice] fetchVideos dispatched');
  try {
    const data = await listVideos();
    console.log('[videosSlice] fetchVideos resolved', { count: data.length });
    return data;
  } catch (err) {
    console.error('[videosSlice] fetchVideos failed', err);
    throw err;
  }
});

export const createVideo = createAsyncThunk('videos/create', async (payload: VideoDoc) => {
  const id = await apiCreate(payload);
  return { id, ...payload } as WithId<VideoDoc>;
});

export const editVideo = createAsyncThunk('videos/edit', async ({ id, data }: { id: string; data: VideoDoc }) => {
  await apiUpdate(id, data);
  return { id, data };
});

export const removeVideo = createAsyncThunk('videos/remove', async (id: string) => {
  await apiDelete(id);
  return id;
});

const videosSlice = createSlice({
  name: 'videos',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchVideos.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchVideos.fulfilled, (state, action: PayloadAction<WithId<VideoDoc>[]>) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchVideos.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createVideo.fulfilled, (state, action: PayloadAction<WithId<VideoDoc>>) => {
        state.items.unshift(action.payload);
      })
      .addCase(editVideo.fulfilled, (state, action: PayloadAction<{ id: string; data: VideoDoc }>) => {
        const idx = state.items.findIndex((x) => x.id === action.payload.id);
        if (idx >= 0) state.items[idx] = { id: action.payload.id, ...action.payload.data };
      })
      .addCase(removeVideo.fulfilled, (state, action: PayloadAction<string>) => {
        state.items = state.items.filter((x) => x.id !== action.payload);
      });
  },
});

export default videosSlice.reducer;
