import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listBibles } from '@/lib/api/bibles';

export type BiblesState = {
  items: any[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: BiblesState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchBibles = createAsyncThunk('bibles/fetchAll', async () => {
  const data = await listBibles();
  return data;
});

const biblesSlice = createSlice({
  name: 'bibles',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBibles.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchBibles.fulfilled, (state, action: PayloadAction<any[]>) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchBibles.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      });
  },
});

export default biblesSlice.reducer;
