'use client';

import { useState } from 'react';
import DevicePreviewSelector, {
  DEFAULT_PREVIEW_DEVICE,
  previewWidthClass,
} from '@/components/ui/DevicePreviewSelector';
import type { PreviewDevice } from '@/components/ui/DevicePreviewSelector';
import { CONTENT_LOCALE_LABELS } from '@/lib/i18n/contentLocales';
import type { ContentLocale } from '@/lib/i18n/contentLocales';
import { resolveLocalized } from '@/lib/i18n/localizedText';
import type { LocalizedText } from '@/lib/i18n/localizedText';
import { SOCIAL_PLATFORM_LABELS } from '@/lib/api/aboutPage';
import type { AboutPageContent } from '@/lib/api/aboutPage';

/**
 * Roughly what the app renders, in one language, with the app's fallback
 * (selected → primary → English → anything). Headings are the app's own
 * chrome and stay in English here.
 */
export default function AboutPagePreview({
  content,
  locale,
}: {
  content: AboutPageContent;
  locale: ContentLocale;
}) {
  const [device, setDevice] = useState<PreviewDevice>(DEFAULT_PREVIEW_DEVICE);
  const t = (value: LocalizedText) =>
    resolveLocalized(value, {
      selected: locale,
      defaultLanguage: content.defaultLanguage,
    }).value;

  const history = content.history.filter((h) => t(h.title));
  const beliefs = content.beliefs.filter((b) => t(b.title));
  const services = content.services.filter((s) => t(s.name));
  const hasMap = content.visit.lat !== null && content.visit.lng !== null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-primary-600">
          Preview in {CONTENT_LOCALE_LABELS[locale]}
        </span>
        <DevicePreviewSelector value={device} onChange={setDevice} />
      </div>

      <div
        className={`mx-auto w-full ${previewWidthClass(device)} space-y-5 rounded-2xl border border-primary-200 bg-white p-4 text-primary-900 shadow`}
      >
        <header className="flex flex-col items-center gap-2 text-center">
          {content.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={content.logoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-[10px] text-primary-500">
              app logo
            </div>
          )}
          <h1 className="text-lg font-bold">{t(content.churchName)}</h1>
          {t(content.tagline) && (
            <p className="text-sm text-primary-600">{t(content.tagline)}</p>
          )}
        </header>

        {t(content.intro) && (
          <PreviewBlock heading="Who we are">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{t(content.intro)}</p>
          </PreviewBlock>
        )}

        {history.length > 0 && (
          <PreviewBlock heading="Our story">
            <ol className="space-y-3 border-l-2 border-primary-200 pl-4">
              {history.map((h) => (
                <li key={h.id}>
                  <div className="text-xs font-semibold text-primary-500">{t(h.period)}</div>
                  <div className="text-sm font-semibold">{t(h.title)}</div>
                  <p className="text-sm text-primary-700">{t(h.text)}</p>
                </li>
              ))}
            </ol>
          </PreviewBlock>
        )}

        {beliefs.length > 0 && (
          <PreviewBlock heading="What we believe">
            <ul className="space-y-2">
              {beliefs.map((b) => (
                <li key={b.id} className="rounded-md bg-primary-50 p-2">
                  <div className="text-sm font-semibold">{t(b.title)}</div>
                  <p className="text-sm text-primary-700">{t(b.text)}</p>
                </li>
              ))}
            </ul>
          </PreviewBlock>
        )}

        {(t(content.visit.address) || services.length > 0 || hasMap) && (
          <PreviewBlock heading="Visit us">
            <div className="space-y-1 text-sm">
              {t(content.visit.address) && <p>{t(content.visit.address)}</p>}
              {t(content.visit.landmark) && (
                <p className="text-primary-600">{t(content.visit.landmark)}</p>
              )}
              {services.map((s) => (
                <p key={s.id}>
                  <span className="font-semibold">{t(s.name)}</span> · {t(s.time)}
                </p>
              ))}
              {hasMap && (
                <a
                  href={`https://www.google.com/maps?q=${content.visit.lat},${content.visit.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block pt-1 text-sm font-semibold text-primary-700 underline"
                >
                  Open in Maps
                </a>
              )}
            </div>
          </PreviewBlock>
        )}

        {content.links.length > 0 && (
          <PreviewBlock heading="Follow us">
            <div className="flex flex-wrap gap-2">
              {content.links.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-primary-300 px-3 py-1 text-xs"
                >
                  {SOCIAL_PLATFORM_LABELS[l.platform]}
                </a>
              ))}
            </div>
          </PreviewBlock>
        )}
      </div>
    </div>
  );
}

function PreviewBlock({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-primary-700">{heading}</h2>
      {children}
    </section>
  );
}
