export function getBaseBudgetOrder(
  loadedOrder: string[],
  groupId: string,
  hasBudget: boolean
): string[] {
  const order = loadedOrder.filter((id) => id !== groupId || hasBudget);
  return hasBudget && !order.includes(groupId) ? [...order, groupId] : order;
}

export function applyBudgetOrderMoves(
  movedOrder: string[] | null,
  baseOrder: string[]
): string[] {
  if (!movedOrder) {
    return baseOrder;
  }
  const baseIds = new Set(baseOrder);
  const movedIds = new Set(movedOrder);
  return [
    ...movedOrder.filter((id) => baseIds.has(id)),
    ...baseOrder.filter((id) => !movedIds.has(id)),
  ];
}

export function isSameBudgetOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function moveGroupPastVisibleNeighbor(
  order: string[],
  visibleIds: string[],
  groupId: string,
  direction: "up" | "down"
): string[] {
  const visibleIndex = visibleIds.indexOf(groupId);
  const neighborId =
    visibleIds[direction === "up" ? visibleIndex - 1 : visibleIndex + 1];
  if (visibleIndex === -1 || neighborId === undefined) {
    return order;
  }
  const withoutGroup = order.filter((id) => id !== groupId);
  const neighborIndex = withoutGroup.indexOf(neighborId);
  const insertAt = direction === "up" ? neighborIndex : neighborIndex + 1;
  return [
    ...withoutGroup.slice(0, insertAt),
    groupId,
    ...withoutGroup.slice(insertAt),
  ];
}

export function countEarlierGroupsSharingMembers(
  rows: { isCurrentGroup: boolean; sharedMemberCount: number | null }[]
): number {
  const currentIndex = rows.findIndex((row) => row.isCurrentGroup);
  return currentIndex === -1
    ? 0
    : rows
        .slice(0, currentIndex)
        .filter((row) => (row.sharedMemberCount ?? 0) > 0).length;
}
