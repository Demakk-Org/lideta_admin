# Phone-OTP — Frontend Integration Contract

Exact request/response shapes the backend returns, for the app team to build against.
All payloads below are **real responses** captured from the running backend.

- **Base URL:** `<host>/api`  (dev: `http://localhost:3000/api`) — full paths: `/api/otp/request`, `/api/otp/verify`
- **Content-Type:** `application/json`
- **Required header on BOTH endpoints:** `x-otp-app-secret: <shared secret>`
- The app switches on **`error.code`** (stable enum) for its localized message.
  `error.message` is English, for logs only — do not show it to users.

---

## Flow (2 calls + Firebase)

```
POST /otp/request  → { requestId, ... }
        ↓ user types the code from SMS
POST /otp/verify   → { customToken, uid, isNewUser, primaryAuthMethod }
        ↓
FirebaseAuth.instance.signInWithCustomToken(customToken)
        ↓
read currentUser.phoneNumber → build/patch Firestore users/{uid} doc
```

---

## 1) `POST /otp/request`

**Request body**
```jsonc
{
  "phoneNumber": "+251931213930",  // E.164, REQUIRED (must include +country code)
  "purpose": "auth",               // "auth" (login-or-signup) | "link"; default "auth"
  "lang": "am",                    // "en" | "am" | "om" — SMS language; default "en"
  "idToken": "<firebase-id-token>" // REQUIRED only when purpose == "link"
}
```

