import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  addDailyQuiz,
  addStandardQuiz,
  deleteQuiz,
  listQuizzes,
  publishQuiz,
  updateQuiz,
} from '@/lib/api/quizzes';
import type {
  CreateDailyQuizInput,
  CreateStandardQuizInput,
  QuizDoc,
  UpdateQuizInput,
  WithId,
} from '@/lib/api/quizzes';

export type QuizzesState = {
  items: WithId<QuizDoc>[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: QuizzesState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchQuizzes = createAsyncThunk('quizzes/fetchAll', async () => {
  return listQuizzes();
});

export const createStandardQuiz = createAsyncThunk(
  'quizzes/createStandard',
  async (payload: CreateStandardQuizInput, { dispatch }) => {
    await addStandardQuiz(payload);
    await dispatch(fetchQuizzes());
  },
);

export const createDailyQuiz = createAsyncThunk(
  'quizzes/createDaily',
  async (payload: CreateDailyQuizInput, { dispatch }) => {
    await addDailyQuiz(payload);
    await dispatch(fetchQuizzes());
  },
);

export const editQuiz = createAsyncThunk(
  'quizzes/edit',
  async ({ id, data }: { id: string; data: UpdateQuizInput }, { dispatch }) => {
    await updateQuiz(id, data);
    await dispatch(fetchQuizzes());
  },
);

export const publishQuizThunk = createAsyncThunk(
  'quizzes/publish',
  async (id: string, { dispatch }) => {
    await publishQuiz(id);
    await dispatch(fetchQuizzes());
  },
);

export const removeQuiz = createAsyncThunk(
  'quizzes/remove',
  async (id: string, { dispatch }) => {
    await deleteQuiz(id);
    await dispatch(fetchQuizzes());
  },
);

const quizzesSlice = createSlice({
  name: 'quizzes',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchQuizzes.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(
        fetchQuizzes.fulfilled,
        (state, action: PayloadAction<WithId<QuizDoc>[]>) => {
          state.items = action.payload;
          state.status = 'succeeded';
        },
      )
      .addCase(fetchQuizzes.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createStandardQuiz.rejected, (state, action) => {
        state.error = action.error.message || 'Create failed';
      })
      .addCase(createDailyQuiz.rejected, (state, action) => {
        state.error = action.error.message || 'Create failed';
      })
      .addCase(editQuiz.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      })
      .addCase(publishQuizThunk.rejected, (state, action) => {
        state.error = action.error.message || 'Publish failed';
      })
      .addCase(removeQuiz.rejected, (state, action) => {
        state.error = action.error.message || 'Delete failed';
      });
  },
});

export default quizzesSlice.reducer;
