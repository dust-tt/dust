/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
// Test script that imports actual functions from the codebase

import {
  getDriveItemInternalId,
  getParentReferenceInternalId,
} from "@connectors/connectors/microsoft/lib/graph_api";
import type { DriveItem } from "@connectors/connectors/microsoft/lib/types";
import { typeAndPathFromInternalId } from "@connectors/connectors/microsoft/lib/utils";

// OLD VERSION of sortForIncrementalUpdate (before the fix)
function sortForIncrementalUpdateOld(
  changedList: DriveItem[],
  rootId?: string
) {
  if (changedList.length === 0) {
    return [];
  }

  const sortedItemList = changedList.filter((item) => {
    if (rootId && item.id === rootId) {
      return true;
    }
    if (!rootId && item.root) {
      return true;
    }
    return false;
  });

  for (;;) {
    const nextLevel = changedList.filter((item) => {
      // Already in the list - skip (OLD VERSION: O(n) check)
      if (sortedItemList.includes(item)) {
        return false;
      }

      if (!item.parentReference) {
        return true;
      }

      const parentInternalId = getParentReferenceInternalId(
        item.parentReference
      );

      if (
        typeAndPathFromInternalId(parentInternalId).nodeType === "drive" &&
        !rootId
      ) {
        return true;
      }

      // OLD VERSION: O(n) check for parent
      return sortedItemList.some(
        (sortedItem) => getDriveItemInternalId(sortedItem) === parentInternalId
      );
    });

    if (nextLevel.length === 0) {
      return sortedItemList;
    }

    sortedItemList.push(...nextLevel);
  }
}

// NEW VERSION of sortForIncrementalUpdate (with the fix)
function sortForIncrementalUpdateNew(
  changedList: DriveItem[],
  rootId?: string
) {
  if (changedList.length === 0) {
    return [];
  }

  const sortedItemList = changedList.filter((item) => {
    if (rootId && item.id === rootId) {
      return true;
    }
    if (!rootId && item.root) {
      return true;
    }
    return false;
  });

  // NEW: Using Set for O(1) lookups
  const sortedItemSet = new Set(sortedItemList.map(getDriveItemInternalId));

  for (;;) {
    const nextLevel = changedList.filter((item) => {
      // NEW: O(1) check using Set
      if (sortedItemSet.has(getDriveItemInternalId(item))) {
        return false;
      }

      if (!item.parentReference) {
        return true;
      }

      const parentInternalId = getParentReferenceInternalId(
        item.parentReference
      );

      if (
        typeAndPathFromInternalId(parentInternalId).nodeType === "drive" &&
        !rootId
      ) {
        return true;
      }

      // NEW: O(1) check using Set
      return sortedItemSet.has(parentInternalId);
    });

    if (nextLevel.length === 0) {
      return sortedItemList;
    }

    sortedItemList.push(...nextLevel);

    // NEW: Update the Set for next iterations
    nextLevel.forEach((item) => {
      sortedItemSet.add(getDriveItemInternalId(item));
    });
  }
}

// Create mock DriveItem hierarchy (3 levels with 1-3 items each)
function createMockHierarchy(): DriveItem[] {
  const driveId = "drive123";
  const items: DriveItem[] = [];

  // Root level (1 item)
  const rootFolder: DriveItem = {
    id: "root",
    name: "Root Folder",
    folder: {},
    root: {},
    parentReference: {
      driveId,
      path: "/drive/root:",
    },
  } as any;
  items.push(rootFolder);

  // Level 1 (3 folders)
  const level1Folders = ["folder1", "folder2", "folder3"];
  level1Folders.forEach((folderId) => {
    items.push({
      id: folderId,
      name: `${folderId}`,
      folder: {},
      parentReference: {
        driveId,
        id: "root",
        path: `/drive/root:/${folderId}`,
      },
    } as any);
  });

  // Level 2 (2 items per level 1 folder - mix of files and folders)
  level1Folders.forEach((parentId, parentIdx) => {
    // Add a subfolder
    const subfolderId = `${parentId}-subfolder`;
    items.push({
      id: subfolderId,
      name: `${subfolderId}`,
      folder: {},
      parentReference: {
        driveId,
        id: parentId,
        path: `/drive/root:/${parentId}/${subfolderId}`,
      },
    } as any);

    // Add a file
    const fileId = `${parentId}-file`;
    items.push({
      id: fileId,
      name: `${fileId}.txt`,
      file: {},
      parentReference: {
        driveId,
        id: parentId,
        path: `/drive/root:/${parentId}/${fileId}.txt`,
      },
    } as any);

    // Level 3 (1-2 files in some subfolders)
    if (parentIdx < 2) {
      const level3FileId = `${subfolderId}-deepfile`;
      items.push({
        id: level3FileId,
        name: `${level3FileId}.doc`,
        file: {},
        parentReference: {
          driveId,
          id: subfolderId,
          path: `/drive/root:/${parentId}/${subfolderId}/${level3FileId}.doc`,
        },
      } as any);
    }
  });

  // Shuffle the array to simulate unordered input
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return items;
}

