declare module 'ethiopian-date' {
  export function toEthiopian(year: number, month: number, day: number): [number, number, number];
  export function toGregorian(year: number, month: number, day: number): [number, number, number];
}
