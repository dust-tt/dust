export type Project = {
  project_id: number;
};

export type ProjectStatus = "active" | "paused" | "completed" | "archived";

export type ProjectExternalLink = {
  title: string;
  url: string;
};

export type ProjectMetadataType = {
  id: number;
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  status: ProjectStatus;
  description: string | null;
  tags: string[] | null;
  externalLinks: ProjectExternalLink[] | null;
};
