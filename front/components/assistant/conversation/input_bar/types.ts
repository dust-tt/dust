import type { DustError } from "@app/lib/error";
import type { GoalCreation } from "@app/types/assistant/goal";
import type { RichMention } from "@app/types/assistant/mentions";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { Result } from "@app/types/shared/result";

export type InputBarSubmitOptions = {
  selectedMCPServerViewIds?: string[];
  selectedSpaceIds?: string[];
  modelSelection?: ModelSelectionType;
  goal?: GoalCreation;
};

export type InputBarSubmit = (
  input: string,
  mentions: RichMention[],
  contentFragments: ContentFragmentsType,
  options: InputBarSubmitOptions
) => Promise<Result<undefined, DustError>>;
