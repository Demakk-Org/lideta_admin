import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listEvents } from '@/lib/api/events';

export type EventsState = {
  items: any[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: EventsState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchEvents = createAsyncThunk('events/fetchAll', async () => {
  const data = await listEvents();
  return data;
});

const eventsSlice = createSlice({
  name: 'events',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEvents.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchEvents.fulfilled, (state, action: PayloadAction<any[]>) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchEvents.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      });
  },
});

export default eventsSlice.reducer;
