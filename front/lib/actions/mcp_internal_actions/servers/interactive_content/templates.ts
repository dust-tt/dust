import { cleanTemplate } from "./templates/clean";
import { minimalTemplate } from "./templates/minimal";
import { modernTemplate } from "./templates/modern";

export interface SlideTemplate {
  id: string;
  name: string;
  description: string;
  type: "slides" | "dashboard" | "all";
  structure: string;
  code: string;
}

export const SLIDE_TEMPLATES: Record<string, SlideTemplate> = {
  minimal: minimalTemplate,
  modern: modernTemplate,
  clean: cleanTemplate,
};

export function getTemplate(templateId: string): SlideTemplate | null {
  return SLIDE_TEMPLATES[templateId] || null;
}

export function listTemplates(type?: string): SlideTemplate[] {
  const templates = Object.values(SLIDE_TEMPLATES);
  if (type) {
    return templates.filter((t) => t.type === type || t.type === "all");
  }
  return templates;
}
