import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { addEvent, deleteEvent, listEvents, updateEvent } from '@/lib/api/events';
import type { WithId, EventDoc } from '@/lib/api/events';

export type EventsState = {
  items: WithId<EventDoc>[];
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

export const createEvent = createAsyncThunk(
  'events/create',
  async (payload: EventDoc, { dispatch }) => {
    await addEvent(payload);
    await dispatch(fetchEvents());
  }
);

export const editEvent = createAsyncThunk(
  'events/edit',
  async ({ id, data }: { id: string; data: Partial<EventDoc> }, { dispatch }) => {
    await updateEvent(id, data);
    await dispatch(fetchEvents());
  }
);

export const removeEvent = createAsyncThunk(
  'events/remove',
  async (id: string, { dispatch }) => {
    await deleteEvent(id);
    await dispatch(fetchEvents());
  }
);

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
      .addCase(fetchEvents.fulfilled, (state, action: PayloadAction<WithId<EventDoc>[]>) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchEvents.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createEvent.rejected, (state, action) => {
        state.error = action.error.message || 'Create failed';
      })
      .addCase(editEvent.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      })
      .addCase(removeEvent.rejected, (state, action) => {
        state.error = action.error.message || 'Delete failed';
      });
  },
});

export default eventsSlice.reducer;
