// Pieces shared by the Pod settings tabs (General, Customization, Participants,
// Advanced) and their shell in PodSettingsSection.

import type { DataSource } from "../data/types";
import type { PodTabCustomizationItem } from "./PodCustomizationSection";

export interface PodTabCustomization {
  tabs: PodTabCustomizationItem[];
  addableFiles: DataSource[];
  onReorder: (draggedValue: string, targetValue: string) => void;
  onChangeIcon: (tabValue: string, iconName: string) => void;
  onRename: (tabValue: string, title: string) => void;
  onRemove: (tabValue: string) => void;
  onAdd: (file: DataSource) => void;
}

export interface PodSettingsMember {
  userId: string;
  joinedAt: Date;
  onClick?: () => void;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
