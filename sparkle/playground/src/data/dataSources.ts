import {
  Brackets,
  CodeSquare01,
  Folder,
  GooglePdfLogo,
  MicrosoftExcelLogo,
  MicrosoftPowerpointLogo,
  MicrosoftWordLogo,
  Type01,
} from "@dust-tt/sparkle";
import React from "react";

import type { DataSource, DataSourceFileType } from "./types";
import { mockUsers } from "./users";

// Seeded random function for deterministic randomness
function seededRandom(seed: string, index: number): number {
  const hash = seed
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const x = Math.sin((hash + index) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// File name templates by type
const pdfNames = [
  "Q4_Report",
  "Product_Spec",
  "Marketing_Plan",
  "Annual_Review",
  "Budget_2024",
  "Project_Proposal",
  "Technical_Documentation",
  "User_Guide",
  "Company_Policy",
  "Research_Paper",
  "System_Architecture",
  "Security_Audit",
  "Performance_Report",
  "Compliance_Review",
  "Strategic_Plan",
];

const docxNames = [
  "Meeting_Notes",
  "Project_Plan",
  "Requirements_Doc",
  "Design_Brief",
  "Content_Strategy",
  "Team_Handbook",
  "Process_Documentation",
  "Training_Materials",
  "Client_Proposal",
  "Internal_Memo",
  "Status_Update",
  "Action_Items",
  "Decision_Log",
  "Risk_Assessment",
  "Change_Request",
];

const xlsxNames = [
  "Sales_Data",
  "Analytics_Q3",
  "Financial_Summary",
  "Inventory_List",
  "Customer_Database",
  "Budget_Tracker",
  "Expense_Report",
  "Revenue_Forecast",
  "Project_Timeline",
  "Resource_Allocation",
  "Performance_Metrics",
  "Survey_Results",
  "Data_Analysis",
  "Quarterly_Review",
  "KPIs_Dashboard",
];

const pptxNames = [
  "Product_Launch",
  "Team_Meeting",
  "Quarterly_Review",
  "Sales_Presentation",
  "Training_Session",
  "Project_Kickoff",
  "Strategy_Overview",
  "Client_Pitch",
  "Annual_Report",
  "Onboarding_Deck",
  "Roadmap_2024",
  "Status_Update",
  "Demo_Day",
  "Workshop_Materials",
  "Executive_Summary",
];

const txtNames = [
  "Readme",
  "Notes",
  "Log_File",
  "Configuration",
  "Instructions",
  "Changelog",
  "Task_List",
  "Quick_Reference",
  "Script_Output",
  "Error_Log",
  "Backup_Notes",
  "Draft_Content",
  "Raw_Data",
  "Test_Results",
  "System_Info",
];

const mdNames = [
  "API_Documentation",
  "README",
  "Contributing",
  "Changelog",
  "Architecture",
  "Design_Decisions",
  "Troubleshooting",
  "Setup_Guide",
  "Best_Practices",
  "Code_Review",
  "Release_Notes",
  "Feature_Spec",
  "Technical_Notes",
  "Wiki_Page",
  "Project_Overview",
];

const docNames = [
  "Legacy_Document",
  "Old_Report",
  "Archive_File",
  "Historical_Data",
  "Backup_Doc",
];

const csvNames = [
  "Export_Data",
  "Customer_Export",
  "Sales_Export",
  "Usage_Metrics",
  "Event_Log",
  "Survey_Export",
  "Inventory_Export",
  "Billing_Export",
];

const frameNames = [
  "Dashboard_Frame",
  "Onboarding_Frame",
  "Settings_Frame",
  "Analytics_Frame",
  "Profile_Frame",
  "Checkout_Frame",
  "Landing_Frame",
  "Admin_Frame",
];

const rootFolderNames = [
  "Design",
  "Reports",
  "Research",
  "Frames",
  "Marketing",
  "Engineering",
];

const nestedFolderNames = [
  "Drafts",
  "Archive",
  "Shared",
  "Q1",
  "Q2",
  "Final",
  "Assets",
  "References",
];

// Generate a file name based on type and index
function generateFileName(
  fileType: DataSourceFileType,
  index: number,
  seed: string
): string {
  const random = seededRandom(seed, index);
  let nameList: string[];

  switch (fileType) {
    case "pdf":
      nameList = pdfNames;
      break;
    case "docx":
      nameList = docxNames;
      break;
    case "xlsx":
      nameList = xlsxNames;
      break;
    case "pptx":
      nameList = pptxNames;
      break;
    case "txt":
      nameList = txtNames;
      break;
    case "md":
      nameList = mdNames;
      break;
    case "doc":
      nameList = docNames;
      break;
    case "csv":
      nameList = csvNames;
      break;
    case "frame":
      nameList = frameNames;
      break;
  }

  const baseName = nameList[Math.floor(random * nameList.length)];
  const suffix = index > nameList.length ? `_${index}` : "";
  const extension = fileType === "frame" ? "tsx" : fileType;
  return `${baseName}${suffix}.${extension}`;
}

// Generate file type distribution: 25% PDF, 18% docx, 12% xlsx, 8% csv, 8% pptx, 8% txt, 8% md, 5% doc, 8% frame
function getFileTypeForIndex(index: number, seed: string): DataSourceFileType {
  const random = seededRandom(seed, index * 2);
  const value = random * 100;

  if (value < 25) return "pdf";
  if (value < 43) return "docx";
  if (value < 55) return "xlsx";
  if (value < 63) return "csv";
  if (value < 71) return "pptx";
  if (value < 79) return "txt";
  if (value < 87) return "md";
  if (value < 92) return "doc";
  return "frame";
}

// Generate dates within the last year
function generateDates(
  index: number,
  seed: string
): { createdAt: Date; updatedAt: Date } {
  const now = new Date();
  const random = seededRandom(seed, index * 3);
  const random2 = seededRandom(seed, index * 3 + 1);

  // Created between 365 days ago and now
  const daysAgo = Math.floor(random * 365);
  const createdAt = new Date(now);
  createdAt.setDate(createdAt.getDate() - daysAgo);
  createdAt.setHours(Math.floor(random * 24), Math.floor(random * 60), 0, 0);

  // Updated between createdAt and now
  const daysSinceCreation = Math.floor(random2 * (daysAgo + 1));
  const updatedAt = new Date(createdAt);
  updatedAt.setDate(updatedAt.getDate() + daysSinceCreation);
  if (updatedAt > now) updatedAt.setTime(now.getTime());
  updatedAt.setHours(Math.floor(random2 * 24), Math.floor(random2 * 60), 0, 0);

  return { createdAt, updatedAt };
}

// Generate a random user ID from mockUsers
function getRandomUserId(index: number, seed: string): string {
  const random = seededRandom(seed, index * 4);
  const userIndex = Math.floor(random * mockUsers.length);
  return mockUsers[userIndex].id;
}

// Map file type to logo/icon component
function getIconForFileType(
  fileType: DataSourceFileType
): React.ComponentType<{ className?: string }> {
  switch (fileType) {
    case "pdf":
      return GooglePdfLogo;
    case "doc":
    case "docx":
      return MicrosoftWordLogo;
    case "xlsx":
    case "csv":
      return MicrosoftExcelLogo;
    case "frame":
      return Brackets;
    case "pptx":
      return MicrosoftPowerpointLogo;
    case "txt":
      return Type01;
    case "md":
      return CodeSquare01;
    default:
      return GooglePdfLogo;
  }
}

function pickFolderName(names: string[], index: number, seed: string): string {
  const random = seededRandom(seed, index);
  const baseName = names[Math.floor(random * names.length)];
  const suffix = index >= names.length ? ` ${index + 1}` : "";
  return `${baseName}${suffix}`;
}

function getSourceForIndex(index: number, seed: string): DataSource["source"] {
  return seededRandom(seed, index * 5) < 0.3 ? "company" : "pod";
}

// Generate data sources for a space (folders + files in a tree)
function generateDataSourcesForSpace(
  spaceId: string,
  fileCount: number
): DataSource[] {
  if (fileCount === 0) {
    return [];
  }

  const dataSources: DataSource[] = [];
  let itemIndex = 0;

  const rootFolderCount = Math.floor(seededRandom(spaceId, 100) * 3) + 2;
  const rootFolderIds: string[] = [];
  const allFolderIds: string[] = [];

  for (let f = 0; f < rootFolderCount; f++) {
    const id = `ds-${spaceId}-folder-${itemIndex++}`;
    const { createdAt, updatedAt } = generateDates(itemIndex, spaceId);
    rootFolderIds.push(id);
    allFolderIds.push(id);
    dataSources.push({
      id,
      kind: "folder",
      fileName: pickFolderName(rootFolderNames, f, spaceId),
      parentId: null,
      source: "pod",
      createdBy: getRandomUserId(itemIndex, spaceId),
      createdAt,
      updatedAt,
    });
  }

  for (let f = 0; f < rootFolderIds.length; f++) {
    if (seededRandom(spaceId, 200 + f) >= 0.3) {
      continue;
    }

    const parentId = rootFolderIds[f];
    const nestedId = `ds-${spaceId}-folder-${itemIndex++}`;
    const { createdAt, updatedAt } = generateDates(itemIndex, spaceId);
    allFolderIds.push(nestedId);
    dataSources.push({
      id: nestedId,
      kind: "folder",
      fileName: pickFolderName(nestedFolderNames, f, `${spaceId}-nested`),
      parentId,
      source: "pod",
      createdBy: getRandomUserId(itemIndex, spaceId),
      createdAt,
      updatedAt,
    });

    if (seededRandom(spaceId, 300 + f) < 0.5) {
      const deepId = `ds-${spaceId}-folder-${itemIndex++}`;
      const deepDates = generateDates(itemIndex, spaceId);
      allFolderIds.push(deepId);
      dataSources.push({
        id: deepId,
        kind: "folder",
        fileName: pickFolderName(nestedFolderNames, f + 10, `${spaceId}-deep`),
        parentId: nestedId,
        source: "pod",
        createdBy: getRandomUserId(itemIndex, spaceId),
        createdAt: deepDates.createdAt,
        updatedAt: deepDates.updatedAt,
      });
    }
  }

  const parentTargets: Array<string | null> = [null, ...allFolderIds];

  for (let i = 0; i < fileCount; i++) {
    const fileType = getFileTypeForIndex(i, spaceId);
    const fileName = generateFileName(fileType, i, spaceId);
    const { createdAt, updatedAt } = generateDates(i + itemIndex, spaceId);
    const createdBy = getRandomUserId(i + itemIndex, spaceId);
    const parentId =
      parentTargets[
        Math.floor(seededRandom(spaceId, 400 + i) * parentTargets.length)
      ] ?? null;

    dataSources.push({
      id: `ds-${spaceId}-file-${i}`,
      kind: "file",
      fileName,
      parentId,
      source: getSourceForIndex(i, spaceId),
      fileType,
      createdBy,
      createdAt,
      updatedAt,
      icon: getIconForFileType(fileType),
    });
  }

  return dataSources;
}

export function isDataSourceFolder(item: DataSource): boolean {
  return item.kind === "folder";
}

export function getDataSourceChildren(
  items: DataSource[],
  parentId: string | null
): DataSource[] {
  return items.filter((item) => item.parentId === parentId);
}

export function isInFolderTree(
  items: DataSource[],
  item: DataSource,
  folderId: string
): boolean {
  let parentId = item.parentId;

  while (parentId) {
    if (parentId === folderId) {
      return true;
    }

    const parent = items.find((entry) => entry.id === parentId);
    parentId = parent?.parentId ?? null;
  }

  return false;
}

export function getDataSourcesInFolderTree(
  items: DataSource[],
  folderId: string
): DataSource[] {
  return items.filter((item) => isInFolderTree(items, item, folderId));
}

export function getFolderPath(
  items: DataSource[],
  folderId: string | null
): DataSource[] {
  if (!folderId) {
    return [];
  }

  const itemsById = new Map(items.map((item) => [item.id, item]));
  const path: DataSource[] = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const folder = itemsById.get(currentId);
    if (!folder || folder.kind !== "folder") {
      break;
    }
    path.unshift(folder);
    currentId = folder.parentId;
  }

  return path;
}

export function getDataSourceIcon(
  item: DataSource
): React.ComponentType<{ className?: string }> | undefined {
  if (isDataSourceFolder(item)) {
    return Folder;
  }

  return (
    item.icon ?? (item.fileType ? getIconForFileType(item.fileType) : undefined)
  );
}

export function getFileTypeLabel(fileType: DataSourceFileType): string {
  if (fileType === "frame") {
    return "Frame";
  }

  return fileType.toUpperCase();
}

export function getItemTypeLabel(item: DataSource): string {
  if (isDataSourceFolder(item)) {
    return "Folder";
  }

  return item.fileType ? getFileTypeLabel(item.fileType) : "File";
}

export function sortDataSourcesForDisplay(items: DataSource[]): DataSource[] {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "folder" ? -1 : 1;
    }

    return a.fileName.localeCompare(b.fileName);
  });
}

