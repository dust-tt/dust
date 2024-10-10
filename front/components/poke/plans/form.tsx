import {
  Checkbox,
  ConfluenceLogo,
  DriveLogo,
  GithubLogo,
  GlobeAltIcon,
  Input,
  IntercomLogo,
  NotionLogo,
  SlackLogo,
} from "@dust-tt/sparkle";
import type { PlanType } from "@dust-tt/types";
import {
  assertNever,
  isMaxMessagesTimeframeType,
  MAX_MESSAGE_TIMEFRAMES,
} from "@dust-tt/types";
import { useCallback, useState } from "react";

import { classNames } from "@app/lib/utils";

export type EditingPlanType = {
  name: string;
  code: string;
  isConfluenceAllowed: boolean;
  isSlackBotAllowed: boolean;
  isSlackAllowed: boolean;
  isNotionAllowed: boolean;
  isGoogleDriveAllowed: boolean;
  isGithubAllowed: boolean;
  isIntercomAllowed: boolean;
  isWebCrawlerAllowed: boolean;
  maxMessages: string | number;
  maxMessagesTimeframe: string;
  dataSourcesCount: string | number;
  dataSourcesDocumentsCount: string | number;
  dataSourcesDocumentsSizeMb: string | number;
  maxUsers: string | number;
  maxVaults: string | number;
  isNewPlan?: boolean;
  trialPeriodDays: string | number;
};

export const fromPlanType = (plan: PlanType): EditingPlanType => {
  return {
    name: plan.name,
    code: plan.code,
    isConfluenceAllowed: plan.limits.connections.isConfluenceAllowed,
    isSlackBotAllowed: plan.limits.assistant.isSlackBotAllowed,
    isSlackAllowed: plan.limits.connections.isSlackAllowed,
    isNotionAllowed: plan.limits.connections.isNotionAllowed,
    isGoogleDriveAllowed: plan.limits.connections.isGoogleDriveAllowed,
    isGithubAllowed: plan.limits.connections.isGithubAllowed,
    isIntercomAllowed: plan.limits.connections.isIntercomAllowed,
    isWebCrawlerAllowed: plan.limits.connections.isWebCrawlerAllowed,
    maxMessages: plan.limits.assistant.maxMessages,
    maxMessagesTimeframe: plan.limits.assistant.maxMessagesTimeframe,
    dataSourcesCount: plan.limits.dataSources.count,
    dataSourcesDocumentsCount: plan.limits.dataSources.documents.count,
    dataSourcesDocumentsSizeMb: plan.limits.dataSources.documents.sizeMb,
    maxUsers: plan.limits.users.maxUsers,
    maxVaults: plan.limits.vaults.maxVaults,
    trialPeriodDays: plan.trialPeriodDays,
  };
};

export const toPlanType = (editingPlan: EditingPlanType): PlanType => {
  const parseMaybeNumber = (x: string | number) => {
    if (typeof x === "string") {
      return parseInt(x, 10);
    }
    return x;
  };
  if (!isMaxMessagesTimeframeType(editingPlan.maxMessagesTimeframe)) {
    throw new Error("Invalid maxMessagesTimeframe");
  }

  return {
    code: editingPlan.code.trim(),
    name: editingPlan.name.trim(),
    limits: {
      assistant: {
        isSlackBotAllowed: editingPlan.isSlackBotAllowed,
        maxMessages: parseMaybeNumber(editingPlan.maxMessages),
        maxMessagesTimeframe: editingPlan.maxMessagesTimeframe,
      },
      connections: {
        isConfluenceAllowed: editingPlan.isConfluenceAllowed,
        isSlackAllowed: editingPlan.isSlackAllowed,
        isNotionAllowed: editingPlan.isNotionAllowed,
        isGoogleDriveAllowed: editingPlan.isGoogleDriveAllowed,
        isGithubAllowed: editingPlan.isGithubAllowed,
        isIntercomAllowed: editingPlan.isIntercomAllowed,
        isWebCrawlerAllowed: editingPlan.isWebCrawlerAllowed,
      },
      dataSources: {
        count: parseMaybeNumber(editingPlan.dataSourcesCount),
        documents: {
          count: parseMaybeNumber(editingPlan.dataSourcesDocumentsCount),
          sizeMb: parseMaybeNumber(editingPlan.dataSourcesDocumentsSizeMb),
        },
      },
      users: {
        maxUsers: parseMaybeNumber(editingPlan.maxUsers),
      },
      vaults: {
        maxVaults: parseMaybeNumber(editingPlan.maxVaults),
      },
      canUseProduct: true,
    },
    trialPeriodDays: parseMaybeNumber(editingPlan.trialPeriodDays),
  };
};

