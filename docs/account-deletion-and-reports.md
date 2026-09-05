# Account deletion requests & content reports

Two administrator queues, plus the public form that feeds the first one.

## Public deletion form — `/delete-account`

Google Play requires a **publicly reachable** URL where a user can ask for their
account and data to be deleted, without signing in. That is
`https://lideta-admin.vercel.app/delete-account`, and it is the URL to paste
into **Play Console → App content → Data deletion**.

The page is outside `/dashboard` and outside the `middleware.ts` matcher, so it
is served to anyone. `POST /api/account-deletion` validates the contact and
writes a `deletion_requests` document with `status: 'pending'`.

**Nothing is deleted by submitting the form.** An unauthenticated form can only
carry a *claim* that the submitter owns an address, so the request is recorded
and an administrator verifies ownership before anything is erased. That is why
the delete endpoint refuses to act on a request still marked `pending`.

## `deletion_requests` documents

```
{ contact, contactType: 'email'|'phone', scope: 'account'|'partial', details,
  status: 'pending'|'verified'|'completed'|'rejected', source: 'web',
  createdAt, updatedAt, handledBy, resolutionNote, deletedUid }
```

Dashboard → **Deletion Requests**:

1. **Pending** — contact the requester and confirm the account is theirs.
   Then *Mark verified*, or *Reject* if you cannot confirm it.
2. **Verified** — *Delete account* calls `DELETE /api/account-deletion/[id]`,
   which resolves the Firebase Auth uid from the contact, deletes the
   `users/{uid}` document and its subcollections, deletes the Auth user, and
   closes the request as `completed` with the uid it removed.
3. If no account matches the contact any more, the request still closes as
   `completed`, with a note saying so.

Group messages are **not** removed by this flow. When a requester asks for their
messages to be deleted too (they are prompted to say so on the form), do it from
the Reports queue or the Firebase console, then note it on the request.

## `reports` documents

Written by the mobile app when a member reports a chat message — see
`MODERATION.md` in the app repository. Fields mirror `ContentReport.toJson`,
including a `contentSnapshot` copied at report time so the evidence survives the
sender deleting the message.

Dashboard → **Reports**, on a pending report:

- **Delete message** — `DELETE /api/reports/[id]/message` removes the message
  itself and marks the report `reviewed`. The report is kept, so the record of
  what was removed survives.
- **Keep** — marks it `reviewed` with no action taken.
- **Dismiss** — marks it `dismissed`.

## Authorization

`middleware.ts` only checks that a `token` cookie is *present*, and it does not
run on `/api` at all. Both destructive routes therefore call
`requireAdmin()` (`src/lib/server/requireAdmin.ts`), which verifies the ID
token's signature with the admin SDK and checks the caller's own `users/{uid}`
document carries `role: 'ADMIN'`. Do not add a route that deletes data without
it.

## Firestore rules to deploy

```
// Only the intake API (admin SDK) writes these; only admins read them.
match /deletion_requests/{id} {
  allow read, write: if isAdmin();
}
```

The admin SDK bypasses rules, so the public form keeps working with the rule
above closed to clients. The `reports` rules ship with the app change; see
`MODERATION.md`.

## Known gap

Verification is manual — an administrator emails or calls the requester. If the
volume grows, the natural next step is an emailed confirmation link that flips a
request from `pending` to `verified` without a human in the loop.
