import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  addQuizCategory,
  deleteQuizCategory,
  listQuizCategories,
  updateQuizCategory,
} from '@/lib/api/quizCategories';
import type { QuizCategory, WithId } from '@/lib/api/quizCategories';

export type QuizCategoriesState = {
  items: WithId<QuizCategory>[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: QuizCategoriesState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchQuizCategories = createAsyncThunk(
  'quizCategories/fetchAll',
  async () => {
    return listQuizCategories();
  },
);

export const createQuizCategory = createAsyncThunk(
  'quizCategories/create',
  async (payload: QuizCategory, { dispatch }) => {
    await addQuizCategory(payload);
    await dispatch(fetchQuizCategories());
  },
);

export const editQuizCategory = createAsyncThunk(
  'quizCategories/edit',
  async (
    { id, data }: { id: string; data: Partial<QuizCategory> },
    { dispatch },
  ) => {
    await updateQuizCategory(id, data);
    await dispatch(fetchQuizCategories());
  },
);

export const removeQuizCategory = createAsyncThunk(
  'quizCategories/remove',
  async (id: string, { dispatch }) => {
    await deleteQuizCategory(id);
    await dispatch(fetchQuizCategories());
  },
);

const quizCategoriesSlice = createSlice({
  name: 'quizCategories',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchQuizCategories.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(
        fetchQuizCategories.fulfilled,
        (state, action: PayloadAction<WithId<QuizCategory>[]>) => {
          state.items = action.payload;
          state.status = 'succeeded';
        },
      )
      .addCase(fetchQuizCategories.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(createQuizCategory.rejected, (state, action) => {
        state.error = action.error.message || 'Create failed';
      })
      .addCase(editQuizCategory.rejected, (state, action) => {
        state.error = action.error.message || 'Update failed';
      })
      .addCase(removeQuizCategory.rejected, (state, action) => {
        state.error = action.error.message || 'Delete failed';
      });
  },
});

export default quizCategoriesSlice.reducer;
