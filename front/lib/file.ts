// These are the front-end helpers.

function isMarkdownFile(file: File): boolean {
  if (file.type === "") {
    const fileExtension = file.name.split(".").at(-1)?.toLowerCase();
    // Check if the file extension corresponds to a markdown file
    return fileExtension === "md" || fileExtension === "markdown";
  }
  return file.type === "text/markdown";
}

export function getMimeTypeFromFile(file: File): string {
  if (isMarkdownFile(file)) {
    return "text/markdown";
  }

  return file.type;
}
