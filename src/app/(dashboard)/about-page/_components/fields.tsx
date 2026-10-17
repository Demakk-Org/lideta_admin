'use client';

import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { CONTENT_LOCALE_LABELS } from '@/lib/i18n/contentLocales';
import type { ContentLocale } from '@/lib/i18n/contentLocales';
import type { LocalizedText } from '@/lib/i18n/localizedText';
import AppButton, { AppButtonVariant } from '@/components/ui/AppButton';
import ConfirmDeleteModal from '@/components/ui/ConfirmDeleteModal';
import DraggableList from '@/components/ui/DraggableList';

export const inputClass =
  'mt-1 block w-full rounded-md border border-primary-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500';

/** Which language tab is open. Structure is editable only on the primary tab. */
export type LocaleState = {
  active: ContentLocale;
  primary: ContentLocale;
};

export const LocaleContext = createContext<LocaleState>({
  active: 'am',
  primary: 'am',
});

export function useLocaleState() {
  const ctx = useContext(LocaleContext);
  return { ...ctx, isPrimaryTab: ctx.active === ctx.primary };
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-primary-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-base font-semibold text-primary-900">{title}</h3>
      {description && (
        <p className="mt-0.5 text-xs text-primary-600">{description}</p>
      )}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/**
 * One translatable field, showing the active tab's language. On other tabs
 * the primary text is shown above as the thing to translate, and the input is
 * outlined amber while that translation is missing.
 */
export function LocalizedInput({
  label,
  value,
  onChange,
  rows,
  placeholder,
  required,
}: {
  label: string;
  value: LocalizedText;
  onChange: (next: LocalizedText) => void;
  rows?: number;
  placeholder?: string;
  required?: boolean;
}) {
  const { active, primary, isPrimaryTab } = useLocaleState();
  const primaryText = value[primary] ?? '';
  const missing = !isPrimaryTab && !!primaryText.trim() && !value[active]?.trim();
  const className = `${inputClass} ${
    missing ? 'border-amber-400 ring-1 ring-amber-300' : ''
  }`;
  const set = (text: string) => onChange({ ...value, [active]: text });

  return (
    <div>
      <label className="block text-sm font-medium text-primary-800">
        {label}
        {required && isPrimaryTab && <span className="text-red-600"> *</span>}
        <span className="ml-1 text-xs font-normal text-primary-500">
          ({CONTENT_LOCALE_LABELS[active]})
        </span>
      </label>
      {!isPrimaryTab && (
        <p className="mt-1 whitespace-pre-wrap rounded border border-primary-200 bg-primary-50 px-2 py-1 text-xs text-primary-700">
          {primaryText || <span className="italic text-primary-500">(empty)</span>}
        </p>
      )}
      {rows ? (
        <textarea
          value={value[active] ?? ''}
          onChange={(e) => set(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className={className}
        />
      ) : (
        <input
          type="text"
          value={value[active] ?? ''}
          onChange={(e) => set(e.target.value)}
          placeholder={placeholder}
          className={className}
        />
      )}
    </div>
  );
}

/**
 * A list whose items exist once for every language. Add, remove and reorder
 * only on the primary tab, so a translator can't drop or reorder an entry.
 */
export function ItemList<T extends { id: string }>({
  items,
  onChange,
  newItem,
  addLabel,
  itemLabel,
  emptyText,
  renderItem,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  newItem: () => T;
  addLabel: string;
  /** e.g. "entry", used in the remove confirmation. */
  itemLabel: string;
  emptyText: string;
  renderItem: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
}) {
  const { isPrimaryTab } = useLocaleState();
  const [removing, setRemoving] = useState<string | null>(null);

  const update = (id: string) => (patch: Partial<T>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const body = (item: T, index: number) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary-500">
          {itemLabel} {index + 1}
        </span>
        {isPrimaryTab && (
          <button
            type="button"
            onClick={() => setRemoving(item.id)}
            className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
          >
            Remove
          </button>
        )}
      </div>
      {renderItem(item, update(item.id))}
    </div>
  );

  const itemClass = 'rounded-md border border-primary-200 bg-primary-50/40 p-3';

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="rounded-md border border-dashed border-primary-300 p-3 text-sm text-primary-600">
          {emptyText}
        </p>
      )}

      {isPrimaryTab ? (
        <DraggableList
          items={items}
          onReorder={onChange}
          getKey={(it) => it.id}
          listClassName="space-y-3"
          itemClassName={itemClass}
          renderItem={body}
        />
      ) : (
        items.map((item, i) => (
          <div key={item.id} className={itemClass}>
            {body(item, i)}
          </div>
        ))
      )}

      {isPrimaryTab && (
        <AppButton
          type="button"
          variant={AppButtonVariant.Edit}
          className="px-3 py-1.5 text-xs"
          onClick={() => onChange([...items, newItem()])}
        >
          + {addLabel}
        </AppButton>
      )}

      <ConfirmDeleteModal
        open={removing !== null}
        title={`Remove this ${itemLabel.toLowerCase()} in every language?`}
        confirmLabel="Remove"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          onChange(items.filter((it) => it.id !== removing));
          setRemoving(null);
        }}
      />
    </div>
  );
}
