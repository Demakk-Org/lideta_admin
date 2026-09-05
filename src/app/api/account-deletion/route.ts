import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import Logger from '@/lib/utils/logger';

type CreateDeletionRequestPayload = {
  contact: string;
  contactType: 'email' | 'phone';
  scope: 'account' | 'partial';
  details?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{6,19}$/;
const MAX_DETAILS_LENGTH = 1000;

/**
 * Public intake for the Play Store's required account-deletion request URL.
 *
 * Unauthenticated by design — Google requires the page to be reachable without
 * signing in — so a submission is only ever a *claim*. Nothing is deleted here:
 * the request lands as `pending` and an administrator verifies the requester
 * owns the contact before erasing anything.
 */
export async function POST(req: NextRequest) {
  const routeName = '[accountDeletionApi] POST';
  try {
    const body = (await req.json()) as Partial<CreateDeletionRequestPayload>;

    const contact = String(body.contact ?? '').trim();
    const contactType = body.contactType === 'phone' ? 'phone' : 'email';
    const scope = body.scope === 'partial' ? 'partial' : 'account';
    const details = String(body.details ?? '').trim();

    const isValidContact =
      contactType === 'email'
        ? EMAIL_PATTERN.test(contact)
        : PHONE_PATTERN.test(contact);

    if (!isValidContact) {
      Logger.error(routeName, 'Invalid contact', { contactType });
      return NextResponse.json(
        { error: 'Enter a valid email address or phone number.' },
        { status: 400 },
      );
    }

    if (details.length > MAX_DETAILS_LENGTH) {
      return NextResponse.json(
        { error: 'The details are too long.' },
        { status: 400 },
      );
    }

    if (scope === 'partial' && details.length === 0) {
      return NextResponse.json(
        { error: 'Say which data you want removed.' },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const ref = await adminDb.collection('deletion_requests').add({
      contact,
      contactType,
      scope,
      details: details.length > 0 ? details : null,
      status: 'pending',
      source: 'web',
      createdAt: now,
      updatedAt: now,
    });

    Logger.info(routeName, 'Deletion request recorded', {
      id: ref.id,
      contactType,
      scope,
    });

    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    Logger.error(routeName, 'Failed to record deletion request', {
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Could not submit the request. Please try again.' },
      { status: 500 },
    );
  }
}
