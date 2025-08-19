import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { DailyVerse, WithId } from '@/lib/api/dailyVerse';
import {
  listDailyVerses,
  addDailyVerse,
  updateDailyVerse,
  deleteDailyVerse,
} from '@/lib/api/dailyVerse';

export type DailyVerseState = {
  items: WithId<DailyVerse>[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: DailyVerseState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchDailyVerses = createAsyncThunk('dailyVerse/fetchAll', async () => {
  const data = await listDailyVerses();
  return data;
});

export const createDailyVerse = createAsyncThunk(
  'dailyVerse/create',
  async (payload: Omit<DailyVerse, 'createdAt' | 'updatedAt'>, { dispatch }) => {
    await addDailyVerse(payload);
    // Refresh list to reflect server timestamps
    await dispatch(fetchDailyVerses());
  }
);

export const editDailyVerse = createAsyncThunk(
  'dailyVerse/edit',
  async (
    { id, data }: { id: string; data: Partial<DailyVerse> },
    { dispatch }
  ) => {
    await updateDailyVerse(id, data);
    await dispatch(fetchDailyVerses());
  }
);

export const removeDailyVerse = createAsyncThunk(
  'dailyVerse/remove',
  async (id: string, { dispatch }) => {
    await deleteDailyVerse(id);
    await dispatch(fetchDailyVerses());
  }
);

const dailyVerseSlice = createSlice({
  name: 'dailyVerse',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDailyVerses.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(
        fetchDailyVerses.fulfilled,
        (state, action: PayloadAction<WithId<DailyVerse>[]>) => {
          state.items = action.payload;
          state.status = 'succeeded';
        }
      )
      .addCase(fetchDailyVerses.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createDailyVerse.pending, (state) => {
        state.error = null;
      })
      .addCase(createDailyVerse.rejected, (state, action) => {
        state.error = action.error.message || 'Create failed';
      })
      .addCase(editDailyVerse.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      })
      .addCase(removeDailyVerse.rejected, (state, action) => {
        state.error = action.error.message || 'Delete failed';
      });
  },
});

export default dailyVerseSlice.reducer;
