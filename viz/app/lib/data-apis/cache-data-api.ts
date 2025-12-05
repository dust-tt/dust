import type { VisualizationDataAPI } from "@viz/app/lib/visualization-api";

export interface PreFetchedFile {
  data: string; // base64
  fileId: string;
  mimeType: string;
}

/**
 * Cache-based data API for server-side rendered components
 * Uses pre-fetched data passed as props, no network requests needed.
 */
export class CacheDataAPI implements VisualizationDataAPI {
  private codeCache: string | null;
  private fileCache: Map<string, File>;

  constructor(prefetchedFiles: PreFetchedFile[] = [], prefetchedCode?: string) {
    this.codeCache = prefetchedCode || null;
    this.fileCache = new Map();

    // Populate file cache from pre-fetched data.
    for (const fileData of prefetchedFiles) {
      try {
        const binaryString = atob(fileData.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const file = new File([bytes], fileData.fileId, {
          type: fileData.mimeType,
        });

        this.fileCache.set(fileData.fileId, file);
      } catch (error) {
        console.error(
          `Failed to decode pre-fetched file ${fileData.fileId}:`,
          error
        );
      }
    }
  }

  async fetchFile(fileId: string): Promise<File | null> {
    return this.fileCache.get(fileId) || null;
  }

  async fetchCode(): Promise<string | null> {
    return this.codeCache;
  }
}
