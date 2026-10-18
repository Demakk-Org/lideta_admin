'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAppDispatch, useAppSelector } from '@/lib/redux/store';
import {
  fetchAboutPage,
  publishAboutPage,
  saveAboutPageDraft,
} from '@/lib/redux/features/aboutPageSlice';
import { useAuthReady } from '@/lib/hooks/useAuthReady';
import AppButton, { AppButtonVariant } from '@/components/ui/AppButton';
import AppModal from '@/components/ui/AppModal';
import ConfirmDeleteModal from '@/components/ui/ConfirmDeleteModal';
import FileUploadButton from '@/components/ui/FileUploadButton';
import LocaleTabs from '@/components/ui/LocaleTabs';
import { CONTENT_LOCALE_LABELS } from '@/lib/i18n/contentLocales';
import type { ContentLocale } from '@/lib/i18n/contentLocales';
import { uploadAboutPageLogo } from '@/lib/api/storage';
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  clearAboutLocale,
  contentOf,
  countMissing,
  emptyAboutPageContent,
  newItemId,
  parseMapsLocation,
  sameAboutContent,
  validateAboutPage,
} from '@/lib/api/aboutPage';
import type {
  AboutPageContent,
  Belief,
  HistoryEntry,
  Service,
  SocialLink,
  SocialPlatform,
} from '@/lib/api/aboutPage';
import {
  ItemList,
  LocaleContext,
  LocalizedInput,
  Section,
  inputClass,
} from './_components/fields';
import AboutPagePreview from './_components/AboutPagePreview';

/** Coordinates are typed as text and parsed on the way out, so "9." can be typed. */
type CoordText = { lat: string; lng: string };

function coordText(content: AboutPageContent): CoordText {
  return {
    lat: content.visit.lat === null ? '' : String(content.visit.lat),
    lng: content.visit.lng === null ? '' : String(content.visit.lng),
  };
}

function parseCoord(text: string): number | null {
  return text.trim() === '' ? null : Number(text.trim());
}

function formatDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : '—';
}

/**
 * The About page is one document, so this route *is* the form: it opens on
 * the saved draft (or an empty page before anything is saved), and Save
 * draft writes the whole thing. There is no list, create or delete.
 */
