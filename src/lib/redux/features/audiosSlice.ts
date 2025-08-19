import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listAudios } from '@/lib/api/audios';

export type AudiosState = {
  items: any[];
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
      .addCase(fetchAudios.fulfilled, (state, action: PayloadAction<any[]>) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchAudios.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      });
  },
});

export default audiosSlice.reducer;
