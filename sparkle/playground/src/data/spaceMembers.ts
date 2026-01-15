import { mockUsers } from "./users";

// Seeded random function for deterministic randomness
function seededRandom(seed: string, index: number): number {
  const hash = seed
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const x = Math.sin((hash + index) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Cache for generated member IDs per space
const memberCache = new Map<string, string[]>();

/**
 * Get member IDs for a specific space
 * @param spaceId - Space ID
 * @returns Array of member user IDs for the space
 */
export function getMembersBySpaceId(spaceId: string): string[] {
  if (!memberCache.has(spaceId)) {
    // Use seeded random to determine member count:
    // 20% chance of 0 members, 80% chance of 3-20 members
    const randomValue = seededRandom(spaceId, 0);
    let memberCount: number;

    if (randomValue < 0.2) {
      // 20% probability: 0 members
      memberCount = 0;
    } else {
      // 80% probability: 3-20 members (inclusive)
      const countRandom = seededRandom(spaceId, 1);
      memberCount = Math.floor(countRandom * 18) + 3; // 18 possible values (3 to 20)
    }

    // Generate member IDs by randomly selecting from mockUsers
    const memberIds: string[] = [];
    const availableUserIds = mockUsers.map((u) => u.id);
    const usedIndices = new Set<number>();

    for (let i = 0; i < memberCount; i++) {
      let userIndex: number;
      let attempts = 0;
      // Find an unused user index
      do {
        const indexRandom = seededRandom(spaceId, i + 2);
        userIndex = Math.floor(indexRandom * availableUserIds.length);
        attempts++;
        // Prevent infinite loop if we've used all users
        if (attempts > 100) break;
      } while (usedIndices.has(userIndex));

      usedIndices.add(userIndex);
      memberIds.push(availableUserIds[userIndex]);
    }

    memberCache.set(spaceId, memberIds);
  }
  return memberCache.get(spaceId)!;
}
