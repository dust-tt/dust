import { readFile } from "fs/promises";
import { Box, Text } from "ink";
import type { FC } from "react";
import React, { useState } from "react";

import { getDustClient } from "../../utils/dustClient.js";
import { normalizeError } from "../../utils/errors.js";
import type { FileInfo } from "../../utils/fileHandling.js";
import { formatFileSize, isImageFile } from "../../utils/fileHandling.js";

export interface UploadedFile {
  fileId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  path: string;
}

interface FileUploadProps {
  files: FileInfo[];
  onUploadComplete: (uploadedFiles: UploadedFile[]) => void;
  onUploadError: (error: string) => void;
  conversationId: string;
}

export const FileUpload: FC<FileUploadProps> = ({
  files,
  onUploadComplete,
  onUploadError,
  conversationId,
}) => {
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {}
  );
  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);

  const uploadFiles = async () => {
    if (files.length === 0) {
      return;
    }

    setIsUploading(true);
    const uploadedFiles: UploadedFile[] = [];

    try {
      const dustClientRes = await getDustClient();
      if (dustClientRes.isErr()) {
        onUploadError(`Failed to get client: ${dustClientRes.error.message}`);
        return;
      }

      const dustClient = dustClientRes.value;
      if (!dustClient) {
        onUploadError("Authentication required. Run `dust login` first.");
        return;
      }

      for (const file of files) {
        try {
          setUploadStatus((prev) => ({
            ...prev,
            [file.path]: "Reading file...",
          }));
          setUploadProgress((prev) => ({ ...prev, [file.path]: 10 }));

          const fileContent = await readFile(file.path);

          setUploadStatus((prev) => ({ ...prev, [file.path]: "Uploading..." }));
          setUploadProgress((prev) => ({ ...prev, [file.path]: 30 }));

          const fileObject = new File([Buffer.from(fileContent)], file.name, {
            type: file.type,
          });

          setUploadProgress((prev) => ({ ...prev, [file.path]: 50 }));

          const uploadResult = await dustClient.uploadFile({
            fileObject,
            fileName: file.name,
            fileSize: file.size,
            contentType: file.type,
            useCase: "conversation",
            useCaseMetadata: {
              conversationId,
            },
          });

          if (uploadResult.isErr()) {
            throw new Error(`Upload failed: ${uploadResult.error.message}`);
          }

          setUploadProgress((prev) => ({ ...prev, [file.path]: 100 }));
          setUploadStatus((prev) => ({
            ...prev,
            [file.path]: "Upload complete",
          }));

          uploadedFiles.push({
            fileId: uploadResult.value.id,
            fileName: file.name,
            fileSize: file.size,
            contentType: file.type,
            path: file.path,
          });
        } catch (error) {
          const errorMessage = normalizeError(error).message;
          setUploadStatus((prev) => ({
            ...prev,
            [file.path]: `Error: ${errorMessage}`,
          }));
          onUploadError(`Failed to upload ${file.name}: ${errorMessage}`);
          return;
        }
      }

      onUploadComplete(uploadedFiles);
    } catch (error) {
      onUploadError(`Upload failed: ${normalizeError(error).message}`);
    } finally {
      setIsUploading(false);
    }
  };

  React.useEffect(() => {
    if (files.length > 0 && !isUploading) {
      void uploadFiles();
    }
  }, [files]);

  if (files.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Box borderStyle="round" borderColor="blue" padding={1}>
        <Box flexDirection="column">
          <Text color="blue" bold>
            📁 Uploading {files.length} file{files.length > 1 ? "s" : ""}
          </Text>

          {files.map((file) => {
            const progress = uploadProgress[file.path] || 0;
            const status = uploadStatus[file.path] || "Pending...";
            const isImage = isImageFile(file.extension);

            return (
              <Box key={file.path} flexDirection="column" marginTop={1}>
                <Box>
                  <Text color={isImage ? "yellow" : "cyan"}>
                    {isImage ? "🖼️  " : "📄 "} {file.name}
                  </Text>
                  <Text color="gray"> ({formatFileSize(file.size)})</Text>
                  <Text color="gray"> {status} </Text>
                  {progress > 0 && progress < 100 && (
                    <Text>
                      {"█".repeat(Math.floor(progress / 5))}
                      {"░".repeat(20 - Math.floor(progress / 5))}
                    </Text>
                  )}
                  <Text color="gray">
                    {progress > 0 && progress < 100 && ` (${progress}%)`}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};
