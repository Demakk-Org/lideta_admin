import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listBibleBooks as listBooks } from '@/lib/api/books';

export type BooksState = {
  items: unknown[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: BooksState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchBooks = createAsyncThunk('books/fetchAll', async () => {
  const data = await listBooks();
  return data;
});

const booksSlice = createSlice({
  name: 'books',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBooks.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchBooks.fulfilled, (state, action: PayloadAction<unknown[]>) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchBooks.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      });
  },
});

export default booksSlice.reducer;
