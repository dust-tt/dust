import { z } from "zod";

import type { ModelId } from "./shared/model_id";

export const ANNOUNCEMENT_TYPES = ["changelog", "event"] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

export const announcementTypeSchema = z.enum(ANNOUNCEMENT_TYPES);

export const CHANGELOG_CATEGORIES = [
  "improvements",
  "fixes",
  "new_features",
  "api",
  "keyboard_shortcuts",
] as const;
export type ChangelogCategory = (typeof CHANGELOG_CATEGORIES)[number];

export interface AnnouncementContentType {
  id: ModelId;
  sId: string;
  createdAt: number;
  updatedAt: number;

  type: AnnouncementType;
  slug: string;
  title: string;
  description: string;
  content: string; // HTML content
  publishedAt: number | null;
  isPublished: boolean;
  showInAppBanner: boolean;

  // Event-specific fields
  eventDate: number | null;
  eventTimezone: string | null;
  eventLocation: string | null;
  eventUrl: string | null;

  // Changelog-specific fields
  categories: ChangelogCategory[] | null;
  tags: string[] | null;

  // Image
  imageFileId: string | null;
  imageUrl: string | null;
}

export interface LightAnnouncementType {
  sId: string;
  type: AnnouncementType;
  slug: string;
  title: string;
  description: string;
}

export interface AnnouncementWithDismissalType extends AnnouncementContentType {
  isDismissedByUser: boolean;
}
