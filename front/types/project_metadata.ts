export interface ProjectMetadataType {
  sId: string;
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  description: string | null;
  urls: Array<{ name: string; url: string }>;
}
