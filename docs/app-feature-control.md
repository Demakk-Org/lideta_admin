# App feature control

The mobile app decides which features are on from **one** Firestore document.
Admins manage versions of it on the dashboard's **App features** page.

## What the app reads

`app_settings/published` (readable without sign-in):

```jsonc
{
  "features": { "news": true, "quiz": false, ... }, // missing or non-boolean = OFF
  "version": 4,              // the published version number
  "updatedAt": <Timestamp>,  // when it was published
  "publishedBy": "<uid>"     // or "script:seed-app-settings"
}
```

- In the app a feature is on only if its key is `true` **and** everything it
  `dependsOn` is on. Keys match `FeatureKey` in the app. Core parts (Bible
  reader and search, worship, account) have no key and can't be turned off.
- If the document doesn't exist, or the app has never been able to load it,
  the app treats **every feature as on**, so a missing seed or an outage
  never hides the app. It caches the last published copy and listens for
  changes, so a publish reaches open apps within moments.
- `version` is not always increasing: publishing an archived version (a
  rollback) makes an older number live again. Treat any *different* version as
  a change, not only a higher one.
- The app never reads the versions or the history.
- `app_settings/default` is the old single document. It's read-only now and
  only kept until no released app reads it.

## What admins edit (admin-only)

`app_settings/published/versions/{n}`, where the doc id is the version number:

| field | |
|---|---|
| `version` | int, same as the doc id |
| `status` | `draft` → `published` → `archived` (and `archived` → `published` again for a rollback) |
| `features` | map, same shape as above |
| `note`, `basedOn` | what it's for; which version it was copied from |
| `revision` | bumped on each draft save; catches two admins editing one draft |
| `createdBy/At`, `updatedBy/At`, `publishedBy/At` | audit |

- Only drafts can change features or be deleted.
- **Publish** is one transaction: copy the version's `features` into
  `app_settings/published`, mark it `published`, mark the previously published
  version `archived`, and append to `app_settings/published/history`.
  The rules check all of that (see `firestore.rules`), so the published doc
  can't hold features that don't match a published version.

## Seeding

```
npm run seed:app-settings -- --dry-run
npm run seed:app-settings
```

Publishes a new version when nothing is published (importing
`app_settings/default` if it exists, every other key on) or when the
published version is missing keys from `src/lib/featureKeys.ts` (added as on,
existing values untouched). Otherwise writes nothing. Drafts are left alone.
