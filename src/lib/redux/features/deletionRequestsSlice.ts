import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  executeDeletion,
  listDeletionRequests,
  updateDeletionRequest,
  type DeletionRequestDoc,
  type WithId,
} from '@/lib/api/deletionRequests';

export type DeletionRequestsState = {
  items: WithId<DeletionRequestDoc>[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: DeletionRequestsState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchDeletionRequests = createAsyncThunk(
  'deletionRequests/fetchAll',
  async () => listDeletionRequests(),
);

export const setDeletionRequestStatus = createAsyncThunk(
  'deletionRequests/setStatus',
  async (
    {
      id,
      data,
    }: {
      id: string;
      data: Pick<
        Partial<DeletionRequestDoc>,
        'status' | 'resolutionNote' | 'handledBy'
      >;
    },
    { dispatch },
  ) => {
    await updateDeletionRequest(id, data);
    await dispatch(fetchDeletionRequests());
  },
);

export const deleteAccountForRequest = createAsyncThunk(
  'deletionRequests/execute',
  async (id: string, { dispatch }) => {
    const result = await executeDeletion(id);
    await dispatch(fetchDeletionRequests());
    return result;
  },
);

const deletionRequestsSlice = createSlice({
  name: 'deletionRequests',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDeletionRequests.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(
        fetchDeletionRequests.fulfilled,
        (state, action: PayloadAction<WithId<DeletionRequestDoc>[]>) => {
          state.items = action.payload;
          state.status = 'succeeded';
        },
      )
      .addCase(fetchDeletionRequests.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(setDeletionRequestStatus.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      })
      .addCase(deleteAccountForRequest.rejected, (state, action) => {
        state.error = action.error.message || 'Deletion failed';
      });
  },
});

export default deletionRequestsSlice.reducer;
