import { APP_NAME } from './config';

export type OtpLang = 'en' | 'am' | 'om';

/** Coerce arbitrary client input to a supported language, defaulting to English. */
export function normalizeLang(input: unknown): OtpLang {
  return input === 'am' || input === 'om' ? input : 'en';
}

/** Localized OTP SMS body. Amharic / Afaan Oromo / English. */
export function otpMessage(code: string, lang: OtpLang): string {
  switch (lang) {
    case 'am':
      return `የ${APP_NAME} ማረጋገጫ ኮድዎ ${code} ነው። በ5 ደቂቃ ውስጥ ጊዜው ያበቃል። ይህን ኮድ ለማንም አያጋሩ።`;
    case 'om':
      return `Koodiin mirkaneessaa ${APP_NAME} kee ${code} dha. Daqiiqaa 5 keessatti ni dhuma. Koodii kana namaaf hin qoodin.`;
    default:
      return `Your ${APP_NAME} verification code is ${code}. It expires in 5 minutes. Do not share this code.`;
  }
}
