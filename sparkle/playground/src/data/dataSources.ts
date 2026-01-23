import {
  CodeBlockIcon,
  GooglePdfLogo,
  MicrosoftExcelLogo,
  MicrosoftPowerpointLogo,
  MicrosoftWordLogo,
  TextIcon,
} from "@dust-tt/sparkle";
import React from "react";

import type { DataSource, User } from "./types";
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
  "TODO_List",
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

// Generate a file name based on type and index
function generateFileName(
  fileType: DataSource["fileType"],
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
  }

  const baseName = nameList[Math.floor(random * nameList.length)];
  const suffix = index > nameList.length ? `_${index}` : "";
  return `${baseName}${suffix}.${fileType}`;
}

// Generate file type distribution: 30% PDF, 20% docx, 15% xlsx, 10% pptx, 10% txt, 10% md, 5% doc
function getFileTypeForIndex(
  index: number,
  seed: string
): DataSource["fileType"] {
  const random = seededRandom(seed, index * 2);
  const value = random * 100;

  if (value < 30) return "pdf";
  if (value < 50) return "docx";
  if (value < 65) return "xlsx";
  if (value < 75) return "pptx";
  if (value < 85) return "txt";
  if (value < 95) return "md";
  return "doc";
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
  fileType: DataSource["fileType"]
): React.ComponentType<{ className?: string }> {
  switch (fileType) {
    case "pdf":
      return GooglePdfLogo;
    case "doc":
    case "docx":
      return MicrosoftWordLogo;
    case "xlsx":
      return MicrosoftExcelLogo;
    case "pptx":
      return MicrosoftPowerpointLogo;
    case "txt":
      return TextIcon;
    case "md":
      return CodeBlockIcon;
    default:
      return GooglePdfLogo;
  }
}

// Generate data sources for a space
function generateDataSourcesForSpace(
  spaceId: string,
  count: number
): DataSource[] {
  const dataSources: DataSource[] = [];

  for (let i = 0; i < count; i++) {
    const fileType = getFileTypeForIndex(i, spaceId);
    const fileName = generateFileName(fileType, i, spaceId);
    const { createdAt, updatedAt } = generateDates(i, spaceId);
    const createdBy = getRandomUserId(i, spaceId);

    dataSources.push({
      id: `ds-${spaceId}-${i}`,
      fileName,
      fileType,
      createdBy,
      createdAt,
      updatedAt,
      icon: getIconForFileType(fileType),
    });
  }

  return dataSources;
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
