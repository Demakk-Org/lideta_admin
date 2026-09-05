import type { Metadata } from 'next';
import DeleteAccountForm from './DeleteAccountForm';

export const metadata: Metadata = {
  title: 'Delete your LMY Church account',
  description:
    'Request deletion of your LMY Church account and the data associated with it.',
};

/**
 * The public account-deletion request page. Google Play requires this URL to be
 * reachable without signing in, so it sits outside `/dashboard` and outside the
 * middleware matcher.
 */
export default function DeleteAccountPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="text-xs font-semibold tracking-widest text-primary-600 uppercase">
        Lideta Mekaneyesus Church
      </p>
      <h1 className="mt-2 text-3xl font-bold text-primary-900">
        Delete your account and data
      </h1>
      <p className="mt-3 text-sm text-primary-700">
        This form asks us to delete your <strong>LMY Church</strong> account and
        the data attached to it. There is no charge and you do not need to give
        a reason. We confirm your request within 7 days and complete it within
        30 days.
      </p>

      <DeleteAccountForm />

      <section className="mt-10 space-y-4 text-sm text-primary-700">
        <div>
          <h2 className="font-semibold text-primary-900">What is deleted</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              Your sign-in account — email address, Google link or phone number.
            </li>
            <li>
              Your profile: name, profile and cover photos, date of birth,
              gender, language and theme.
            </li>
            <li>
              Your saved activity: bookmarks and highlights, daily-verse reads
              and reading streak, quiz attempts and scores.
            </li>
            <li>
              Your Bible-study group memberships, join requests and blocked
              list.
            </li>
            <li>Your notification tokens, so the app stops sending to you.</li>
          </ul>
        </div>
        <div>
          <h2 className="font-semibold text-primary-900">
            What may be kept, and for how long
          </h2>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              Messages you sent in a Bible-study group. On request we delete
              them; otherwise we may keep the text with your name removed, so
              the conversation stays readable to the other members. Say which
              you prefer in the box above.
            </li>
            <li>Records we are required by law to keep.</li>
            <li>Encrypted backups, which expire within 90 days.</li>
            <li>
              Crash and analytics records, which are not linked to your name and
              expire on Firebase&apos;s own schedule.
            </li>
          </ul>
        </div>
        <div>
          <h2 className="font-semibold text-primary-900">Guest accounts</h2>
          <p className="mt-1">
            If you use the app as a guest, we hold no name, email or phone
            number about you. Uninstalling the app ends the guest session.
          </p>
        </div>
        <p className="border-t border-primary-100 pt-4">
          Prefer email? Write to{' '}
          <a
            className="font-medium underline"
            href="mailto:melkatole1@gmail.com?subject=LMY%20Church%20account%20deletion%20request"
          >
            melkatole1@gmail.com
          </a>{' '}
          from the address on the account. See also our{' '}
          <a
            className="font-medium underline"
            href="https://melka1.github.io/lideta-church-policy/privacy.html"
          >
            Privacy Policy
          </a>
          .
        </p>
      </section>
    </main>
  );
}
