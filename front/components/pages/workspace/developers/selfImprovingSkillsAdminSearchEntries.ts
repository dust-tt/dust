import {
  ALLOW_SELF_IMPROVING_SKILLS_LABEL,
  DEFAULT_COST_CAP_PER_SKILL_LABEL,
  ENABLE_BATCH_PROCESSING_LABEL,
  GLOBAL_SPENDING_CAP_LABEL,
  SELF_IMPROVING_CONSUMPTION_SECTION_LABEL,
  SELF_IMPROVING_SKILLS_LIST_SECTION_LABEL,
} from "@app/components/workspace/settings/SelfImprovingSkillsSettingsSection";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const S = ADMIN_SECTION_IDS.selfImprovingSkills;
const PAGE = "self_improving_skills" as const;

/** Search entries for Self-Improving Skills. */
export const SELF_IMPROVING_SKILLS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, S.settings, [
    [
      ALLOW_SELF_IMPROVING_SKILLS_LABEL,
      "self improving skills reinforcement analyze conversations",
    ],
    [
      ENABLE_BATCH_PROCESSING_LABEL,
      "self improving skills zdr immediate data deletion batches",
    ],
    [GLOBAL_SPENDING_CAP_LABEL, "self improving skills monthly cap credits"],
    [DEFAULT_COST_CAP_PER_SKILL_LABEL, "self improving skills per run cap"],
  ]),
  ...adminSearchEntries(PAGE, S.consumption, [
    [
      SELF_IMPROVING_CONSUMPTION_SECTION_LABEL,
      "self improving skills consumption current period spend",
    ],
  ]),
  ...adminSearchEntries(PAGE, S.skills, [
    [
      SELF_IMPROVING_SKILLS_LIST_SECTION_LABEL,
      "per skill editors enabled currently spent lock state",
    ],
  ]),
];
