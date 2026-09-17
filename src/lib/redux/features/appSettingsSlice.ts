import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  createDraftVersion as createDraftVersionApi,
  deleteDraftVersion as deleteDraftVersionApi,
  getPublishedSettings,
  listFeatureVersions,
  listPublishHistory,
  publishFeatureVersion as publishFeatureVersionApi,
  saveDraftVersion as saveDraftVersionApi,
  type FeatureVersion,
  type PublishedSettings,
  type PublishHistoryEntry,
} from '@/lib/api/appSettings';
import type { RawFeatures } from '@/lib/appSettings/featureRules';

export type AppSettingsState = {
  published: PublishedSettings | null;
  versions: FeatureVersion[];
  history: PublishHistoryEntry[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  historyStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  /** A create, save, publish or delete is in flight. */
  saving: boolean;
  error: string | null;
};

const initialState: AppSettingsState = {
  published: null,
  versions: [],
  history: [],
  status: 'idle',
  historyStatus: 'idle',
  saving: false,
  error: null,
};

/** The published document and every version, loaded together so they agree. */
export const fetchAppSettings = createAsyncThunk('appSettings/fetch', async () => {
  const [published, versions] = await Promise.all([
    getPublishedSettings(),
    listFeatureVersions(),
  ]);
  return { published, versions };
});

export const fetchAppSettingsHistory = createAsyncThunk(
  'appSettings/fetchHistory',
  async () => listPublishHistory(10),
);

/** Resolves to the new draft's version number. */
export const createDraftVersion = createAsyncThunk(
  'appSettings/createDraft',
  async (
    args: { features: RawFeatures; basedOn: number | null; note: string; uid: string },
    { dispatch },
  ) => {
    const version = await createDraftVersionApi(args);
    await dispatch(fetchAppSettings());
    return version;
  },
);

export const saveDraftVersion = createAsyncThunk(
  'appSettings/saveDraft',
  async (
    args: {
      version: number;
      expectedRevision: number;
      features: RawFeatures;
      note: string;
      uid: string;
    },
    { dispatch },
  ) => {
    await saveDraftVersionApi(args);
    await dispatch(fetchAppSettings());
  },
);

export const publishFeatureVersion = createAsyncThunk(
  'appSettings/publish',
  async (
    args: { version: number; expectedPublishedVersion: number; uid: string },
    { dispatch },
  ) => {
    await publishFeatureVersionApi(args);
    await Promise.all([dispatch(fetchAppSettings()), dispatch(fetchAppSettingsHistory())]);
  },
);

export const deleteDraftVersion = createAsyncThunk(
  'appSettings/deleteDraft',
  async (version: number, { dispatch }) => {
    await deleteDraftVersionApi(version);
    await dispatch(fetchAppSettings());
  },
);

const mutations = [
  createDraftVersion,
  saveDraftVersion,
  publishFeatureVersion,
  deleteDraftVersion,
] as const;

const appSettingsSlice = createSlice({
  name: 'appSettings',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAppSettings.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(
        fetchAppSettings.fulfilled,
        (
          state,
          action: PayloadAction<{ published: PublishedSettings; versions: FeatureVersion[] }>,
        ) => {
          state.published = action.payload.published;
          state.versions = action.payload.versions;
          state.status = 'succeeded';
        },
      )
      .addCase(fetchAppSettings.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(fetchAppSettingsHistory.pending, (state) => {
        state.historyStatus = 'loading';
      })
      .addCase(
        fetchAppSettingsHistory.fulfilled,
        (state, action: PayloadAction<PublishHistoryEntry[]>) => {
          state.history = action.payload;
          state.historyStatus = 'succeeded';
        },
      )
      .addCase(fetchAppSettingsHistory.rejected, (state) => {
        state.historyStatus = 'failed';
      });

    for (const thunk of mutations) {
      builder
        .addCase(thunk.pending, (state) => {
          state.saving = true;
        })
        .addCase(thunk.fulfilled, (state) => {
          state.saving = false;
        })
        .addCase(thunk.rejected, (state, action) => {
          state.saving = false;
          state.error = action.error.message || 'Save failed';
        });
    }
  },
});

export default appSettingsSlice.reducer;
