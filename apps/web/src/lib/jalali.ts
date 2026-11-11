/**
 * Jalali (Shamsi) and Gregorian date utility for ProxyNet
 * Provides conversion, formatting, and calendar calculations with zero external dependencies.
 */

export const JALALI_MONTHS_FA = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export const JALALI_MONTHS_EN = [
  'Farvardin',
  'Ordibehesht',
  'Khordad',
  'Tir',
  'Mordad',
  'Shahrivar',
  'Mehr',
  'Aban',
  'Azar',
  'Dey',
  'Bahman',
  'Esfand',
];

export const GREGORIAN_MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const JALALI_WEEKDAYS_FA = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
export const GREGORIAN_WEEKDAYS_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Convert Gregorian date (year, month 1-12, day 1-31) to Jalali (jy, jm, jd)
 */
export function gregorianToJalali(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  jy += Math.floor((days - 1) / 365);
  if (days > 365) days = (days - 1) % 365;
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

/**
 * Convert Jalali date (jy, jm 1-12, jd 1-31) to Gregorian (gy, gm 1-12, gd 1-31)
 */
export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days =
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  let gm = 0;
  while (gm < 13 && days >= sal_a[gm]) {
    days -= sal_a[gm];
    gm++;
  }
  const gd = days + 1;
  return { gy, gm, gd };
}

/**
 * Check if Jalali year is leap
 */
export function isJalaliLeapYear(jy: number): boolean {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
    2456, 3178,
  ];
  let jp = breaks[0];
  let jm = 0;
  let jump = 0;
  for (let i = 1; i < breaks.length; i++) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    jp = jm;
  }
  let n = jy - jp;
  if (jump - n < 6) n = n - jump + ((jump + 4) % 33);
  let leap = (((n + 1) % 33) - 1) % 4;
  if (leap === -1) leap = 4;
  return leap === 0;
}

/**
 * Return number of days in a given Jalali month (1-12)
 */
export function getDaysInJalaliMonth(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

/**
 * Return number of days in a given Gregorian month (1-12)
 */
export function getDaysInGregorianMonth(gy: number, gm: number): number {
  return new Date(gy, gm, 0).getDate();
}

/**
 * Parse Date / string / number into a valid JS Date object or null
 */
export function parseDate(val: string | number | Date | null | undefined): Date | null {
  if (!val) return null;
  const d = typeof val === 'object' && val instanceof Date ? val : new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Convert number or numeric string to Persian digits if lang === 'fa'
 */
export function toPersianDigits(n: number | string): string {
  const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(n).replace(/\d/g, (w) => faDigits[Number(w)]);
}

/**
 * Format a Date value to localized date string (Shamsi for 'fa', Gregorian for 'en')
 */
export function formatDate(
  val: string | number | Date | null | undefined,
  lang = 'fa',
  options?: {
    format?: 'short' | 'medium' | 'long';
    withTime?: boolean;
  }
): string {
  const d = parseDate(val);
  if (!d) return '—';

  const isFa = lang === 'fa';
  const format = options?.format ?? 'medium';
  const withTime = options?.withTime ?? false;

  try {
    if (isFa) {
      if (format === 'short') {
        const gy = d.getFullYear();
        const gm = d.getMonth() + 1;
        const gd = d.getDate();
        const { jy, jm, jd } = gregorianToJalali(gy, gm, gd);
        const mm = String(jm).padStart(2, '0');
        const dd = String(jd).padStart(2, '0');
        const dateStr = toPersianDigits(`${jy}/${mm}/${dd}`);
        if (withTime) {
          const hh = toPersianDigits(String(d.getHours()).padStart(2, '0'));
          const min = toPersianDigits(String(d.getMinutes()).padStart(2, '0'));
          return `${dateStr}، ${hh}:${min}`;
        }
        return dateStr;
      }

      // Medium / Long
      const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric',
        month: format === 'long' ? 'long' : 'short',
        day: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      });
      return formatter.format(d);
    }

    // English / Gregorian
    if (format === 'short') {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      if (withTime) {
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${dateStr} ${hh}:${min}`;
      }
      return dateStr;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: format === 'long' ? 'long' : 'short',
      day: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
    return formatter.format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Format Date with time
 */
export function formatDateTime(val: string | number | Date | null | undefined, lang = 'fa'): string {
  return formatDate(val, lang, { withTime: true, format: 'medium' });
}
