export function getWeekStart(date: Date): Date {
  const dateCopy = new Date(date);

  dateCopy.setHours(0);
  dateCopy.setMinutes(0);
  dateCopy.setSeconds(0);
  dateCopy.setMilliseconds(0);
  const diff =
    dateCopy.getDate() - dateCopy.getDay() + (dateCopy.getDay() === 0 ? -6 : 1);
  return new Date(dateCopy.setDate(diff));
}

export function getWeekEnd(date: Date): Date {
  const dateCopy = new Date(date);
  dateCopy.setHours(0);
  dateCopy.setMinutes(0);
  dateCopy.setSeconds(0);
  dateCopy.setMilliseconds(0);
  const diff =
    dateCopy.getDate() - dateCopy.getDay() + (dateCopy.getDay() === 0 ? -6 : 1);
  return new Date(dateCopy.setDate(diff + 7));
}
