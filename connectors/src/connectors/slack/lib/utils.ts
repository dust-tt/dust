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

export const timeAgoFrom = (millisSinceEpoch: number) => {
  // return the duration elapsed from the given time to now in human readable format (using seconds, minutes, days)
  const now = new Date().getTime();
  const diff = now - millisSinceEpoch;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (years > 0) {
    return years + "y";
  }
  if (months > 0) {
    return months + "m";
  }
  if (days > 0) {
    return days + "d";
  }
  if (hours > 0) {
    return hours + "h";
  }
  if (minutes > 0) {
    return minutes + "m";
  }
  return seconds + "s";
};
