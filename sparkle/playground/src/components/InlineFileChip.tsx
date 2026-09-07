import {
  File02,
  Code01,
  Icon,
  Image01,
  NotionLogo,
  SlackLogo,
  Table,
  cn,
} from "@dust-tt/sparkle";
import React from "react";

// Supported file kinds for an inline file insert. Drives the icon shown in the
// chip and the icon used by the preview sheet.
export type FileInsertType =
  | "xlsx"
  | "csv"
  | "doc"
  | "docx"
  | "pdf"
  | "md"
  | "txt"
  | "code"
  | "image"
  | "slack"
  | "notion"
  | "document";

type IconComponent = React.ComponentType<{ className?: string }>;

// Map a file type to the icon used inside the chip. Tabular formats reuse the
// table glyph, brand types keep their logo, everything else falls back to the
// generic document icon (consistent with ConversationView's getCitationIcon).
export function fileTypeToIcon(fileType: FileInsertType): IconComponent {
  switch (fileType) {
    case "xlsx":
    case "csv":
      return Table;
    case "image":
      return Image01;
    case "slack":
      return SlackLogo;
    case "notion":
      return NotionLogo;
    case "code":
      return Code01;
    case "doc":
    case "docx":
    case "pdf":
    case "md":
    case "txt":
    case "document":
    default:
      return File02;
  }
}

// The payload handed to consumers when a chip is clicked. Mirrors what the
// ConversationView preview sheet needs to render a file.
export interface FileInsertTarget {
  id?: string;
  title: string;
  fileType: FileInsertType;
}

interface FileInsertContextValue {
  openFile: (file: FileInsertTarget) => void;
}

const FileInsertContext = React.createContext<FileInsertContextValue | null>(
  null
);

export function FileInsertProvider({
  openFile,
  children,
}: {
  openFile: (file: FileInsertTarget) => void;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ openFile }), [openFile]);
  return (
    <FileInsertContext.Provider value={value}>
      {children}
    </FileInsertContext.Provider>
  );
}

function useFileInsert(): FileInsertContextValue | null {
  return React.useContext(FileInsertContext);
}

interface InlineFileChipProps {
  label: string;
  fileType: FileInsertType;
  onClick?: () => void;
  className?: string;
}

// An inline, link-like file reference rendered within message text. No
// background or padding so it never affects line height: just an icon + label
// in the highlight color, underlined on hover. The icon is baseline-shifted to
// sit on the text line without growing the line box.
export const InlineFileChip = React.forwardRef<
  HTMLButtonElement,
  InlineFileChipProps
>(({ label, fileType, onClick, className }, ref) => {
  const IconComponent = fileTypeToIcon(fileType);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "inline cursor-pointer border-0 bg-transparent p-0",
        "font-medium text-highlight-500",
        "hover:underline",
        className
      )}
    >
      <Icon
        visual={IconComponent}
        size="xs"
        className="mr-0.5 inline-block align-[-0.15em]"
      />
      {label}
    </button>
  );
});

InlineFileChip.displayName = "InlineFileChip";

// Props injected by the fileChipDirective via hProperties. react-markdown also
// passes `node`, so we keep the extra props loose.
interface FileChipMarkdownProps {
  label?: string;
  fileType?: string;
  fileId?: string;
  [key: string]: unknown;
}

function normalizeFileType(value?: string): FileInsertType {
  const allowed: FileInsertType[] = [
    "xlsx",
    "csv",
    "doc",
    "docx",
    "pdf",
    "md",
    "txt",
    "code",
    "image",
    "slack",
    "notion",
    "document",
  ];
  if (value && (allowed as string[]).includes(value)) {
    return value as FileInsertType;
  }
  return "document";
}

// The component wired into Markdown's `file_chip` slot. Resolves the click
// handler from context so message bodies stay declarative.
export function FileChip({ label, fileType, fileId }: FileChipMarkdownProps) {
  const ctx = useFileInsert();
  const resolvedLabel = label ?? "File";
  const resolvedType = normalizeFileType(fileType);

  return (
    <InlineFileChip
      label={resolvedLabel}
      fileType={resolvedType}
      onClick={() =>
        ctx?.openFile({
          id: fileId,
          title: resolvedLabel,
          fileType: resolvedType,
        })
      }
    />
  );
}
