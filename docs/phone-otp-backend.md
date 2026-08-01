# Phone-OTP Authentication Backend

Phone-number OTP login/signup for the mobile app, implemented as Next.js API routes
in this admin app. We generate the code, deliver it as a localized SMS via **GeezSMS
plain-send**, verify it against **Firestore**, and return a **Firebase custom token**
the app exchanges via `signInWithCustomToken`.

Email / Google / Guest auth are handled natively by Firebase on the client and are
**not** part of this backend.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/otp/request` | Generate a code and SMS it. |
| `POST` | `/api/otp/verify` | Verify the code, return a Firebase custom token. |
| `POST` | `/api/otp/reset-verify` | Check a `purpose:"reset"` code **without consuming it** (reset screen 1). |
| `POST` | `/api/otp/reset-password` | Verify a `purpose:"reset"` code and set a new password (reset screen 2). |

All require the shared-secret header:

```
x-otp-app-secret: <OTP_REQUEST_SECRET>
```

### `POST /otp/request`

```jsonc
{
  "phoneNumber": "+251922493805",  // E.164, required
  "purpose": "auth",               // "auth" (default) | "signup" | "link" | "reset"
  "lang": "en",                    // "en" | "am" | "om" — SMS language, default "en"
  "idToken": "<firebase-id-token>" // required only when purpose == "link"
}
```

`200` → `{ "requestId", "expiresInSeconds": 300, "resendAfterSeconds": 60 }`

**Privacy:** for `purpose` `"auth"` and `"reset"`, the response is always `200`
whether or not an account exists — it never reveals account existence.

**`"auth"` vs `"signup"`.** `"auth"` is login-or-signup: if the number already has
an account, verifying signs it in; if not, the account is created. That is right for a
login screen but wrong for a signup screen, where the user would be silently logged
into an existing account. `"signup"` is the explicit create-only intent:

| purpose | Account exists for phone | Account does NOT exist |
|---|---|---|
| `auth` | sign in | create + sign in |
| `signup` | **`409 account_exists`** | create + sign in |
| `link` | see `phone_in_use` | attach phone to the signed-in account |
| `reset` | send reset code | send reset code |

The privacy rule above is intentionally relaxed for `"signup"` only: a signup form has
to tell the user their number is taken, and the same fact is obtainable by simply
attempting a login. To limit the enumeration this opens up, a rejected `signup`
request is rate-limited exactly like a successful one — the per-phone and per-IP
counters are recorded **before** the existence check, so a `409` costs the caller the
same quota as a `200` and the endpoint can't be used as a fast "is this number
registered?" oracle.

### `POST /otp/verify`

```jsonc
{
  "phoneNumber": "+251922493805",
  "code": "123456",
  "requestId": "<from /otp/request>",
  "idToken": "<firebase-id-token>"  // required only when purpose was "link"
}
```

`200` → `{ "customToken", "uid", "isNewUser", "primaryAuthMethod": "phone"|"email" }`

### `POST /otp/reset-verify`

Screen 1 of the two-step reset UI: confirm a `purpose:"reset"` code is correct
**without consuming it**, so the same code can still be redeemed by
`/otp/reset-password` on screen 2.

```jsonc
{ "phoneNumber": "+251922493805", "code": "123456", "requestId": "<from purpose:\"reset\">" }
```

`200` → `{ "valid": true }`

- Same expiry / attempt-cap / latest-wins rules as `/otp/verify`; wrong guesses still
  count toward the cap (so this is not a brute-force bypass). Only the *correct* code is
  left unspent.
- Codes not requested with `purpose:"reset"` return `otp_invalid`.
- Errors: `otp_invalid` (400), `otp_expired` (410), `too_many_attempts` (429).

### `POST /otp/reset-password`

Screen 2 — phone-based password reset (spec §17): the user proves phone ownership with
a `purpose:"reset"` code, then the backend sets the new password via the Admin SDK
and mints a custom token so the app can sign in immediately. This is the step that
**consumes** the code. (Email reset uses Firebase's native `sendPasswordResetEmail` —
backend not involved.)

```jsonc
{
  "phoneNumber": "+251922493805",
  "code": "123456",
  "requestId": "<from /otp/request with purpose:\"reset\">",
  "newPassword": "…"
}
```

`200` → `{ "customToken", "uid" }`

- Code rules are identical to `/otp/verify` (5-min expiry, single-use, ≤5 attempts,
  latest-request-wins), and the code must have been requested with `purpose:"reset"`.
- `404 account_not_found` — no account for that phone.
- `409 no_password_account` — phone-only account (no email/password provider);
  a Firebase password requires an email login, so there is nothing to reset.
- `400 weak_password` — fails the server policy (`OTP_PASSWORD_MIN_LENGTH`,
  default 6). Checked **before** the code is consumed so a weak password doesn't
  burn a valid code. `newPassword` is never logged.
- Reset sends are rate-limited in their own buckets, separate from auth
  (`otp_rate_limits/reset:phone:…`).

### Error shape

All non-2xx: `{ "error": { "code", "message" } }`. The app switches on `code`
(localizes its own text); keep codes stable. `429` also includes top-level
`resendAfterSeconds`.

Codes: `invalid_phone`, `rate_limited`, `otp_invalid`, `otp_expired`,
`too_many_attempts`, `phone_in_use`, `account_exists`, `account_not_found`,
`no_password_account`, `weak_password`, `sms_send_failed`, `unauthorized`,
`invalid_request`, `server_error`.

`account_exists` and `phone_in_use` are **not** interchangeable: `phone_in_use` is a
link-time collision with a *different* account, `account_exists` is a signup against a
number that already has one.

#### Status matrix (signup)

| Endpoint | HTTP | `error.code` | When |
|---|---|---|---|
| `/otp/request` | `409` | `account_exists` | `purpose:"signup"` and the phone already has an account. No SMS sent, no OTP record written; rate-limit counters still increment. |
| `/otp/verify` | `409` | `account_exists` | `purpose:"signup"` and an account for the phone appeared between request and verify. The code is consumed. |

## GeezSMS

Uses the plain-send endpoint (not the dedicated OTP endpoint — we own generation and
verification):

```
POST https://api.geezsms.com/api/v1/sms/send
Content-Type: application/x-www-form-urlencoded
body: token, phone, msg  [, shortcode_id]
```

- **Transport:** the client uses Node's raw `node:https` (not global `fetch`) and sends
  a url-encoded string body. Raw https surfaces GeezSMS's 302 redirects as a clear error
  instead of silently following them to the health page (see the shortcode note).
- **Phone format:** GeezSMS wants `2519…` (no leading `+`). `OTP_STRIP_PLUS=true`
  strips the `+` from the E.164 number before sending.
- **Success** is `error === false` in the JSON body
  (`{"error":false,"msg":"SMS has been sent successfully.",...}`); anything else
  (invalid number, insufficient balance, …) → `502`. Transient/5xx/network → one retry,
  then `503`.
- **`shortcode_id` must be the numeric id** from the GeezSMS dashboard. Passing a
  non-numeric value (e.g. a sender name like `LMY Church`) makes GeezSMS **302-redirect
  the request to its root**, which serves `{"status":200,"message":"GeezSMS Backend is
  running."}` and sends no SMS. Leave `GEEZ_SMS_SHORTCODE_ID` empty to use the default
  sender.

## Firestore

- **`otp_requests/{requestId}`** — one doc per code: `phone_number`, `code_hash`
  (HMAC-SHA256, plaintext never stored/logged), `purpose`
  (`"auth" | "signup" | "link" | "reset"`), `link_uid`, `lang`, `attempts`,
  `send_count`, `ip`, `created_at`, `expires_at`, `consumed_at`. Expiry (5 min),
  the 5-attempt cap, single-use, and latest-wins are enforced in code. `lang` (the language
  the OTP was requested in) is echoed back in the `/otp/verify` response so the app can set
  the new user's language.
- **`otp_rate_limits/{phone:…|ip:…}`** — rolling-window counters for the 60s resend
  cooldown and the hourly caps (per-number and per-IP). Password-reset sends use
  separate `reset:phone:…` / `reset:ip:…` docs so they're limited independently.

### Recommended: TTL policy for cleanup

Expiry is enforced in code, but old docs should be swept up. In the Firebase console
→ Firestore → **TTL**, add a policy on collection `otp_requests`, field
`expires_at`. (This only deletes stale docs; it does not affect verification.)

No composite indexes are required — all queries use equality-only filters.

## Config (`.env`)

| Var | Notes |
|---|---|
| `GEEZ_SMS_TOKEN` | GeezSMS API token (required). |
| `GEEZ_SMS_URL` | Defaults to the plain-send URL. |
| `GEEZ_SMS_SHORTCODE_ID` | Optional sender/shortcode id. |
| `OTP_HMAC_SECRET` | Long random string; hashes the code (required). |
| `OTP_REQUEST_SECRET` | Shared secret for the `x-otp-app-secret` header (required). |
| `OTP_APP_NAME` | Interpolated into the SMS body (default `Lideta`). |
| `OTP_TTL_SECONDS` / `OTP_LENGTH` / `OTP_MAX_ATTEMPTS` / `OTP_RESEND_COOLDOWN` / `OTP_HOURLY_CAP_PER_NUMBER` / `OTP_HOURLY_CAP_PER_IP` / `OTP_STRIP_PLUS` | Tunables (defaults in `.env`). |
| `OTP_PASSWORD_MIN_LENGTH` | Server-side password policy for `/otp/reset-password` (default 6 — Firebase's own minimum). |

> **Abuse control:** currently a shared secret + rate limiting. To upgrade to
> Firebase App Check, verify the App Check token in place of the `x-otp-app-secret`
> check at the top of both routes (`adminApp.appCheck().verifyToken(...)`).

## Smoke test

```bash
# Request a code (check the phone for the SMS)
curl -sS -X POST http://localhost:3000/api/otp/request \
  -H 'content-type: application/json' \
  -H "x-otp-app-secret: $OTP_REQUEST_SECRET" \
  -d '{"phoneNumber":"+251922493805","purpose":"auth","lang":"en"}'

# Verify it
curl -sS -X POST http://localhost:3000/api/otp/verify \
  -H 'content-type: application/json' \
  -H "x-otp-app-secret: $OTP_REQUEST_SECRET" \
  -d '{"phoneNumber":"+251922493805","code":"123456","requestId":"<requestId>"}'

# Phone-based password reset — request with purpose:"reset", then:
# screen 1: confirm the code without consuming it
curl -sS -X POST http://localhost:3000/api/otp/reset-verify \
  -H 'content-type: application/json' \
  -H "x-otp-app-secret: $OTP_REQUEST_SECRET" \
  -d '{"phoneNumber":"+251922493805","code":"123456","requestId":"<requestId>"}'

# screen 2: set the new password (consumes the code)
curl -sS -X POST http://localhost:3000/api/otp/reset-password \
  -H 'content-type: application/json' \
  -H "x-otp-app-secret: $OTP_REQUEST_SECRET" \
  -d '{"phoneNumber":"+251922493805","code":"123456","requestId":"<requestId>","newPassword":"<new password>"}'
```