const getEmptyPlan = (): EditingPlanType => ({
  name: "",
  code: "",
  isConfluenceAllowed: false,
  isSlackBotAllowed: false,
  isSlackAllowed: false,
  isNotionAllowed: false,
  isGoogleDriveAllowed: false,
  isGithubAllowed: false,
  isIntercomAllowed: false,
  isWebCrawlerAllowed: false,
  maxMessages: "",
  maxMessagesTimeframe: "day",
  dataSourcesCount: "",
  dataSourcesDocumentsCount: "",
  dataSourcesDocumentsSizeMb: "",
  maxUsers: "",
  maxVaults: "",
  isNewPlan: true,
  trialPeriodDays: 0,
});

export const useEditingPlan = () => {
  const [editingPlan, setEditingPlan] = useState<EditingPlanType | null>(null);

  const createNewPlan = useCallback(() => {
    setEditingPlan(getEmptyPlan());
  }, []);

  const resetEditingPlan = useCallback(() => {
    setEditingPlan(null);
  }, []);

  return { editingPlan, resetEditingPlan, createNewPlan, setEditingPlan };
};

export const PLAN_FIELDS = {
  name: {
    type: "string",
    width: "medium",
    title: "Name",
    error: (plan: EditingPlanType) => (plan.name ? null : "Name is required"),
  },
  code: {
    type: "string",
    width: "medium",
    title: "Plan Code",
    error: (plan: EditingPlanType) => {
      if (!plan.code) {
        return "Plan Code is required";
      }

      // only alphanumeric and underscore
      if (!/^[a-zA-Z0-9_]+$/.test(plan.code)) {
        return "Plan Code must only contain alphanumeric characters and underscores";
      }
    },
    immutable: true,
  },
  isSlackBotAllowed: {
    type: "boolean",
    width: "tiny",
    title: "Bot",
  },
  isConfluenceAllowed: {
    type: "boolean",
    width: "tiny",
    title: "Confluence",
    IconComponent: () => <ConfluenceLogo className="h-4 w-4" />,
  },
  isSlackAllowed: {
    type: "boolean",
    width: "tiny",
    title: "Slack",
    IconComponent: () => <SlackLogo className="h-4 w-4" />,
  },
  isNotionAllowed: {
    type: "boolean",
    width: "tiny",
    title: "Notion",
    IconComponent: () => <NotionLogo className="h-4 w-4" />,
  },
  isGoogleDriveAllowed: {
    type: "boolean",
    width: "tiny",
    title: "Drive",
    IconComponent: () => <DriveLogo className="h-4 w-4" />,
  },
  isGithubAllowed: {
    type: "boolean",
    width: "tiny",
    title: "Github",
    IconComponent: () => <GithubLogo className="h-4 w-4" />,
  },
  isIntercomAllowed: {
    type: "boolean",
    width: "tiny",
    title: "Intercom",
    IconComponent: () => <IntercomLogo className="h-4 w-4" />,
  },
  isWebCrawlerAllowed: {
    type: "boolean",
    width: "tiny",
    title: "Websites",
    IconComponent: () => <GlobeAltIcon className="h-4 w-4" />,
  },
  maxMessages: {
    type: "number",
    width: "small",
    title: "# Messages",
    error: (plan: EditingPlanType) => errorCheckNumber(plan.maxMessages),
  },
  maxMessagesTimeframe: {
    type: "string",
    width: "medium",
    title: "/ Timeframe / Seat",
    error: (plan: EditingPlanType) =>
      errorCheckMaxMessageTimeframe(plan.maxMessagesTimeframe),
  },
  dataSourcesCount: {
    type: "number",
    width: "small",
    title: "# DS",
    error: (plan: EditingPlanType) => errorCheckNumber(plan.dataSourcesCount),
  },
  dataSourcesDocumentsCount: {
    type: "number",
    width: "small",
    title: "# Docs",
    error: (plan: EditingPlanType) =>
      errorCheckNumber(plan.dataSourcesDocumentsCount),
  },
  dataSourcesDocumentsSizeMb: {
    type: "number",
    width: "small",
    title: "Size (MB)",
    error: (plan: EditingPlanType) =>
      errorCheckNumber(plan.dataSourcesDocumentsSizeMb),
  },
  maxUsers: {
    type: "number",
    width: "small",
    title: "# Users",
    error: (plan: EditingPlanType) => errorCheckNumber(plan.maxUsers),
  },
  maxVaults: {
    type: "number",
    width: "small",
    title: "# Vaults",
    error: (plan: EditingPlanType) => errorCheckNumber(plan.maxVaults),
  },
  trialPeriodDays: {
    type: "number",
    width: "small",
    title: "Trial Days",
    error: (plan: EditingPlanType) => {
      return errorCheckNumber(plan.trialPeriodDays);
    },
  },
} as const;