**Success `200`**
```json
{ "requestId": "E6rrGwMSanfEK685RjrU", "expiresInSeconds": 300, "resendAfterSeconds": 60 }
```
→ Keep `requestId`; you pass it to `/otp/verify`. Start a `resendAfterSeconds` countdown
before allowing "Resend". `200` is returned **whether or not the account already exists**
(privacy — don't infer existence from this).

**Errors**

| HTTP | body | frontend action |
|---|---|---|
| `400` | `{"error":{"code":"invalid_phone","message":"phoneNumber must be E.164 (e.g. +2519…)"}}` | Show "invalid phone number". |
| `401` | `{"error":{"code":"unauthorized","message":"Missing or invalid app secret"}}` | App misconfig — the `x-otp-app-secret` header is missing/wrong (or bad `idToken` on link). |
| `429` | `{"error":{"code":"rate_limited","message":"Rate limited (cooldown)"},"resendAfterSeconds":31}` | Disable resend for `resendAfterSeconds`; show "try again in Ns". |
| `502` / `503` | `{"error":{"code":"sms_send_failed","message":"Failed to send SMS"}}` | Show "couldn't send code, retry". `503` = transient (retry), `502` = rejected. |

---

## 2) `POST /otp/verify`

**Request body**
```jsonc
{
  "phoneNumber": "+251931213930",
  "code": "965766",
  "requestId": "E6rrGwMSanfEK685RjrU",
  "idToken": "<firebase-id-token>"  // REQUIRED only when purpose was "link"
}
```

**Success `200`**
```json
{
  "customToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "uid": "nR97Mwr1XxONPBEBDou1WCoFQlZ2",
  "isNewUser": true,
  "primaryAuthMethod": "phone",
  "lang": "am"
}
```
→ Call `FirebaseAuth.instance.signInWithCustomToken(customToken)`. `isNewUser` tells you
whether to run first-time onboarding. `primaryAuthMethod` (`"phone"` | `"email"`) is a
hint; the app still owns the field in `users/{uid}`.

> **`lang`** is the language the OTP was requested in (`"en"|"am"|"om"`), echoed back so the
> app can set it as the user's language when creating `users/{uid}`. **Use `response.lang`
> instead of defaulting to `"en"`** — otherwise a user who chose Amharic gets an English
> account. The backend does not write the Firestore user doc; the app must persist this.

**Errors**

| HTTP | body | frontend action |
|---|---|---|
| `400` | `{"error":{"code":"invalid_request","message":"phoneNumber, code and requestId are required"}}` | Missing fields — client bug. |
| `400` | `{"error":{"code":"otp_invalid","message":"Incorrect code"}}` | Wrong code — let them retry (attempts are counted). |
| `410` | `{"error":{"code":"otp_expired","message":"This code has expired"}}` (or `"...already been used"`) | Code expired/used — send them back to request a new one. |
| `429` | `{"error":{"code":"too_many_attempts","message":"Too many attempts; request a new code"}}` | Too many wrong tries (>5); the code is dead — request a new one. |
| `409` | `{"error":{"code":"phone_in_use","message":"Phone number already in use by another account"}}` | (link only) This phone belongs to another account. |
| `401` | `{"error":{"code":"unauthorized","message":"..."}}` | Missing app secret / bad `idToken` on link. |

---

## Phone-based password reset (two screens)

For a user who has an **email + password** account but wants to reset the password by
proving they own the **phone** on the account. (Email reset uses Firebase's native
`sendPasswordResetEmail` — the backend is not involved.) Three calls:

```
POST /otp/request        purpose:"reset"   → { requestId, ... }   (same shape as auth)
        ↓ Screen 1: user types the code from SMS
POST /otp/reset-verify   { phoneNumber, code, requestId }  → { valid: true }
        ↓ Screen 2: user types the new password   (code is NOT consumed by reset-verify)
POST /otp/reset-password { phoneNumber, code, requestId, newPassword } → { customToken, uid }
        ↓
FirebaseAuth.instance.signInWithCustomToken(customToken)   // signed in with the new password
```

> **Why the same `code` twice:** `reset-verify` only *checks* the code so Screen 1 can
> confirm it before asking for a new password — it does **not** spend it. `reset-password`
> is what actually consumes the (single-use) code and sets the password. Send the **same**
> `code` and `requestId` to both. Wrong guesses at either step count toward the max-5 cap.

### `POST /otp/request` with `purpose:"reset"`
Identical body/response to `purpose:"auth"` (§1), but `purpose:"reset"`. Still `200`
whether or not an account exists (privacy). Reset codes are rate-limited separately from
auth codes.

### `POST /otp/reset-verify`  (Screen 1 — confirm the code)
Body `{ phoneNumber, code, requestId }`. **Success `200`** → `{ "valid": true }`.
Errors are the same OTP set as `/otp/verify`: `otp_invalid` (400, wrong code),
`otp_expired` (410, expired/used), `too_many_attempts` (429). A code that was requested
for auth/link returns `otp_invalid` here.

### `POST /otp/reset-password`  (Screen 2 — set the new password)
```jsonc
{ "phoneNumber": "+251931213930", "code": "965766", "requestId": "…", "newPassword": "…" }
```
**Success `200`** → `{ "customToken", "uid" }`. Then `signInWithCustomToken(customToken)`.

| HTTP | `error.code` | frontend action |
|---|---|---|
| `400` | `otp_invalid` | Wrong code (attempts counted). |
| `410` | `otp_expired` | Code expired/used — restart the reset. |
| `429` | `too_many_attempts` | Code dead — request a new one. |
| `400` | `weak_password` | New password too short (min 6) — ask again. |
| `404` | `account_not_found` | No account for that phone. |
| `409` | `no_password_account` | Phone-only / Google-only account — nothing to reset; steer them to that sign-in method. |

> `account_not_found` and `no_password_account` are only knowable at `reset-password`
> (Screen 1 validates the code, not the account). Handle them on Screen 2 too.

---

## Error-code enum (switch on this)

`invalid_phone` · `rate_limited` · `otp_invalid` · `otp_expired` · `too_many_attempts` ·
`phone_in_use` · `account_not_found` · `no_password_account` · `weak_password` ·
`sms_send_failed` · `unauthorized` · `invalid_request` · `server_error`

These values are **stable**. Map each to a localized (en/am/om) string in the app.

---

## Rules the app should mirror

- **Code:** 6 digits, expires in **5 min**, **single-use**, **max 5** wrong attempts then dead.
- **Resend:** blocked for **60s** per number (use `resendAfterSeconds`); hourly caps apply.
- **Latest wins:** a new `/otp/request` invalidates the previous code for that number — always
  verify against the newest `requestId`.
- **Phone:** always send full E.164 with `+` and country code (e.g. `+2519XXXXXXXX`).
- **link flow:** send the current Firebase `idToken` on **both** `/otp/request` and
  `/otp/verify` with `purpose:"link"`; a fresh `customToken` for the **same** uid comes back.

---

## Minimal Dart/Flutter sketch

```dart
final headers = {
  'content-type': 'application/json',
  'x-otp-app-secret': appSecret,
};

// 1. request
final r = await http.post(Uri.parse('$base/otp/request'),
    headers: headers,
    body: jsonEncode({'phoneNumber': phone, 'purpose': 'auth', 'lang': lang}));
if (r.statusCode != 200) {
  final code = jsonDecode(r.body)['error']['code'];   // switch → localized message
  return showError(code);
}
final requestId = jsonDecode(r.body)['requestId'];

// 2. verify
final v = await http.post(Uri.parse('$base/otp/verify'),
    headers: headers,
    body: jsonEncode({'phoneNumber': phone, 'code': code, 'requestId': requestId}));
if (v.statusCode != 200) {
  return showError(jsonDecode(v.body)['error']['code']);
}
final data = jsonDecode(v.body);
await FirebaseAuth.instance.signInWithCustomToken(data['customToken']);
// data['isNewUser'], data['uid'], data['primaryAuthMethod'], data['lang'] available here
// when creating users/{uid}, use data['lang'] as the account language (not a hardcoded 'en')
```
