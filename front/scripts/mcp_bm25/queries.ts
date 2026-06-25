// Labeled retrieval queries: realistic user intents mapped to the tool that
// should rank first. `expected` is server-qualified ("<server>.<tool>") because
// several servers expose the same tool name (e.g. copy_file, get_file_content).
// `maxRank` allows a query to pass when the expected tool is within the top N
// (default 1); use it only for genuinely ambiguous intents.
//
// Add a server to run.ts and its queries here as each server is reviewed.

export interface LabeledQuery {
  query: string;
  expected: string;
  maxRank?: number;
}

export const QUERIES: LabeledQuery[] = [
  // --- google_drive ---
  { query: "search google drive for the Q3 report", expected: "google_drive.search_files" },
  { query: "find my budget spreadsheet in google drive", expected: "google_drive.search_files" },
  { query: "list all my google drives", expected: "google_drive.list_drives" },
  { query: "read my google doc", expected: "google_drive.get_file_content" },
  { query: "open a file from google drive", expected: "google_drive.get_file_content" },
  { query: "clone this google doc", expected: "google_drive.copy_file" },
  { query: "duplicate a google slides template", expected: "google_drive.copy_file" },
  { query: "unshare a google drive file", expected: "google_drive.revoke_file_sharing" },
  { query: "stop sharing a google doc with someone", expected: "google_drive.revoke_file_sharing" },
  { query: "share a google doc with my colleague", expected: "google_drive.share_file" },
  { query: "create a new google spreadsheet", expected: "google_drive.create_spreadsheet" },
  { query: "make a new google slides deck", expected: "google_drive.create_presentation" },
  { query: "who has access to this google drive file", expected: "google_drive.list_file_permissions" },
  { query: "upload a file to google drive", expected: "google_drive.upload_file" },

  // --- microsoft_drive ---
  { query: "find my excel file in onedrive", expected: "microsoft_drive.search_drive_items" },
  { query: "find the budget file in sharepoint", expected: "microsoft_drive.search_drive_items" },
  { query: "what does my powerpoint in onedrive say about pricing", expected: "microsoft_drive.search_in_files" },
  { query: "search inside my onedrive files for the refund policy", expected: "microsoft_drive.search_in_files" },
  { query: "read my word doc in sharepoint", expected: "microsoft_drive.get_file_content" },
  { query: "open an excel file from onedrive", expected: "microsoft_drive.get_file_content" },
  { query: "edit my word document in onedrive", expected: "microsoft_drive.update_word_document" },
  { query: "clone a file in sharepoint", expected: "microsoft_drive.copy_file" },
  { query: "rename a folder in onedrive", expected: "microsoft_drive.rename_drive_item" },
  { query: "upload a file to sharepoint", expected: "microsoft_drive.upload_file" },
  { query: "list files in my onedrive folder", expected: "microsoft_drive.list_drive_items" },
  { query: "browse my sharepoint site", expected: "microsoft_drive.list_drive_items" },
];