export function moveDataSource(
  items: DataSource[],
  fileId: string,
  targetParentId: string | null
): DataSource[] {
  const file = items.find((item) => item.id === fileId);
  if (!file || file.kind !== "file") {
    return items;
  }

  if (file.parentId === targetParentId) {
    return items;
  }

  if (targetParentId !== null) {
    const targetFolder = items.find((item) => item.id === targetParentId);
    if (!targetFolder || targetFolder.kind !== "folder") {
      return items;
    }
  }

  return items.map((item) =>
    item.id === fileId ? { ...item, parentId: targetParentId } : item
  );
}

// Cache for generated data sources per space
const dataSourceCache = new Map<string, DataSource[]>();

/**
 * Get data sources for a specific space
 * @param spaceId - Space ID
 * @returns Array of data sources for the space
 */
export function getDataSourcesBySpaceId(spaceId: string): DataSource[] {
  if (!dataSourceCache.has(spaceId)) {
    // Use seeded random to determine file count:
    // 20% chance of 0 files, 80% chance of 3-80 files
    const randomValue = seededRandom(spaceId, 0);
    let fileCount: number;

    if (randomValue < 0.2) {
      // 20% probability: 0 files
      fileCount = 0;
    } else {
      // 80% probability: 3-80 files (inclusive)
      const countRandom = seededRandom(spaceId, 1);
      fileCount = Math.floor(countRandom * 78) + 3; // 78 possible values (3 to 80)
    }

    dataSourceCache.set(
      spaceId,
      generateDataSourcesForSpace(spaceId, fileCount)
    );
  }
  return dataSourceCache.get(spaceId)!;
}

/**
 * Get random data sources (helper function)
 * @param count - Number of data sources to generate
 * @returns Array of random data sources
 */
export function getRandomDataSources(count: number): DataSource[] {
  return generateDataSourcesForSpace(`random-${Date.now()}`, count);
}