export default function AboutPageClient() {
  const dispatch = useAppDispatch();
  const { draft, published, status, saving, error } = useAppSelector(
    (s) => s.aboutPage,
  );
  const { ready, uid } = useAuthReady();

  const [form, setForm] = useState<AboutPageContent | null>(null);
  const [coords, setCoords] = useState<CoordText>({ lat: '', lng: '' });
  const [languages, setLanguages] = useState<ContentLocale[]>([]);
  const [active, setActive] = useState<ContentLocale>('am');
  const [removingLocale, setRemovingLocale] = useState<ContentLocale | null>(null);
  const [mapsLink, setMapsLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  useEffect(() => {
    if (ready && uid) dispatch(fetchAboutPage());
  }, [dispatch, ready, uid]);

  // Fill the form once, from the draft or an empty page.
  useEffect(() => {
    if (status !== 'succeeded' || form) return;
    const initial = draft ? contentOf(draft) : emptyAboutPageContent();
    setForm(initial);
    setCoords(coordText(initial));
    setLanguages(
      draft?.availableLanguages.length
        ? draft.availableLanguages
        : [initial.defaultLanguage],
    );
    setActive(initial.defaultLanguage);
  }, [status, draft, form]);

  /** The form as it would be saved, coordinates included. */
  const content = useMemo<AboutPageContent | null>(
    () =>
      form && {
        ...form,
        visit: {
          ...form.visit,
          lat: parseCoord(coords.lat),
          lng: parseCoord(coords.lng),
        },
      },
    [form, coords],
  );

  const saved = useMemo(
    () => (draft ? contentOf(draft) : emptyAboutPageContent()),
    [draft],
  );
  const dirty = !!content && !sameAboutContent(content, saved);
  const draftDiffers =
    !!draft && (!published || !sameAboutContent(contentOf(draft), contentOf(published)));

  // Warn before leaving with unsaved edits: closing the tab, and in-app links.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest('a[href]');
      if (!a || a.getAttribute('target') === '_blank') return;
      if (!window.confirm('You have unsaved changes on the About page. Leave anyway?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  if (!ready || status === 'idle' || status === 'loading' || (status === 'succeeded' && !form)) {
    return <div className="py-12 text-center text-primary-600">Loading…</div>;
  }
  if (status === 'failed' || !form || !content) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        Could not load the About page: {error}
      </div>
    );
  }

  const primary = form.defaultLanguage;
  const isPrimaryTab = active === primary;
  // Functional updates: the logo upload patches after an await, and must not
  // overwrite edits made while it ran.
  const patch = (p: Partial<AboutPageContent>) =>
    setForm((prev) => prev && { ...prev, ...p });
  const patchVisit = (p: Partial<AboutPageContent['visit']>) =>
    setForm((prev) => prev && { ...prev, visit: { ...prev.visit, ...p } });

  const missing = languages
    .filter((l) => l !== primary)
    .map((l) => ({ locale: l, count: countMissing(content, l) }))
    .filter((m) => m.count > 0);

  const addLanguage = (locale: ContentLocale) => {
    setLanguages((prev) => [...prev, locale]);
    setActive(locale);
  };

  const removeLanguage = () => {
    if (!removingLocale) return;
    const locale = removingLocale;
    setForm((prev) => prev && clearAboutLocale(prev, locale));
    setLanguages((prev) => prev.filter((l) => l !== removingLocale));
    setActive(primary);
    setRemovingLocale(null);
  };

  const applyMapsLink = () => {
    const found = parseMapsLocation(mapsLink);
    if (!found) {
      toast.error('No coordinates found in that link.');
      return;
    }
    setCoords({ lat: String(found.lat), lng: String(found.lng) });
    setMapsLink('');
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      patch({ logoUrl: await uploadAboutPageLogo(file) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!uid) return;
    const errors = validateAboutPage(content);
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    try {
      const doc = await dispatch(saveAboutPageDraft({ content, uid })).unwrap();
      // Keep editing what was saved (trimmed), without a reload.
      const next = contentOf(doc);
      setForm(next);
      setCoords(coordText(next));
      toast.success('Draft saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    }
  };

  // Publish copies what is *saved*, so unsaved edits must be saved first.
  const canPublish = !!draft && !dirty && draftDiffers && !saving && !uploading;
  const publishHint = !draft
    ? 'Save a draft first'
    : dirty
      ? 'Save your changes first'
      : !draftDiffers
        ? 'The draft is already published'
        : undefined;
  const draftMissing = draft
    ? draft.availableLanguages
        .filter((l) => l !== draft.defaultLanguage)
        .map((l) => ({ locale: l, count: countMissing(contentOf(draft), l) }))
        .filter((m) => m.count > 0)
    : [];

  const publish = async () => {
    if (!uid) return;
    try {
      await dispatch(publishAboutPage({ uid })).unwrap();
      setPublishOpen(false);
      toast.success('Published. The app now shows this version.');
    } catch (err) {
      setPublishOpen(false);
      toast.error(err instanceof Error ? err.message : 'Publish failed');
    }
  };

  return (
    <LocaleContext.Provider value={{ active, primary }}>
      <div className="space-y-6 pb-24">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-primary-800">About page</h2>
            <p className="text-sm text-primary-700">
              The &ldquo;About the church&rdquo; screen in the app. Edits are saved
              to a draft; the app keeps showing the published version.
            </p>
            <p className="mt-1 text-xs text-primary-600">
              Draft saved: {formatDateTime(draft?.updatedAt ?? null)} · Published:{' '}
              {formatDateTime(published?.publishedAt ?? published?.updatedAt ?? null)}
              {draft && (
                <span className={draftDiffers ? 'text-amber-700' : 'text-emerald-700'}>
                  {' · '}
                  {!published
                    ? 'Not published yet'
                    : draftDiffers
                      ? '● Draft differs from published'
                      : 'Draft matches published'}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <AppButton
              type="button"
              variant={AppButtonVariant.Edit}
              onClick={() => setShowPreview((v) => !v)}
            >
              {showPreview ? 'Hide preview' : 'Preview'}
            </AppButton>
            <AppButton
              type="button"
              variant={AppButtonVariant.Add}
              onClick={save}
              disabled={!dirty || saving || uploading}
            >
              {saving ? 'Saving…' : 'Save draft'}
            </AppButton>
            <span title={publishHint}>
              <AppButton
                type="button"
                variant={AppButtonVariant.Add}
                onClick={() => setPublishOpen(true)}
                disabled={!canPublish}
              >
                Publish
              </AppButton>
            </span>
          </div>
        </div>

        {!draft && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Nothing is saved yet. Fill in the page and press Save draft.
          </div>
        )}

        <div>
          <LocaleTabs
            languages={languages}
            active={active}
            defaultLanguage={primary}
            onChange={setActive}
            onAdd={addLanguage}
            onRemove={setRemovingLocale}
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {!isPrimaryTab && (
              <span className="text-primary-600">
                Translating. Items are added, removed and reordered on the{' '}
                {CONTENT_LOCALE_LABELS[primary]} tab.
              </span>
            )}
            {missing.map((m) => (
              <button
                key={m.locale}
                type="button"
                onClick={() => setActive(m.locale)}
                className="text-amber-700 hover:underline"
              >
                Missing in {CONTENT_LOCALE_LABELS[m.locale]}: {m.count}{' '}
                {m.count === 1 ? 'field' : 'fields'}
              </button>
            ))}
          </div>
        </div>

        <div className={showPreview ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_480px]' : ''}>
          <div className="space-y-6">
            <Section title="Header">
              <LocalizedInput
                label="Church name"
                value={form.churchName}
                onChange={(churchName) => patch({ churchName })}
                required
              />
              <LocalizedInput
                label="Tagline"
                value={form.tagline}
                onChange={(tagline) => patch({ tagline })}
              />
              <div>
                <span className="block text-sm font-medium text-primary-800">Logo</span>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  {form.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logoUrl} alt="Logo" className="h-14 w-14 rounded-full border border-primary-200 object-cover" />
                  ) : (
                    <span className="text-xs text-primary-600">
                      None — the app shows its bundled logo.
                    </span>
                  )}
                  {isPrimaryTab && (
                    <>
                      <FileUploadButton
                        label={uploading ? 'Uploading…' : form.logoUrl ? 'Replace' : 'Upload'}
                        accept="image/*"
                        onSelect={uploadLogo}
                        disabled={uploading}
                        variant={AppButtonVariant.Edit}
                      />
                      {form.logoUrl && (
                        <button
                          type="button"
                          onClick={() => patch({ logoUrl: '' })}
                          className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Section>

            <Section title="Who we are">
              <LocalizedInput
                label="Introduction"
                value={form.intro}
                onChange={(intro) => patch({ intro })}
                rows={5}
              />
            </Section>

            <Section title="Our story" description="Timeline, top to bottom as shown in the app.">
              <ItemList<HistoryEntry>
                items={form.history}
                onChange={(history) => patch({ history })}
                newItem={() => ({ id: newItemId(), period: {}, title: {}, text: {} })}
                addLabel="Add entry"
                itemLabel="Entry"
                emptyText="No timeline entries. The app hides this block."
                renderItem={(h, update) => (
                  <>
                    <LocalizedInput
                      label="Period"
                      value={h.period}
                      onChange={(period) => update({ period })}
                      placeholder="1961, 1960s–70s, Today"
                    />
                    <LocalizedInput label="Title" value={h.title} onChange={(title) => update({ title })} required />
                    <LocalizedInput label="Text" value={h.text} onChange={(text) => update({ text })} rows={2} />
                  </>
                )}
              />
            </Section>

            <Section title="What we believe">
              <ItemList<Belief>
                items={form.beliefs}
                onChange={(beliefs) => patch({ beliefs })}
                newItem={() => ({ id: newItemId(), title: {}, text: {} })}
                addLabel="Add belief"
                itemLabel="Belief"
                emptyText="No beliefs. The app hides this block."
                renderItem={(b, update) => (
                  <>
                    <LocalizedInput label="Title" value={b.title} onChange={(title) => update({ title })} required />
                    <LocalizedInput label="Text" value={b.text} onChange={(text) => update({ text })} rows={2} />
                  </>
                )}
              />
            </Section>

            <Section title="Visit us">
              <LocalizedInput
                label="Address"
                value={form.visit.address}
                onChange={(address) => patchVisit({ address })}
              />
              <LocalizedInput
                label="Landmark"
                value={form.visit.landmark}
                onChange={(landmark) => patchVisit({ landmark })}
              />
              <div>
                <span className="block text-sm font-medium text-primary-800">Map location</span>
                {isPrimaryTab ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={coords.lat}
                        onChange={(e) => setCoords({ ...coords, lat: e.target.value })}
                        placeholder="Latitude, e.g. 9.015889"
                        aria-label="Latitude"
                        className={inputClass}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={coords.lng}
                        onChange={(e) => setCoords({ ...coords, lng: e.target.value })}
                        placeholder="Longitude, e.g. 38.742278"
                        aria-label="Longitude"
                        className={inputClass}
                      />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={mapsLink}
                        onChange={(e) => setMapsLink(e.target.value)}
                        placeholder="…or paste a Google Maps link"
                        aria-label="Google Maps link"
                        className={`${inputClass} mt-0`}
                      />
                      <AppButton
                        type="button"
                        variant={AppButtonVariant.Edit}
                        className="shrink-0 px-3 py-1.5 text-xs"
                        onClick={applyMapsLink}
                        disabled={!mapsLink.trim()}
                      >
                        Use link
                      </AppButton>
                    </div>
                    <p className="mt-1 text-xs text-primary-600">
                      Leave both empty to hide &ldquo;Open in Maps&rdquo;.
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-primary-700">
                    {coords.lat && coords.lng ? `${coords.lat}, ${coords.lng}` : 'Not set'}
                  </p>
                )}
              </div>

              <div>
                <span className="mb-2 block text-sm font-medium text-primary-800">Services</span>
                <ItemList<Service>
                  items={form.services}
                  onChange={(services) => patch({ services })}
                  newItem={() => ({ id: newItemId(), name: {}, time: {} })}
                  addLabel="Add service"
                  itemLabel="Service"
                  emptyText="No services listed."
                  renderItem={(s, update) => (
                    <>
                      <LocalizedInput
                        label="Name"
                        value={s.name}
                        onChange={(name) => update({ name })}
                        placeholder="Sunday worship"
                        required
                      />
                      <LocalizedInput
                        label="Time"
                        value={s.time}
                        onChange={(time) => update({ time })}
                        placeholder="Free text; Amharic uses Ethiopian clock time"
                      />
                    </>
                  )}
                />
              </div>
            </Section>

            <Section title="Follow us" description="Links are the same in every language.">
              <ItemList<SocialLink>
                items={form.links}
                onChange={(links) => patch({ links })}
                newItem={() => ({ id: newItemId(), platform: 'facebook', url: '' })}
                addLabel="Add link"
                itemLabel="Link"
                emptyText="No links. The app hides this block."
                renderItem={(l, update) =>
                  isPrimaryTab ? (
                    <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                      <select
                        value={l.platform}
                        onChange={(e) => update({ platform: e.target.value as SocialPlatform })}
                        aria-label="Platform"
                        className={inputClass}
                      >
                        {SOCIAL_PLATFORMS.map((p) => (
                          <option key={p} value={p}>
                            {SOCIAL_PLATFORM_LABELS[p]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="url"
                        value={l.url}
                        onChange={(e) => update({ url: e.target.value })}
                        placeholder={l.platform === 'telegram' ? 'https://t.me/…' : 'https://…'}
                        aria-label="URL"
                        className={inputClass}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-primary-700">
                      {SOCIAL_PLATFORM_LABELS[l.platform]} · {l.url || '—'}
                    </p>
                  )
                }
              />
            </Section>
          </div>

          {showPreview && (
            <div className="xl:sticky xl:top-4 xl:self-start">
              <AboutPagePreview content={content} locale={active} />
            </div>
          )}
        </div>

        <AppModal
          open={publishOpen}
          type="edit"
          title="Publish the About page?"
          onClose={() => !saving && setPublishOpen(false)}
          footer={
            <AppButton variant={AppButtonVariant.Add} disabled={saving} onClick={publish}>
              {saving ? 'Publishing…' : 'Publish for all users'}
            </AppButton>
          }
        >
          <div className="space-y-3 text-sm text-primary-800">
            <p>
              This changes the About page for every app user. The saved draft
              {draft?.updatedAt ? ` (${formatDateTime(draft.updatedAt)})` : ''} replaces
              what the app shows now.
            </p>
            {draftMissing.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800">
                {draftMissing.map((m) => (
                  <p key={m.locale}>
                    {m.count} {m.count === 1 ? 'field' : 'fields'} in{' '}
                    {CONTENT_LOCALE_LABELS[m.locale]} will show{' '}
                    {CONTENT_LOCALE_LABELS[primary]} instead.
                  </p>
                ))}
              </div>
            )}
          </div>
        </AppModal>

        <ConfirmDeleteModal
          open={removingLocale !== null}
          title={
            removingLocale
              ? `Remove ${CONTENT_LOCALE_LABELS[removingLocale]}? Its text is cleared from every field.`
              : undefined
          }
          confirmLabel="Remove language"
          onCancel={() => setRemovingLocale(null)}
          onConfirm={removeLanguage}
        />
      </div>
    </LocaleContext.Provider>
  );
}
