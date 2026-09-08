"use client";

import { useState } from "react";
import {
  CONTENT_LOCALES,
  CONTENT_LOCALE_LABELS,
} from "@/lib/i18n/contentLocales";
import type { ContentLocale } from "@/lib/i18n/contentLocales";

/**
 * Language tabs for a document, plus the `+` that adds one.
 *
 * A document starts in one language and gains others deliberately — creating
 * a course is not a translation task. So the strip shows only the languages
 * this document actually has; everything else lives behind the `+`.
 *
 * The primary language cannot be removed: it is the fallback every other
 * language resolves to.
 */
export default function LocaleTabs({
  languages,
  active,
  defaultLanguage,
  onChange,
  onAdd,
  onRemove,
  className = "",
}: {
  /** Languages the document currently carries, in `en → am → om` order. */
  languages: ContentLocale[];
  active: ContentLocale;
  defaultLanguage: ContentLocale;
  onChange: (locale: ContentLocale) => void;
  onAdd: (locale: ContentLocale) => void;
  onRemove: (locale: ContentLocale) => void;
  className?: string;
}) {
  const [picking, setPicking] = useState(false);
  const addable = CONTENT_LOCALES.filter((l) => !languages.includes(l));

  return (
    <div className={`relative ${className}`}>
      <div
        role="tablist"
        aria-label="Content language"
        className="flex flex-wrap items-end gap-1 border-b border-primary-200"
      >
        {languages.map((locale) => {
          const selected = locale === active;
          const isPrimary = locale === defaultLanguage;
          return (
            <div key={locale} className="-mb-px flex items-center">
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onChange(locale)}
                className={`flex items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-1.5 text-sm ${
                  selected
                    ? "border-primary-300 bg-white font-medium text-primary-900"
                    : "border-transparent text-primary-600 hover:text-primary-900"
                }`}
              >
                {CONTENT_LOCALE_LABELS[locale]}
                {isPrimary && (
                  <span
                    title="Primary language — what a member falls back to"
                    className="rounded bg-primary-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary-700"
                  >
                    primary
                  </span>
                )}
                {selected && !isPrimary && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${CONTENT_LOCALE_LABELS[locale]}`}
                    title={`Remove ${CONTENT_LOCALE_LABELS[locale]}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(locale);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        onRemove(locale);
                      }
                    }}
                    className="rounded px-1 text-primary-500 hover:bg-red-50 hover:text-red-700"
                  >
                    ×
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {addable.length > 0 && (
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
            aria-label="Add a language"
            title="Add a language"
            className="-mb-px rounded-t-md border border-b-0 border-transparent px-3 py-1.5 text-sm font-semibold text-primary-600 hover:bg-primary-50 hover:text-primary-900"
          >
            ＋
          </button>
        )}
      </div>

      {picking && addable.length > 0 && (
        <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-md border border-primary-200 bg-white shadow-lg">
          {addable.map((locale) => (
            <button
              key={locale}
              type="button"
              onClick={() => {
                onAdd(locale);
                setPicking(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-primary-800 hover:bg-primary-50"
            >
              {CONTENT_LOCALE_LABELS[locale]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The chips a list view shows, with a `+` that jumps straight into the editor
 * on a new language. Read-only counterpart to {@link LocaleTabs}.
 */
export function LocaleChips({
  languages,
  defaultLanguage,
  onAdd,
  className = "",
}: {
  languages: ContentLocale[];
  defaultLanguage?: ContentLocale;
  /** Omitted when the caller has nowhere to open. */
  onAdd?: (locale: ContentLocale) => void;
  className?: string;
}) {
  const [picking, setPicking] = useState(false);
  const addable = CONTENT_LOCALES.filter((l) => !languages.includes(l));

  return (
    <span className={`relative inline-flex flex-wrap items-center gap-1 ${className}`}>
      {languages.map((locale) => (
        <span
          key={locale}
          title={`${CONTENT_LOCALE_LABELS[locale]}${
            locale === defaultLanguage ? " (primary)" : ""
          }`}
          className={`inline-block rounded px-2 py-0.5 text-[11px] ${
            locale === defaultLanguage
              ? "bg-primary-200 font-medium text-primary-800"
              : "bg-primary-50 text-primary-700"
          }`}
        >
          {CONTENT_LOCALE_LABELS[locale]}
        </span>
      ))}

      {onAdd && addable.length > 0 && (
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          aria-label="Add a language"
          title="Add a language"
          className="inline-flex h-5 w-5 items-center justify-center rounded border border-dashed border-primary-400 text-[11px] font-semibold leading-none text-primary-600 hover:border-primary-600 hover:bg-primary-50 hover:text-primary-900"
        >
          +
        </button>
      )}

      {picking && onAdd && (
        <span className="absolute left-0 top-6 z-10 w-44 overflow-hidden rounded-md border border-primary-200 bg-white shadow-lg">
          {addable.map((locale) => (
            <button
              key={locale}
              type="button"
              onClick={() => {
                onAdd(locale);
                setPicking(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-primary-800 hover:bg-primary-50"
            >
              Add {CONTENT_LOCALE_LABELS[locale]}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
