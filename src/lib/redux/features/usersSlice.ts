import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listUsers, updateUser, type WithId, type UserDoc } from '@/lib/api/users';

export type UsersState = {
  items: WithId<UserDoc>[];
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

export const editUser = createAsyncThunk(
  'users/edit',
  async ({ id, data }: { id: string; data: Partial<UserDoc> }, { dispatch }) => {
    await updateUser(id, data);
    await dispatch(fetchUsers());
  }
);

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
      .addCase(fetchUsers.fulfilled, (state, action: PayloadAction<WithId<UserDoc>[]>) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(editUser.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      });
  },
});

export default usersSlice.reducer;
