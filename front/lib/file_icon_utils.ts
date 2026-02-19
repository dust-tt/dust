import {
  ActionVolumeUpIcon,
  BracesIcon,
  DocumentIcon,
  GooglePdfLogo,
  ImageIcon,
  MicrosoftExcelLogo,
  MicrosoftWordLogo,
  TextIcon,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

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
    mimeTypes: [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    extensions: ["doc", "docx"],
  },
  {
    icon: MicrosoftExcelLogo,
    mimeTypes: [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    extensions: ["xls", "xlsx"],
  },
  {
    icon: TextIcon,
    mimeTypes: ["text/plain"],
    extensions: ["txt"],
  },
  {
    icon: BracesIcon,
    mimeTypes: ["text/markdown"],
    extensions: ["md", "markdown"],
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
