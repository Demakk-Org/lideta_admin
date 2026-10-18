import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  getAboutPage,
  publishAboutPage as publishApi,
  saveAboutPageDraft as saveDraftApi,
} from '@/lib/api/aboutPage';
import type { AboutPageContent, AboutPageDoc } from '@/lib/api/aboutPage';

export type AboutPageState = {
  draft: AboutPageDoc | null;
  published: AboutPageDoc | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  saving: boolean;
  error: string | null;
};

const initialState: AboutPageState = {
  draft: null,
  published: null,
  status: 'idle',
  saving: false,
  error: null,
};

/** Loads the draft (what the form edits) and the published doc (what the app shows). */
export const fetchAboutPage = createAsyncThunk('aboutPage/fetch', getAboutPage);

export const saveAboutPageDraft = createAsyncThunk(
  'aboutPage/saveDraft',
  ({ content, uid }: { content: AboutPageContent; uid: string }) =>
    saveDraftApi(content, uid),
);

/** Copies the saved draft to `about_page/published`. */
export const publishAboutPage = createAsyncThunk(
  'aboutPage/publish',
  ({ uid }: { uid: string }) => publishApi(uid),
);

const aboutPageSlice = createSlice({
  name: 'aboutPage',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAboutPage.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchAboutPage.fulfilled, (state, action) => {
        state.draft = action.payload.draft;
        state.published = action.payload.published;
        state.status = 'succeeded';
      })
      .addCase(fetchAboutPage.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(saveAboutPageDraft.pending, (state) => {
        state.saving = true;
      })
      .addCase(saveAboutPageDraft.fulfilled, (state, action) => {
        state.draft = action.payload;
        state.saving = false;
      })
      .addCase(saveAboutPageDraft.rejected, (state) => {
        state.saving = false;
      })
      .addCase(publishAboutPage.pending, (state) => {
        state.saving = true;
      })
      .addCase(publishAboutPage.fulfilled, (state, action) => {
        state.published = action.payload;
        state.saving = false;
      })
      .addCase(publishAboutPage.rejected, (state) => {
        state.saving = false;
      });
  },
});

export default aboutPageSlice.reducer;
