import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listUsers } from '@/lib/api/users';

export type UsersState = {
  items: any[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: UsersState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchUsers = createAsyncThunk('users/fetchAll', async () => {
  const data = await listUsers();
  return data;
});

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action: PayloadAction<any[]>) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      });
  },
});

export default usersSlice.reducer;
