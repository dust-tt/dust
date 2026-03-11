import { frameContentType, frameSlideshowContentType } from "@app/types/files";
import {
  ActionFrameIcon,
  ActionVolumeUpIcon,
  BigQueryLogo,
  BracesIcon,
  ConfluenceLogo,
  DocumentIcon,
  DriveLogo,
  DustLogoSquare,
  GithubLogo,
  GongLogo,
  GoogleDocLogo,
  GooglePdfLogo,
  GoogleSlideLogo,
  GoogleSpreadsheetLogo,
  ImageIcon,
  IntercomLogo,
  MicrosoftExcelLogo,
  MicrosoftLogo,
  MicrosoftPowerpointLogo,
  MicrosoftWordLogo,
  NotionLogo,
  SalesforceLogo,
  SlackLogo,
  SnowflakeLogo,
  TableIcon,
  TextIcon,
  ZendeskLogo,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

const DUST_MIME_PREFIX = "application/vnd.dust.";
const VND_MIME_PREFIX = "application/vnd.";

/** Map provider segment from Dust internal MIME (e.g. "notion", "googledrive") to colored logo. */
const INTERNAL_PROVIDER_ICONS: Record<string, ComponentType> = {
  notion: NotionLogo,
  bigquery: BigQueryLogo,
  googledrive: DriveLogo,
  confluence: ConfluenceLogo,
  slack: SlackLogo,
  github: GithubLogo,
  microsoft: MicrosoftLogo,
  intercom: IntercomLogo,
  zendesk: ZendeskLogo,
  snowflake: SnowflakeLogo,
  salesforce: SalesforceLogo,
  gong: GongLogo,
  dustproject: DustLogoSquare,
};

/**
 * Generic map for application/vnd.{vendor}.{subtype} MIME types.
 * Add new types under the vendor key; no need to touch the lookup logic.
 * e.g. application/vnd.google-apps.document → vendor "google-apps", subtype "document"
 */
const VND_VENDOR_SUBTYPE_ICONS: Record<
  string,
  Record<string, ComponentType>
> = {
  "google-apps": {
    document: GoogleDocLogo,
    spreadsheet: GoogleSpreadsheetLogo,
    presentation: GoogleSlideLogo,
  },
  "openxmlformats-officedocument": {
    "wordprocessingml.document": MicrosoftWordLogo,
    "spreadsheetml.sheet": MicrosoftExcelLogo,
    "presentationml.presentation": MicrosoftPowerpointLogo,
  },
};

interface FileTypeMapping {
  icon: ComponentType;
  mimeTypes: string[];
  extensions: string[];
}

const FILE_TYPE_MAPPINGS: FileTypeMapping[] = [
  {
    icon: GooglePdfLogo,
    mimeTypes: ["application/pdf"],
    extensions: ["pdf"],
  },
  {
    icon: MicrosoftWordLogo,
    mimeTypes: ["application/msword"],
    extensions: ["doc", "docx"],
  },
  {
    icon: MicrosoftExcelLogo,
    mimeTypes: ["application/vnd.ms-excel"],
    extensions: ["xls", "xlsx"],
  },
  {
    icon: TableIcon,
    mimeTypes: ["text/csv", "text/tab-separated-values"],
    extensions: ["csv", "tsv"],
  },
  {
    icon: TextIcon,
    mimeTypes: ["text/plain"],
    extensions: ["txt"],
  },
  {
    icon: BracesIcon,
    mimeTypes: ["text/markdown", "application/json"],
    extensions: ["md", "markdown", "json"],
  },
  {
    icon: ActionFrameIcon,
    mimeTypes: [frameContentType, frameSlideshowContentType],
    extensions: [".js", ".jsx", ".ts", ".tsx"],
  },
];

function getExtension(fileName: string): string | undefined {
  return fileName.split(".").pop()?.toLowerCase();
}

/**
 * Maps file content types and extensions to appropriate icons.
 * Uses platform-specific logos (PDF, Word, Excel) when available.
 */
export function getFileTypeIcon(
  contentType: string,
  fileName?: string
): ComponentType {
  // Check prefix-based content types first
  if (contentType.startsWith("image/")) {
    return ImageIcon;
  }
  if (contentType.startsWith("audio/")) {
    return ActionVolumeUpIcon;
  }

  // Internal Dust types (Notion, BigQuery, Slack, etc.) – use colored provider logos
  if (contentType.startsWith(DUST_MIME_PREFIX)) {
    const suffix = contentType.slice(DUST_MIME_PREFIX.length);
    const provider = suffix.split(".")[0]?.toLowerCase();
    if (provider && provider in INTERNAL_PROVIDER_ICONS) {
      return INTERNAL_PROVIDER_ICONS[provider];
    }
  }

  // Generic application/vnd.{vendor}.{subtype} lookup (Google Apps, Office Open XML, etc.)
  if (contentType.startsWith(VND_MIME_PREFIX)) {
    const suffix = contentType.slice(VND_MIME_PREFIX.length);
    const parts = suffix.split(".");
    const vendor = parts[0]?.toLowerCase();
    const subtype = parts.slice(1).join(".").toLowerCase();
    if (vendor && subtype) {
      const vendorMap = VND_VENDOR_SUBTYPE_ICONS[vendor];
      if (vendorMap && subtype in vendorMap) {
        return vendorMap[subtype];
      }
    }
  }

  const extension = fileName ? getExtension(fileName) : undefined;

  // Check against mappings (MIME type takes priority, then extension)
  for (const mapping of FILE_TYPE_MAPPINGS) {
    if (mapping.mimeTypes.includes(contentType)) {
      return mapping.icon;
    }
    if (extension && mapping.extensions.includes(extension)) {
      return mapping.icon;
    }
  }

  return DocumentIcon;
}
