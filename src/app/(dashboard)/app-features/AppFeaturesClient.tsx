'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAppDispatch, useAppSelector } from '@/lib/redux/store';
import AppButton, { AppButtonVariant } from '@/components/ui/AppButton';
import AppModal from '@/components/ui/AppModal';
import { useAuthReady } from '@/lib/hooks/useAuthReady';
import {
  createDraftVersion,
  deleteDraftVersion,
  fetchAppSettings,
  fetchAppSettingsHistory,
  publishFeatureVersion,
  saveDraftVersion,
} from '@/lib/redux/features/appSettingsSlice';
import { STALE_VERSION_ERROR, type FeatureVersion } from '@/lib/api/appSettings';
import {
  FEATURES,
  FEATURE_GROUPS,
  FEATURE_KEYS,
  getFeature,
  isFeatureKey,
  type FeatureKey,
} from '@/lib/featureKeys';
import {
  applyToggle,
  canEditVersion,
  canPublishVersion,
  defaultSelectedVersion,
  dependencyViolations,
  diffFeatures,
  enabledDependents,
  isOn,
  mergeFeatures,
  missingDependencies,
  unknownFeatureKeys,
  unsetFeatureKeys,
  type FeatureChange,
  type FeatureEdits,
  type RawFeatures,
  type VersionStatus,
} from '@/lib/appSettings/featureRules';

function labelOf(key: string) {
  return isFeatureKey(key) ? getFeature(key).label : key;
}

