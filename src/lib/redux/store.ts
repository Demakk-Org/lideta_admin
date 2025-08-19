import { configureStore, createSlice } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import dailyVerseReducer from './features/dailyVerseSlice';
import biblesReducer from './features/biblesSlice';
import booksReducer from './features/booksSlice';
import bibleStudiesReducer from './features/bibleStudiesSlice';
import bibleStudyCategoriesReducer from './features/bibleStudyCategoriesSlice';
import bibleStudyGroupsReducer from './features/bibleStudyGroupsSlice';
import newsReducer from './features/newsSlice';
import eventsReducer from './features/eventsSlice';
import eventCategoriesReducer from './features/eventCategoriesSlice';
import audiosReducer from './features/audiosSlice';
import groupsReducer from './features/groupsSlice';
import usersReducer from './features/usersSlice';
import todayParagraphsReducer from './features/todayParagraphsSlice';

// Import your reducers here
// import someReducer from './features/someFeature/someSlice';

// Minimal placeholder slice to satisfy Redux store requirements
const appSlice = createSlice({
  name: 'app',
  initialState: {},
  reducers: {},
});

export const store = configureStore({
  reducer: {
    // Add your reducers here
    // some: someReducer,
    app: appSlice.reducer,
    dailyVerse: dailyVerseReducer,
    bibles: biblesReducer,
    books: booksReducer,
    bibleStudies: bibleStudiesReducer,
    bibleStudyCategories: bibleStudyCategoriesReducer,
    bibleStudyGroups: bibleStudyGroupsReducer,
    news: newsReducer,
    events: eventsReducer,
    eventCategories: eventCategoriesReducer,
    audios: audiosReducer,
    groups: groupsReducer,
    users: usersReducer,
    todayParagraphs: todayParagraphsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
