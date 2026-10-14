import type {
  DocumentEmbeddableFile,
  DocumentEmbeddableFiles,
} from "@app/components/editor/document/types";

// Sync, in-memory factory: files a document's `/` menu offers to embed.
export class DocumentEmbeddableFileFactory {
  static image(
    path: string,
    name = path.slice(path.lastIndexOf("/") + 1)
  ): DocumentEmbeddableFile {
    return { kind: "image", path, name };
  }

  static frame(path: string): DocumentEmbeddableFile {
    return { kind: "frame", path, name: path.slice(path.lastIndexOf("/") + 1) };
  }

  static files(
    overrides: Partial<DocumentEmbeddableFiles> = {}
  ): DocumentEmbeddableFiles {
    return { files: [], isLoading: false, load: () => undefined, ...overrides };
  }
}
