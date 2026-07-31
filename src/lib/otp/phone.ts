// E.164 validation + GeezSMS normalization.

const E164 = /^\+[1-9]\d{7,14}$/;

/** True when `phone` is a valid E.164 number, e.g. `+251922493805`. */
export function isValidE164(phone: unknown): phone is string {
  return typeof phone === 'string' && E164.test(phone);
}

/**
 * GeezSMS expects the number starting with the country code and no leading `+`
 * (e.g. `251922493805`). When `stripPlus` is false the number is returned as-is.
 */
export function toGeezSmsPhone(phone: string, stripPlus: boolean): string {
  return stripPlus ? phone.replace(/^\+/, '') : phone;
}
