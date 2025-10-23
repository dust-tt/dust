export function isAgentBirthday(createdAt: string | null): boolean {
  if (!createdAt) {
    return false;
  }

  const created = new Date(createdAt);
  const today = new Date(createdAt); // hack

  return (
    created.getMonth() === today.getMonth() &&
    created.getDate() === today.getDate()
  );
}
