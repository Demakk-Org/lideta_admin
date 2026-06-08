import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  addBibleStudyGroup,
  deleteBibleStudyGroup,
  listBibleStudyGroups,
  updateBibleStudyGroup,
} from '@/lib/api/bibleStudyGroups';
import type {
  BibleStudyGroup,
  BibleStudyGroupInput,
  WithId,
} from '@/lib/api/bibleStudyGroups';

export type BibleStudyGroupsState = {
  items: WithId<BibleStudyGroup>[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: BibleStudyGroupsState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchBibleStudyGroups = createAsyncThunk(
  'bibleStudyGroups/fetchAll',
  async () => {
    return listBibleStudyGroups();
  },
);

export const createBibleStudyGroup = createAsyncThunk(
  'bibleStudyGroups/create',
  async (payload: BibleStudyGroupInput, { dispatch }) => {
    await addBibleStudyGroup(payload);
    await dispatch(fetchBibleStudyGroups());
  },
);

export const editBibleStudyGroup = createAsyncThunk(
  'bibleStudyGroups/edit',
  async (
    { id, data }: { id: string; data: BibleStudyGroupInput },
    { dispatch },
  ) => {
    await updateBibleStudyGroup(id, data);
    await dispatch(fetchBibleStudyGroups());
  },
);

export const removeBibleStudyGroup = createAsyncThunk(
  'bibleStudyGroups/remove',
  async (id: string, { dispatch }) => {
    await deleteBibleStudyGroup(id);
    await dispatch(fetchBibleStudyGroups());
  },
);

const bibleStudyGroupsSlice = createSlice({
  name: 'bibleStudyGroups',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBibleStudyGroups.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(
        fetchBibleStudyGroups.fulfilled,
        (state, action: PayloadAction<WithId<BibleStudyGroup>[]>) => {
          state.items = action.payload;
          state.status = 'succeeded';
        },
      )
      .addCase(fetchBibleStudyGroups.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createBibleStudyGroup.rejected, (state, action) => {
        state.error = action.error.message || 'Create failed';
      })
      .addCase(editBibleStudyGroup.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      })
      .addCase(removeBibleStudyGroup.rejected, (state, action) => {
        state.error = action.error.message || 'Delete failed';
      });
  },
});

export default bibleStudyGroupsSlice.reducer;
