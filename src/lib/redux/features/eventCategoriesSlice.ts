import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { addEventCategory, deleteEventCategory, listEventCategories, updateEventCategory } from '@/lib/api/eventCategories';
import type { WithId, EventCategory } from '@/lib/api/eventCategories';

export type EventCategoriesState = {
  items: WithId<EventCategory>[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: EventCategoriesState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchEventCategories = createAsyncThunk('eventCategories/fetchAll', async () => {
  const data = await listEventCategories();
  return data;
});

export const createEventCategory = createAsyncThunk(
  'eventCategories/create',
  async (payload: EventCategory, { dispatch }) => {
    await addEventCategory(payload);
    await dispatch(fetchEventCategories());
  }
);

export const editEventCategory = createAsyncThunk(
  'eventCategories/edit',
  async ({ id, data }: { id: string; data: Partial<EventCategory> }, { dispatch }) => {
    await updateEventCategory(id, data);
    await dispatch(fetchEventCategories());
  }
);

export const removeEventCategory = createAsyncThunk(
  'eventCategories/remove',
  async (id: string, { dispatch }) => {
    await deleteEventCategory(id);
    await dispatch(fetchEventCategories());
  }
);

const eventCategoriesSlice = createSlice({
  name: 'eventCategories',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEventCategories.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(
        fetchEventCategories.fulfilled,
        (state, action: PayloadAction<WithId<EventCategory>[]>) => {
          state.items = action.payload;
          state.status = 'succeeded';
        }
      )
      .addCase(fetchEventCategories.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createEventCategory.rejected, (state, action) => {
        state.error = action.error.message || 'Create failed';
      })
      .addCase(editEventCategory.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      })
      .addCase(removeEventCategory.rejected, (state, action) => {
        state.error = action.error.message || 'Delete failed';
      });
  },
});

export default eventCategoriesSlice.reducer;
