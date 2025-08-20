import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listAudios, createAudio as apiCreate, updateAudio as apiUpdate, deleteAudio as apiDelete, type WithId, type AudioDoc } from '@/lib/api/audios';

export type AudiosState = {
  items: WithId<AudioDoc>[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: AudiosState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchAudios = createAsyncThunk('audios/fetchAll', async () => {
  const data = await listAudios();
  return data;
});

export const createAudio = createAsyncThunk('audios/create', async (payload: AudioDoc) => {
  const id = await apiCreate(payload);
  // Return freshly created shape so UI can optimistically show; fetchAudios will refresh later if desired
  return { id, ...payload } as WithId<AudioDoc>;
});

export const editAudio = createAsyncThunk('audios/edit', async ({ id, data }: { id: string; data: Partial<AudioDoc> }) => {
  await apiUpdate(id, data);
  return { id, data };
});

export const removeAudio = createAsyncThunk('audios/remove', async (id: string) => {
  await apiDelete(id);
  return id;
});

const audiosSlice = createSlice({
  name: 'audios',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAudios.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchAudios.fulfilled, (state, action: PayloadAction<WithId<AudioDoc>[]>) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchAudios.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createAudio.fulfilled, (state, action: PayloadAction<WithId<AudioDoc>>) => {
        state.items.unshift(action.payload);
      })
      .addCase(editAudio.fulfilled, (state, action: PayloadAction<{ id: string; data: Partial<AudioDoc> }>) => {
        const idx = state.items.findIndex((x) => x.id === action.payload.id);
        if (idx >= 0) state.items[idx] = { ...state.items[idx], ...action.payload.data } as WithId<AudioDoc>;
      })
      .addCase(removeAudio.fulfilled, (state, action: PayloadAction<string>) => {
        state.items = state.items.filter((x) => x.id !== action.payload);
      });
  },
});

export default audiosSlice.reducer;
