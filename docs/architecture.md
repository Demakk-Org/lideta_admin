# Lideta Admin Architecture & Conventions

This document is the source-of-truth for developers and AI agents working on this project. It defines where code lives, how features are structured, and how logging is handled to keep the console clean and actionable.

## Overview

- React + Next.js App Router
- State: Redux Toolkit
- Backend: Firebase Firestore
- UI: TailwindCSS, custom UI components under `src/components/ui/`
- Notifications: `react-hot-toast`

## Directory Layout

- `src/app/`
  - `dashboard/` — Feature pages for the admin dashboard
    - `bibles/` — Bible sources feature
    - `daily-verse/` — Daily verse feature
- `src/components/`
  - `ui/` — Reusable app-wide UI components (e.g., `AppButton`, `AppModal`)
- `src/lib/`
  - `api/` — Firestore API wrappers per feature (no React, no Redux)
  - `redux/` — Store setup and feature slices
  - `firebase/` — Firebase config (`config.ts`)
  - `types/` — Shared TS types & ambient declarations

## Feature Module Structure

Each feature should mirror the following pattern:

- `src/lib/api/<feature>.ts`
  - Export TypeScript types for the feature.
  - Export CRUD functions that wrap Firestore calls.
  - Throw errors on failure so slices/components can handle them.
  - Log only once per API call (success/failure). Keep logs short and structured.

- `src/lib/redux/features/<feature>Slice.ts`
  - Define the slice state (`items`, `status`, `error`).
  - Define async thunks to call APIs. Thunks themselves should NOT log.
  - In `extraReducers`, log concise state changes (pending/fulfilled/rejected) only.
  - Keep reducers pure and minimal.

- `src/app/dashboard/<feature>/*`
  - `FeatureClient.tsx` — The main client component that wires UI to Redux thunks.
  - `_components/` — Feature-specific presentational components.
  - Use `AppButton` and `AppModal` from `src/components/ui/` for consistency.

## Logging Conventions

The goal is to minimize console noise while preserving useful breadcrumbs.

- UI Components (React):
  - Do NOT log to the console.
  - Use `toast.success`/`toast.error` for user-facing feedback.

- Redux Slices:
  - Thunks: No logging.
  - `extraReducers`: Log only when state changes.
    - pending: `console.log('[featureSlice] fetchX.pending')`
    - fulfilled: `console.log('[featureSlice] fetchX.fulfilled items', count)`
    - rejected: `console.log('[featureSlice] fetchX.rejected', error)`

- API Layer (`src/lib/api/*.ts`):
  - Wrap calls in `try/catch`.
  - Log a short message at the start (optional) and on success (where it adds value) and on failure.
  - Throw an `Error` so callers can handle it (and slices can set `error`).

Example (DailyVerse):
- `src/lib/api/dailyVerse.ts` logs success/failure within each function.
- `src/lib/redux/features/dailyVerseSlice.ts` logs in `extraReducers` only.
- `src/app/dashboard/daily-verse/TodayVerseClient.tsx` shows toasts, no console logs.

## Where Things Go

- API calls: `src/lib/api/<feature>.ts`
- Redux slice & thunks: `src/lib/redux/features/<feature>Slice.ts`
- Cross-feature UI components: `src/components/ui/`
- Feature-only components: `src/app/dashboard/<feature>/_components/`
- Utilities and shared types: `src/lib/`

## Error Handling

- APIs should catch and log errors, then `throw new Error('<short message>')`.
- Slices should set `state.error` in rejected handlers.
- UI should show toasts and never rely on `console.error`.

## DailyVerse as a Model Feature

- See `src/lib/api/dailyVerse.ts` for API try/catch with structured logs.
- See `src/lib/redux/features/dailyVerseSlice.ts` for `extraReducers` logging.
- See `src/app/dashboard/daily-verse/TodayVerseClient.tsx` for UI without console logs.

## Bible Sources Feature

- API: `src/lib/api/bibles.ts` logs at boundaries and throws on failure.
- Slice: `src/lib/redux/features/biblesSlice.ts` logs only in `extraReducers`.
- UI: Components in `src/app/dashboard/bibles/` have no console logs.

## Component Placement Rules

- If a component is used across features or pages, place it in `src/components/ui/`.
- If a component is specific to a single feature page, place it under that feature's `_components/`.

## Checklist for New Feature

- [ ] Create `src/lib/api/<feature>.ts` with types and CRUD APIs
- [ ] Add Redux slice at `src/lib/redux/features/<feature>Slice.ts`
- [ ] Build page at `src/app/dashboard/<feature>/<Feature>Client.tsx`
- [ ] Put presentational components in `src/app/dashboard/<feature>/_components/`
- [ ] Use `AppButton`/`AppModal` from `src/components/ui/`
- [ ] Logging limited to APIs (success/failure) and slice state updates only
- [ ] UI uses toasts for user feedback; no console logs

## Notes

- Firestore config is imported from `@/lib/firebase/config`.
- When returning Firestore docs, always attach `id` via the `{ id: d.id, ...data }` pattern.
- Prefer `Omit<...,'createdAt'|'updatedAt'>` in payload types when timestamps are server-side.
