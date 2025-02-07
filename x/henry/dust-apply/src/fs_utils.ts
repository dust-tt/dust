import { promises as fs } from "fs";
import * as path from "path";

export type FileSystem = {
  readText: (path: string) => Promise<string | null>;

  writeText: (path: string, content: string) => Promise<void>;

  exists: (path: string) => Promise<boolean>;

  touch: (path: string) => Promise<void>;
};

export const fileSystem: FileSystem = {
  readText: async (filePath) => {
    console.debug("Reading file:", filePath);
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (err) {
      if ((err as { code?: string }).code === "ENOENT") {
        console.debug("File not found:", filePath);
        return null;
      }
      throw err;
    }
  },
  writeText: async (filePath, content) => {
    console.debug("Writing file:", filePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
    console.debug("File written:", filePath);
  },
  exists: async (filePath) => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  },
  touch: async (filePath) => {
    console.debug("Touching file:", filePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "", "utf8");
    console.debug("File touched:", filePath);
  },
};
