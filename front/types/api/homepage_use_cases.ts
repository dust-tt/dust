import type { SkillReference } from "@app/lib/skills/format";
import type { ToolReference } from "@app/lib/tools/format";
import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/types/resources_icon_names";

export interface HomepageUseCaseType {
  id: string;
  label: string;
  prompt: string;
  icon: InternalAllowedIconType | CustomResourceIconType;
  skills: SkillReference[];
  tools: ToolReference[];
}

export interface GetHomepageUseCasesResponseBody {
  useCases: HomepageUseCaseType[];
}
