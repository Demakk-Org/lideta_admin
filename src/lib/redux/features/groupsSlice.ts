import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listGroups } from '@/lib/api/groups';

export type GroupsState = {
  items: unknown[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: GroupsState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchGroups = createAsyncThunk('groups/fetchAll', async () => {
  const data = await listGroups();
  return data;
});

const groupsSlice = createSlice({
  name: 'groups',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchGroups.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchGroups.fulfilled, (state, action: PayloadAction<unknown[]>) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchGroups.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      });
  },
});

export default groupsSlice.reducer;