function listLabels(keys: readonly string[]) {
  return keys.map(labelOf).join(', ');
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function stateText(value: boolean | null) {
  return value === null ? 'unset' : value ? 'on' : 'off';
}

function ChangeText({ change }: { change: FeatureChange }) {
  return (
    <span>
      {stateText(change.from)} → <strong>{stateText(change.to)}</strong>
    </span>
  );
}

const STATUS_STYLES: Record<VersionStatus, string> = {
  draft: 'bg-amber-100 text-amber-800',
  published: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-700',
};

function StatusBadge({ status }: { status: VersionStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

function Switch({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'bg-green-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function ChangeList({ changes }: { changes: Record<string, FeatureChange> }) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return <p className="text-primary-600">No feature changes.</p>;
  return (
    <ul className="space-y-1">
      {entries.map(([key, change]) => (
        <li key={key}>
          <span className="font-medium">{labelOf(key)}</span>: <ChangeText change={change} />
        </li>
      ))}
    </ul>
  );
}

/** Where a new draft copies its features from. */
type DraftSource = { features: RawFeatures; basedOn: number | null; label: string };

export default function AppFeaturesClient() {
  const dispatch = useAppDispatch();
  const { published, versions, history, status, historyStatus, saving, error } =
    useAppSelector((s) => s.appSettings);
  // Versions and history are admin-only in the rules, so wait for the restored session.
  const { ready, uid } = useAuthReady();

  const [selected, setSelected] = useState<number | null>(null);
  const [edits, setEdits] = useState<FeatureEdits>({});
  const [noteEdit, setNoteEdit] = useState<string | null>(null);
  const [pendingDisable, setPendingDisable] = useState<{
    key: FeatureKey;
    dependents: FeatureKey[];
  } | null>(null);
  const [draftSource, setDraftSource] = useState<DraftSource | null>(null);
  const [newDraftNote, setNewDraftNote] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [stale, setStale] = useState<string | null>(null);

  const resetEdits = () => {
    setEdits({});
    setNoteEdit(null);
  };

  const load = () => {
    resetEdits();
    setStale(null);
    dispatch(fetchAppSettings());
    dispatch(fetchAppSettingsHistory());
  };

  useEffect(() => {
    if (ready && uid) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, ready, uid]);

  // Open on a sensible version once loaded, and move off one that was deleted.
  useEffect(() => {
    if (status !== 'succeeded') return;
    if (selected === null || !versions.some((v) => v.version === selected)) {
      setSelected(defaultSelectedVersion(versions));
    }
  }, [status, versions, selected]);

  const current: FeatureVersion | null = useMemo(
    () => versions.find((v) => v.version === selected) ?? null,
    [versions, selected],
  );
  const editable = !!current && canEditVersion(current.status);

  const stored = useMemo(() => current?.features ?? {}, [current]);
  const draft = useMemo(() => mergeFeatures(stored, edits), [stored, edits]);
  const note = noteEdit ?? current?.note ?? '';
  const unsaved = useMemo(() => diffFeatures(stored, draft), [stored, draft]);
  const noteChanged = noteEdit !== null && noteEdit !== (current?.note ?? '');
  const unsavedCount = Object.keys(unsaved).length + (noteChanged ? 1 : 0);
  const hasUnsaved = unsavedCount > 0;

  const publishedFeatures = useMemo(() => published?.features ?? {}, [published]);
  const vsPublished = useMemo(
    () => diffFeatures(publishedFeatures, draft),
    [publishedFeatures, draft],
  );
  const violations = useMemo(() => dependencyViolations(draft), [draft]);
  const unknownKeys = useMemo(() => unknownFeatureKeys(stored), [stored]);
  const unsetKeys = useMemo(() => unsetFeatureKeys(stored), [stored]);

  // Warn before leaving with unsaved toggles.
  useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsaved]);

  const handleError = (err: unknown, fallback: string) => {
    const e = err as { name?: string; message?: string };
    if (e.name === STALE_VERSION_ERROR) {
      setStale(e.message ?? 'Feature settings changed since you loaded them.');
      toast.error('Someone else changed these settings. Reload first.');
    } else {
      toast.error(e.message || fallback);
    }
  };

  const selectVersion = (version: number) => {
    if (version === selected) return;
    if (hasUnsaved) {
      toast.error('Save or discard your changes first.');
      return;
    }
    setSelected(version);
  };

  const setFeature = (key: FeatureKey, value: boolean) =>
    setEdits((prev) => applyToggle(stored, prev, key, value));

  const handleToggle = (key: FeatureKey, next: boolean) => {
    if (next) {
      const missing = missingDependencies(key, draft);
      if (missing.length > 0) {
        toast.error(
          `${labelOf(key)} needs ${listLabels(missing)}. Turn ${
            missing.length === 1 ? 'it' : 'them'
          } on first.`,
        );
        return;
      }
      setFeature(key, true);
      return;
    }

    const dependents = enabledDependents(key, draft);
    if (dependents.length > 0) {
      setPendingDisable({ key, dependents });
      return;
    }
    setFeature(key, false);
  };

  const disableWithDependents = (includeDependents: boolean) => {
    if (!pendingDisable) return;
    const { key, dependents } = pendingDisable;
    setEdits((prev) => {
      let next = applyToggle(stored, prev, key, false);
      if (includeDependents) {
        for (const dep of dependents) next = applyToggle(stored, next, dep, false);
      }
      return next;
    });
    setPendingDisable(null);
  };

  const openNewDraft = (source: DraftSource) => {
    if (hasUnsaved) {
      toast.error('Save or discard your changes first.');
      return;
    }
    setNewDraftNote('');
    setDraftSource(source);
  };

  const runCreateDraft = async () => {
    if (!draftSource || !uid) return;
    try {
      const version = await dispatch(
        createDraftVersion({
          features: draftSource.features,
          basedOn: draftSource.basedOn,
          note: newDraftNote.trim(),
          uid,
        }),
      ).unwrap();
      setDraftSource(null);
      resetEdits();
      setSelected(version);
      toast.success(`Draft version ${version} created.`);
    } catch (err) {
      setDraftSource(null);
      handleError(err, 'Could not create the draft');
    }
  };

  const runSaveDraft = async () => {
    if (!current || !uid) return;
    try {
      await dispatch(
        saveDraftVersion({
          version: current.version,
          expectedRevision: current.revision,
          features: draft,
          note: note.trim(),
          uid,
        }),
      ).unwrap();
      resetEdits();
      toast.success(`Draft version ${current.version} saved.`);
    } catch (err) {
      handleError(err, 'Save failed');
    }
  };

  const runPublish = async () => {
    if (!current || !uid || !published) return;
    try {
      await dispatch(
        publishFeatureVersion({
          version: current.version,
          expectedPublishedVersion: published.version,
          uid,
        }),
      ).unwrap();
      setPublishOpen(false);
      toast.success(`Version ${current.version} is now live for every user.`);
    } catch (err) {
      setPublishOpen(false);
      handleError(err, 'Publish failed');
    }
  };

  const runDelete = async () => {
    if (!current) return;
    try {
      await dispatch(deleteDraftVersion(current.version)).unwrap();
      setDeleteOpen(false);
      resetEdits();
      setSelected(null);
      toast.success(`Draft version ${current.version} deleted.`);
    } catch (err) {
      setDeleteOpen(false);
      handleError(err, 'Delete failed');
    }
  };

  const loading = !ready || (status === 'loading' && !published);
  const isPublished = current?.status === 'published';

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-primary-800">App features</h2>
          <p className="text-sm text-primary-700">
            Prepare changes in a draft version, then publish it. The mobile app
            only reads the published version, so drafts never reach users.
            Open apps pick up a publish within moments; others get it the next
            time they start.
          </p>
        </div>
        <div className="shrink-0 rounded-md border border-primary-200 bg-white px-3 py-2 text-xs text-primary-700">
          <div>
            Published version:{' '}
            <span className="font-semibold text-primary-900">
              {published?.exists ? published.version : '—'}
            </span>
          </div>
          <div>
            Published:{' '}
            <span className="font-semibold text-primary-900">
              {formatDateTime(published?.updatedAt ?? null)}
            </span>
          </div>
        </div>
      </div>

      {status === 'failed' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Could not load feature settings: {error}
        </div>
      )}

      {stale && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{stale}</span>
          <AppButton
            variant={AppButtonVariant.Edit}
            className="px-3 py-1 text-xs"
            onClick={load}
          >
            Reload (discards your changes)
          </AppButton>
        </div>
      )}

      {published && !published.exists && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Nothing is published yet, so the app falls back to{' '}
          <strong>every feature on</strong>. Run the seed script (
          <code>npm run seed:app-settings</code>) to publish version 1, or
          create a draft here and publish it.
        </div>
      )}

      {loading ? (
        <p className="text-sm text-primary-600">Loading…</p>
      ) : (
        published && (
          <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            <aside className="space-y-3">
              <AppButton
                variant={AppButtonVariant.Add}
                className="w-full"
                disabled={saving}
                onClick={() =>
                  openNewDraft(
                    published.exists
                      ? {
                          features: published.features,
                          basedOn: published.version,
                          label: `the published version ${published.version}`,
                        }
                      : {
                          features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])),
                          basedOn: null,
                          label: 'all features on',
                        },
                  )
                }
              >
                New draft
              </AppButton>
              <section className="rounded-md border border-primary-200 bg-white">
                <h3 className="border-b border-primary-100 px-4 py-2 text-sm font-semibold text-primary-800">
                  Versions
                </h3>
                {versions.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-primary-600">No versions yet.</p>
                ) : (
                  <ul className="max-h-[32rem] divide-y divide-primary-100 overflow-y-auto">
                    {versions.map((v) => (
                      <li key={v.version}>
                        <button
                          type="button"
                          onClick={() => selectVersion(v.version)}
                          aria-current={v.version === selected ? 'true' : undefined}
                          // Same active marker as the side nav. Unselected rows keep a
                          // transparent border so their text doesn't shift.
                          className={`w-full cursor-pointer border-l-4 px-4 py-2 text-left text-sm transition-colors ${
                            v.version === selected
                              ? 'border-primary-600 bg-primary-100 ring-1 ring-inset ring-primary-200'
                              : 'border-transparent hover:bg-primary-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-primary-900">v{v.version}</span>
                            <StatusBadge status={v.status} />
                          </div>
                          {v.note && (
                            <p className="truncate text-xs text-primary-700">{v.note}</p>
                          )}
                          <p className="text-xs text-primary-500">
                            {formatDateTime(v.updatedAt)}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>

            <div className="min-w-0 space-y-4">
              {!current ? (
                <p className="rounded-md border border-primary-200 bg-white p-4 text-sm text-primary-600">
                  Create a draft to start.
                </p>
              ) : (
                <>
                  <div className="space-y-3 rounded-md border border-primary-200 bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-primary-900">
                            Version {current.version}
                          </h3>
                          <StatusBadge status={current.status} />
                        </div>
                        <p className="text-xs text-primary-600">
                          {current.basedOn !== null && <>Copied from v{current.basedOn} · </>}
                          Created {formatDateTime(current.createdAt)} · Last saved{' '}
                          {formatDateTime(current.updatedAt)}
                          {current.publishedAt && (
                            <> · Last published {formatDateTime(current.publishedAt)}</>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {canPublishVersion(current.status) && (
                          <AppButton
                            variant={AppButtonVariant.Add}
                            disabled={saving || hasUnsaved || !!stale}
                            title={hasUnsaved ? 'Save the draft first' : undefined}
                            onClick={() => setPublishOpen(true)}
                          >
                            {current.status === 'archived' ? 'Publish again' : 'Publish'}
                          </AppButton>
                        )}
                        <AppButton
                          variant={AppButtonVariant.Edit}
                          disabled={saving}
                          onClick={() =>
                            openNewDraft({
                              features: current.features,
                              basedOn: current.version,
                              label: `version ${current.version}`,
                            })
                          }
                        >
                          Duplicate
                        </AppButton>
                        {editable && (
                          <AppButton
                            variant={AppButtonVariant.Delete}
                            disabled={saving}
                            onClick={() => setDeleteOpen(true)}
                          >
                            Delete
                          </AppButton>
                        )}
                      </div>
                    </div>

                    {editable ? (
                      <label className="block text-sm text-primary-800">
                        Note
                        <input
                          type="text"
                          value={note}
                          maxLength={200}
                          disabled={saving}
                          onChange={(e) => setNoteEdit(e.target.value)}
                          placeholder="What this version is for"
                          className="mt-1 w-full rounded-md border border-primary-300 px-3 py-2 text-sm"
                        />
                      </label>
                    ) : (
                      current.note && <p className="text-sm text-primary-800">{current.note}</p>
                    )}

                    {!editable && (
                      <p className="text-xs text-primary-600">
                        {isPublished
                          ? 'This is what users get now.'
                          : 'Archived versions are read-only.'}{' '}
                        Duplicate it to make changes.
                      </p>
                    )}
                    {!isPublished && published.exists && (
                      <p className="text-xs text-primary-600">
                        {Object.keys(vsPublished).length === 0
                          ? `Same features as the published version ${published.version}.`
                          : `${Object.keys(vsPublished).length} feature(s) differ from the published version ${published.version}.`}
                      </p>
                    )}
                  </div>

                  {unsetKeys.length > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      This version has no on/off value for:{' '}
                      <strong>{listLabels(unsetKeys)}</strong>. The app treats them as
                      off.{' '}
                      {editable
                        ? 'Toggle them to set a value.'
                        : 'Duplicate this version to set them.'}
                    </div>
                  )}

                  {unknownKeys.length > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      This version has feature keys this dashboard doesn&apos;t know:{' '}
                      <code>{unknownKeys.join(', ')}</code>. They are kept as they are.
                      Add them to <code>src/lib/featureKeys.ts</code> to manage them here.
                    </div>
                  )}

                  {FEATURE_GROUPS.map((group) => {
                    const features = FEATURES.filter((f) => f.group === group.key);
                    if (features.length === 0) return null;
                    return (
                      <section
                        key={group.key}
                        className="overflow-hidden rounded-md border border-primary-200 bg-white"
                      >
                        <h3 className="border-b border-primary-100 px-4 py-2 text-sm font-semibold text-primary-800">
                          {group.label}{' '}
                          <span className="font-normal text-primary-600">· {group.labelAm}</span>
                        </h3>
                        {/*
                          Two columns on wide screens. Each row draws its own bottom
                          border (and a right border in the left column); `-mb-px`
                          tucks the last row's border under the section's edge.
                        */}
                        <ul className="-mb-px grid xl:grid-cols-2">
                          {features.map((feature) => {
                            const key = feature.key as FeatureKey;
                            const change = unsaved[key];
                            const differs = !isPublished && published.exists && vsPublished[key];
                            const violation = violations.find((v) => v.key === key);
                            return (
                              <li
                                key={key}
                                className={`flex items-start gap-4 border-b border-primary-100 px-4 py-3 xl:odd:border-r ${
                                  change ? 'bg-amber-50' : ''
                                }`}
                              >
                                <div className="pt-0.5">
                                  <Switch
                                    checked={isOn(draft, key)}
                                    label={feature.label}
                                    disabled={saving || !editable}
                                    onChange={(next) => handleToggle(key, next)}
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="font-medium text-primary-900">
                                      {feature.label}
                                    </span>
                                    <span className="text-sm text-primary-600">
                                      {feature.labelAm}
                                    </span>
                                    <code className="text-xs text-primary-500">{key}</code>
                                    {change && (
                                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                        Unsaved: <ChangeText change={change} />
                                      </span>
                                    )}
                                    {differs && (
                                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                                        Published: {stateText(differs.from)}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-primary-700">{feature.description}</p>
                                  {feature.dependsOn.length > 0 && (
                                    <p className="mt-1 text-xs text-primary-600">
                                      Requires: {listLabels(feature.dependsOn)}
                                    </p>
                                  )}
                                  {violation && (
                                    <p className="mt-1 text-xs font-medium text-red-700">
                                      On, but {listLabels(violation.missing)}{' '}
                                      {violation.missing.length === 1 ? 'is' : 'are'} off, so
                                      it won&apos;t work in the app.
                                    </p>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )
      )}

      <section className="rounded-md border border-primary-200 bg-white">
        <h3 className="border-b border-primary-100 px-4 py-2 text-sm font-semibold text-primary-800">
          Publish history
        </h3>
        {historyStatus === 'failed' ? (
          <p className="px-4 py-3 text-sm text-red-700">Could not load the publish history.</p>
        ) : history.length === 0 ? (
          <p className="px-4 py-3 text-sm text-primary-600">
            {historyStatus === 'loading' ? 'Loading…' : 'Nothing published yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-primary-100">
            {history.map((entry) => (
              <li key={entry.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 text-primary-700">
                  <span className="font-semibold text-primary-900">
                    {entry.fromVersion !== null ? `v${entry.fromVersion} → ` : ''}v
                    {entry.version}
                  </span>
                  <span>{formatDateTime(entry.publishedAt)}</span>
                  <span className="break-all text-xs text-primary-600">
                    by {entry.publishedBy || 'unknown'}
                  </span>
                </div>
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-primary-800">
                  {Object.entries(entry.changed).map(([key, change]) => (
                    <li key={key}>
                      {labelOf(key)}: <ChangeText change={change} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editable && hasUnsaved && (
        <div className="sticky bottom-0 flex flex-col gap-2 rounded-md border border-primary-300 bg-white p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-primary-800">
            {unsavedCount} unsaved {unsavedCount === 1 ? 'change' : 'changes'} to draft v
            {current?.version}
            {violations.length > 0 && (
              <span className="ml-2 text-red-700">
                · {violations.length} with missing requirements
              </span>
            )}
          </span>
          <div className="flex gap-2">
            <AppButton variant={AppButtonVariant.Edit} disabled={saving} onClick={resetEdits}>
              Discard
            </AppButton>
            <AppButton
              variant={AppButtonVariant.Add}
              disabled={saving || !!stale}
              onClick={runSaveDraft}
            >
              {saving ? 'Saving…' : 'Save draft'}
            </AppButton>
          </div>
        </div>
      )}

      <AppModal
        open={pendingDisable !== null}
        type="edit"
        title={
          pendingDisable ? `Turn off ${labelOf(pendingDisable.key)}?` : 'Turn off feature?'
        }
        onClose={() => setPendingDisable(null)}
        footer={
          <>
            <AppButton
              variant={AppButtonVariant.Edit}
              onClick={() => disableWithDependents(false)}
            >
              Only {pendingDisable && labelOf(pendingDisable.key)}
            </AppButton>
            <AppButton variant={AppButtonVariant.Add} onClick={() => disableWithDependents(true)}>
              Turn off all
            </AppButton>
          </>
        }
      >
        {pendingDisable && (
          <div className="space-y-2 text-sm text-primary-800">
            <p>
              These features need {labelOf(pendingDisable.key)} and will stop working without
              it:
            </p>
            <ul className="list-disc pl-5">
              {pendingDisable.dependents.map((dep) => (
                <li key={dep}>{labelOf(dep)}</li>
              ))}
            </ul>
            <p>Turn them off as well?</p>
          </div>
        )}
      </AppModal>

      <AppModal
        open={draftSource !== null}
        type="add"
        title="New draft version"
        onClose={() => !saving && setDraftSource(null)}
        footer={
          <AppButton variant={AppButtonVariant.Add} disabled={saving} onClick={runCreateDraft}>
            {saving ? 'Creating…' : 'Create draft'}
          </AppButton>
        }
      >
        <div className="space-y-3 text-sm text-primary-800">
          <p>
            The draft starts as a copy of {draftSource?.label}. Users won&apos;t see it until
            you publish it.
          </p>
          <label className="block">
            Note (optional)
            <input
              type="text"
              value={newDraftNote}
              maxLength={200}
              onChange={(e) => setNewDraftNote(e.target.value)}
              placeholder="e.g. Turn off events during maintenance"
              className="mt-1 w-full rounded-md border border-primary-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </AppModal>

      <AppModal
        open={publishOpen}
        type="edit"
        title={current ? `Publish version ${current.version}?` : 'Publish?'}
        onClose={() => !saving && setPublishOpen(false)}
        footer={
          <AppButton variant={AppButtonVariant.Add} disabled={saving} onClick={runPublish}>
            {saving ? 'Publishing…' : 'Publish for all users'}
          </AppButton>
        }
      >
        <div className="space-y-3 text-sm text-primary-800">
          <p>
            This replaces{' '}
            {published?.exists
              ? `the published version ${published.version}`
              : 'the missing published settings'}{' '}
            for every user. Open apps pick it up within moments.
            {published?.exists && ` Version ${published.version} will be archived.`}
          </p>
          <div>
            <p className="font-medium">Changes users will get:</p>
            <ChangeList changes={vsPublished} />
          </div>
          {unsetKeys.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800">
              No value for {listLabels(unsetKeys)}, so the app will treat them as off.
            </div>
          )}
          {violations.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-red-800">
              These will be on but won&apos;t work, because something they need is off:
              <ul className="list-disc pl-5">
                {violations.map((v) => (
                  <li key={v.key}>
                    {labelOf(v.key)} (needs {listLabels(v.missing)})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </AppModal>

      <AppModal
        open={deleteOpen}
        type="edit"
        title={current ? `Delete draft version ${current.version}?` : 'Delete draft?'}
        onClose={() => !saving && setDeleteOpen(false)}
        footer={
          <AppButton variant={AppButtonVariant.Delete} disabled={saving} onClick={runDelete}>
            {saving ? 'Deleting…' : 'Delete draft'}
          </AppButton>
        }
      >
        <p className="text-sm text-primary-800">
          The draft and its unsaved changes are removed. This can&apos;t be undone.
        </p>
      </AppModal>
    </div>
  );
}
