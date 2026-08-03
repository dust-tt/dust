import type {
  FileShareScope,
  FileTypeWithMetadata,
  SharingGrantType,
} from "@app/types/files";

export interface GetPokeFileResponseBody {
  content: string;
  file: FileTypeWithMetadata;
  shareInfo: {
    scope: FileShareScope;
    sharedAt: number;
    shareUrl: string;
  } | null;
  sharingGrants: SharingGrantType[];
}
