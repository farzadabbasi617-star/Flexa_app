/**
 * Reminder windows are intentionally at least as wide as the 30-minute cron
 * interval. Dedupe keys ensure an overlapping window still sends only once.
 */
export function codRoomReminderBucket(minutes: number): 0 | 15 | 60 {
  if (minutes <= 0) return 0;
  if (minutes <= 30) return 15;
  if (minutes <= 75) return 60;
  return 0;
}

export function tournamentReminderBucket(minutes: number): 0 | 15 | 30 | 60 | 1440 {
  if (minutes < 0) return 0;
  if (minutes <= 30) return 15;
  if (minutes <= 75) return 60;
  if (minutes <= 24 * 60 + 35) return 1440;
  return 0;
}
