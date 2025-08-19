import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { BibleSource, WithId } from '@/lib/api/bibles';
import { listBibles, addBibleSource, updateBibleSource, deleteBibleSource } from '@/lib/api/bibles';

export type BiblesState = {
  items: WithId<BibleSource>[];
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

export const createBible = createAsyncThunk(
  'bibles/create',
  async (payload: Omit<BibleSource, 'createdAt' | 'updatedAt'>, { dispatch }) => {
    await addBibleSource(payload);
    await dispatch(fetchBibles());
  }
);

export const editBible = createAsyncThunk(
  'bibles/edit',
  async ({ id, data }: { id: string; data: Partial<BibleSource> }, { dispatch }) => {
    await updateBibleSource(id, data);
    await dispatch(fetchBibles());
  }
);

export const removeBible = createAsyncThunk(
  'bibles/remove',
  async (id: string, { dispatch }) => {
    await deleteBibleSource(id);
    await dispatch(fetchBibles());
  }
);

const biblesSlice = createSlice({
  name: 'bibles',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBibles.pending, (state) => {
        console.log('[biblesSlice] fetchBibles.pending');
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchBibles.fulfilled, (state, action: PayloadAction<WithId<BibleSource>[]>) => {
        console.log('[biblesSlice] fetchBibles.fulfilled items', action.payload.length);
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchBibles.rejected, (state, action) => {
        console.log('[biblesSlice] fetchBibles.rejected', action.error);
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createBible.rejected, (state, action) => {
        console.log('[biblesSlice] createBible.rejected', action.error);
        state.error = action.error.message || 'Create failed';
      })
      .addCase(editBible.rejected, (state, action) => {
        console.log('[biblesSlice] editBible.rejected', action.error);
        state.error = action.error.message || 'Update failed';
      })
      .addCase(removeBible.rejected, (state, action) => {
        console.log('[biblesSlice] removeBible.rejected', action.error);
        state.error = action.error.message || 'Delete failed';
      });
  },
});

export default biblesSlice.reducer;
