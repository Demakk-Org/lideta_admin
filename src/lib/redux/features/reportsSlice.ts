import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  deleteReportedMessage,
  listReports,
  updateReport,
  type ReportDoc,
  type WithId,
} from '@/lib/api/reports';

export type ReportsState = {
  items: WithId<ReportDoc>[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: ReportsState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchReports = createAsyncThunk('reports/fetchAll', async () =>
  listReports(),
);

export const setReportStatus = createAsyncThunk(
  'reports/setStatus',
  async (
    {
      id,
      data,
    }: {
      id: string;
      data: Pick<Partial<ReportDoc>, 'status' | 'resolutionNote' | 'handledBy'>;
    },
    { dispatch },
  ) => {
    await updateReport(id, data);
    await dispatch(fetchReports());
  },
);

export const removeReportedMessage = createAsyncThunk(
  'reports/removeMessage',
  async (id: string, { dispatch }) => {
    await deleteReportedMessage(id);
    await dispatch(fetchReports());
  },
);

const reportsSlice = createSlice({
  name: 'reports',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchReports.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(
        fetchReports.fulfilled,
        (state, action: PayloadAction<WithId<ReportDoc>[]>) => {
          state.items = action.payload;
          state.status = 'succeeded';
        },
      )
      .addCase(fetchReports.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(setReportStatus.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      })
      .addCase(removeReportedMessage.rejected, (state, action) => {
        state.error = action.error.message || 'Delete failed';
      });
  },
});

export default reportsSlice.reducer;
