export function isValidDate(date: Date) {
  return !Number.isNaN(date.valueOf());
}