type FieldProps = {
  plan: EditingPlanType;
  fieldName: keyof typeof PLAN_FIELDS;
  isEditing: boolean;
  setEditingPlan: React.Dispatch<React.SetStateAction<EditingPlanType | null>>;
  editingPlan: EditingPlanType | null;
};

export const Field: React.FC<FieldProps> = ({
  plan,
  fieldName,
  isEditing,
  setEditingPlan,
  editingPlan,
}) => {
  const field = PLAN_FIELDS[fieldName];
  const isImmutable = "immutable" in field && field.immutable;
  const disabled = !editingPlan?.isNewPlan && isImmutable;

  const renderPlanFieldValue = (x: unknown) => {
    let strValue: string = x?.toString() || "";
    let classes = "";
    if (typeof x === "string") {
      if (!x) {
        strValue = "NULL";
        classes = classNames(classes, "italic text-element-600");
      }
    }
    if (typeof x === "number") {
      if (x === -1) {
        strValue = "∞";
      }
    }

    return <div className={classes}>{strValue}</div>;
  };

  const fieldNode = (() => {
    switch (field.type) {
      case "string":
      case "number":
        return isEditing && !disabled ? (
          <Input
            className="px-2"
            value={editingPlan && editingPlan[fieldName].toString()}
            onChange={(x) => {
              if (!editingPlan) {
                return;
              }
              setEditingPlan({ ...editingPlan, [fieldName]: x });
            }}
            name={fieldName}
            error={editingPlan && field.error(editingPlan)}
          />
        ) : (
          renderPlanFieldValue(plan[fieldName])
        );

      case "boolean":
        const fieldValue =
          editingPlan && isEditing ? editingPlan[fieldName] : plan[fieldName];
        const checkedStatus = fieldValue ? "checked" : "unchecked";

        return (
          <Checkbox
            checked={checkedStatus}
            onChange={(x) => {
              if (!editingPlan) {
                return;
              }
              setEditingPlan({ ...editingPlan, [fieldName]: x });
            }}
          />
        );
      default:
        assertNever(field);
    }
  })();

  const widthClass = (() => {
    switch (field.width) {
      case "small":
        return "w-24 min-w-[6rem]";
      case "medium":
        return "max-w-48 min-w-[8rem]";
      case "tiny":
        return "min-w-[1rem]";
      default:
        assertNever(field);
    }
  })();

  return (
    <td
      className={classNames("flex-none border px-1 py-2 text-sm", widthClass)}
    >
      {fieldNode}
    </td>
  );
};

const errorCheckNumber = (value: string | number | undefined | null) => {
  if (value === undefined || value === null || value === "") {
    return "This field is required";
  }

  const parsed: number =
    typeof value === "number" ? value : parseInt(value.toString(), 10);

  if (isNaN(parsed)) {
    return "This field must be a number";
  }

  if (parsed < -1) {
    return "This field must be positive or -1 (unlimited)";
  }

  return null;
};

const errorCheckMaxMessageTimeframe = (value: string) => {
  if (!isMaxMessagesTimeframeType(value)) {
    return `Invalid messages timeframe. Must be one of ${MAX_MESSAGE_TIMEFRAMES.join(
      ", "
    )}. Is: ${value}`;
  }

  return null;
};
