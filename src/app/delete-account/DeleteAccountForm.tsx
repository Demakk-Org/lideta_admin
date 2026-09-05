'use client';

import { useState } from 'react';

type ContactType = 'email' | 'phone';
type Scope = 'account' | 'partial';

export default function DeleteAccountForm() {
  const [contactType, setContactType] = useState<ContactType>('email');
  const [contact, setContact] = useState('');
  const [scope, setScope] = useState<Scope>('account');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/account-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact, contactType, scope, details }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? 'Could not submit the request.');
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mt-8 rounded-md border border-primary-100 bg-white/60 p-5">
        <h2 className="font-semibold text-primary-900">Request received</h2>
        <p className="mt-2 text-sm text-primary-700">
          We will contact you on{' '}
          <strong className="break-all">{contact}</strong> to confirm the
          request is yours, then complete it within 30 days. Nothing is deleted
          until we have confirmed it with you.
        </p>
      </div>
    );
  }

  const inputClasses =
    'mt-1 w-full rounded-md border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 focus:border-primary-500 focus:outline-none';

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 space-y-5 rounded-md border border-primary-100 bg-white/60 p-5"
    >
      <fieldset>
        <legend className="text-sm font-semibold text-primary-900">
          How do you sign in?
        </legend>
        <div className="mt-2 flex gap-4 text-sm text-primary-800">
          {(['email', 'phone'] as ContactType[]).map((type) => (
            <label key={type} className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="contactType"
                value={type}
                checked={contactType === type}
                onChange={() => setContactType(type)}
              />
              {type === 'email' ? 'Email or Google account' : 'Phone number'}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="contact"
          className="text-sm font-semibold text-primary-900"
        >
          {contactType === 'email'
            ? 'Email address on the account'
            : 'Phone number on the account'}
        </label>
        <input
          id="contact"
          className={inputClasses}
          type={contactType === 'email' ? 'email' : 'tel'}
          required
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={
            contactType === 'email' ? 'you@example.com' : '+251 9xx xxx xxx'
          }
        />
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-primary-900">
          What should we delete?
        </legend>
        <div className="mt-2 space-y-2 text-sm text-primary-800">
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="scope"
              className="mt-1"
              checked={scope === 'account'}
              onChange={() => setScope('account')}
            />
            <span>My whole account and the data attached to it</span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="scope"
              className="mt-1"
              checked={scope === 'partial'}
              onChange={() => setScope('partial')}
            />
            <span>Only some of my data — I will say which below</span>
          </label>
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="details"
          className="text-sm font-semibold text-primary-900"
        >
          Anything else we should know{' '}
          <span className="font-normal text-primary-600">
            {scope === 'partial' ? '(required)' : '(optional)'}
          </span>
        </label>
        <textarea
          id="details"
          className={inputClasses}
          rows={3}
          maxLength={1000}
          required={scope === 'partial'}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="For example: also delete the messages I sent in my Bible-study group."
        />
      </div>

      {error && (
        <p className="text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex cursor-pointer items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? 'Sending…' : 'Request deletion'}
      </button>

      <p className="text-xs text-primary-600">
        We verify that the account is yours before deleting anything, so no one
        else can use this form to remove your account.
      </p>
    </form>
  );
}
