function fileDescribeText({
  filename,
  textContent,
}: {
  filename: string;
  textContent: string | null;
}): { filename: string; description: string | null } {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (!extension) {
    return { filename, description: "Unknown file type" };
  }
  switch (extension) {
    case "csv": {
      if (!textContent || textContent.trim().length === 0) {
        return { filename, description: "Empty CSV file" };
      }
      const lines = textContent.split("\n");
      const description = lines.slice(0, 5).join("\n");
      if (description.length > textContent.length) {
        return { filename, description: textContent + "\n(truncated...)" };
      } else {
        return { filename, description };
      }
    }
    default: {
      return {
        filename,
        description: textContent
          ? textContent.slice(0, 200) + "\n(truncated...)"
          : null,
      };
    }
  }
}

export function describeFile({
  filename,
  content,
}: {
  filename: string;
  content: string | Buffer;
}) {
  if (Buffer.isBuffer(content)) {
    return { filename, description: null };
  } else if (typeof content === "string") {
    return fileDescribeText({ filename, textContent: content });
  }
}
