let lockCount = 0;

export function incrementNavigationLock(): void {
  lockCount++;
}

export function decrementNavigationLock(): void {
  lockCount--;
}

export function isNavigationLocked(): boolean {
  return lockCount > 0;
}
