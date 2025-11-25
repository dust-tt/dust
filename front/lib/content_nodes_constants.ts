// Okay to use public API types as it's about internal types between connector and front that public API users do not care about.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

// Since titles will be synced in ES we don't support arbitrarily large titles.
export const MAX_NODE_TITLE_LENGTH = 512;

// Mime types that should be represented with a Channel icon.
export const CHANNEL_INTERNAL_MIME_TYPES = [
  INTERNAL_MIME_TYPES.GITHUB.DISCUSSIONS,
  INTERNAL_MIME_TYPES.INTERCOM.TEAM,
  INTERNAL_MIME_TYPES.INTERCOM.TEAMS_FOLDER,
  INTERNAL_MIME_TYPES.SLACK.CHANNEL,
] as readonly string[];

// Mime types that should be represented with a Database icon but are not of type "table".
export const DATABASE_INTERNAL_MIME_TYPES = [
  INTERNAL_MIME_TYPES.GITHUB.ISSUES,
] as readonly string[];

// Mime types that should be represented with a File icon but are not of type "document".
export const FILE_INTERNAL_MIME_TYPES = [
  INTERNAL_MIME_TYPES.WEBCRAWLER.FOLDER,
] as readonly string[];

// Mime types that should be represented with a Spreadsheet icon, despite being of type "folder".
export const SPREADSHEET_INTERNAL_MIME_TYPES = [
  INTERNAL_MIME_TYPES.GOOGLE_DRIVE.SPREADSHEET,
  INTERNAL_MIME_TYPES.MICROSOFT.SPREADSHEET,
  INTERNAL_MIME_TYPES.FOLDER.SPREADSHEET,
] as readonly string[];
