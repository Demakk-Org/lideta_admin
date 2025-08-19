import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listEventCategories } from '@/lib/api/eventCategories';

export type EventCategoriesState = {
  items: any[];
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
        (state, action: PayloadAction<any[]>) => {
          state.items = action.payload;
          state.status = 'succeeded';
        }
      )
      .addCase(fetchEventCategories.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      });
  },
});

export default eventCategoriesSlice.reducer;