// Test function
function runTests() {
  console.log("Creating mock hierarchy...");
  const mockItems = createMockHierarchy();

  console.log("\nMock items (shuffled):");
  mockItems.forEach((item) => {
    console.log(
      `- ${item.name} (id: ${item.id}, parent: ${item.parentReference?.id || "none"})`
    );
  });

  console.log("\n=== Testing without rootId ===");

  console.time("Old version");
  const resultOld = sortForIncrementalUpdateOld([...mockItems]);
  console.timeEnd("Old version");

  console.time("New version");
  const resultNew = sortForIncrementalUpdateNew([...mockItems]);
  console.timeEnd("New version");

  console.log("\nOld version result order:");
  resultOld.forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.name} (id: ${item.id})`);
  });

  console.log("\nNew version result order:");
  resultNew.forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.name} (id: ${item.id})`);
  });

  // Compare results
  const sameLength = resultOld.length === resultNew.length;
  const sameOrder = resultOld.every(
    (item, idx) => item.id === resultNew[idx].id
  );
  const sameItems = resultOld.every((oldItem) =>
    resultNew.some((newItem) => newItem.id === oldItem.id)
  );

  console.log("\n=== Comparison Results ===");
  console.log(
    `Same length: ${sameLength} (old: ${resultOld.length}, new: ${resultNew.length})`
  );
  console.log(`Same order: ${sameOrder}`);
  console.log(`Same items: ${sameItems}`);

  if (!sameOrder) {
    console.log("\nDifferences in order:");
    for (let i = 0; i < Math.max(resultOld.length, resultNew.length); i++) {
      const oldItem = resultOld[i];
      const newItem = resultNew[i];
      if (!oldItem || !newItem || oldItem.id !== newItem.id) {
        console.log(
          `Position ${i + 1}: old="${oldItem?.name || "none"}" vs new="${newItem?.name || "none"}"`
        );
      }
    }
  }

  // Test with a specific rootId
  console.log("\n\n=== Testing with rootId='folder2' ===");

  console.time("Old version with rootId");
  const resultOldWithRoot = sortForIncrementalUpdateOld(
    [...mockItems],
    "folder2"
  );
  console.timeEnd("Old version with rootId");

  console.time("New version with rootId");
  const resultNewWithRoot = sortForIncrementalUpdateNew(
    [...mockItems],
    "folder2"
  );
  console.timeEnd("New version with rootId");

  console.log(
    "\nWith rootId - Same order:",
    resultOldWithRoot.every(
      (item, idx) => item.id === resultNewWithRoot[idx].id
    )
  );

  // Performance test with larger dataset
  console.log("\n\n=== Performance Test with 1000 items ===");
  const largeDataset = createLargeDataset(1000);

  console.time("Old version (1000 items)");
  sortForIncrementalUpdateOld([...largeDataset]);
  console.timeEnd("Old version (1000 items)");

  console.time("New version (1000 items)");
  sortForIncrementalUpdateNew([...largeDataset]);
  console.timeEnd("New version (1000 items)");
}

// Create a larger dataset for performance testing
function createLargeDataset(size: number): DriveItem[] {
  const items: DriveItem[] = [];
  const driveId = "drive123";

  // Create root
  items.push({
    id: "root",
    name: "Root",
    folder: {},
    root: {},
    parentReference: {
      driveId,
      path: "/drive/root:",
    },
  } as any);

  // Create items in a somewhat balanced tree structure
  for (let i = 1; i < size; i++) {
    const parentIdx = Math.floor((i - 1) / 3); // Each parent has ~3 children
    const parentId = items[parentIdx].id;

    items.push({
      id: `item${i}`,
      name: `Item ${i}`,
      folder: i % 2 === 0 ? {} : undefined,
      file: i % 2 === 1 ? {} : undefined,
      parentReference: {
        driveId,
        id: parentId,
        path: `/drive/items/${parentId}/item${i}`,
      },
    } as any);
  }

  // Shuffle
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return items;
}

// Run the tests
runTests();
