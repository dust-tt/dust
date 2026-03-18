const ZEROED_TIME_COMPONENT = 0;

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getWorkspaceUsageRetentionStartDate({
  now = new Date(),
  retentionDays,
}: {
  now?: Date;
  retentionDays: number;
}): Date {
  const retentionStartDate = new Date(now);
  retentionStartDate.setDate(retentionStartDate.getDate() - retentionDays);
  retentionStartDate.setHours(
    ZEROED_TIME_COMPONENT,
    ZEROED_TIME_COMPONENT,
    ZEROED_TIME_COMPONENT,
    ZEROED_TIME_COMPONENT
  );

  return retentionStartDate;
}

export function getWorkspaceUsageRetentionErrorMessage({
  startDate,
  retentionDays,
  now = new Date(),
}: {
  startDate: Date;
  retentionDays: number | null;
  now?: Date;
}): string | null {
  if (retentionDays === null) {
    return null;
  }

  const retentionStartDate = getWorkspaceUsageRetentionStartDate({
    now,
    retentionDays,
  });

  if (startDate >= retentionStartDate) {
    return null;
  }

  return (
    `This workspace has a ${retentionDays}-day conversation retention policy. ` +
    "Detailed activity reports and the related usage API rely on live " +
    `conversation data and would be incomplete for periods starting before ${formatDate(retentionStartDate)}.`
  );
}
