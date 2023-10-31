import { Checkbox, Input } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

import { assertNever, classNames } from "@app/lib/utils";
import { PokePlanType } from "@app/pages/api/poke/plans";

export type EditingPlanType = {
  name: string;
  stripeProductId: string;
  code: string;
  isSlackBotAllowed: boolean;
  isSlackAllowed: boolean;
  isNotionAllowed: boolean;
  isGoogleDriveAllowed: boolean;
  isGithubAllowed: boolean;
  maxMessages: string | number;
  dataSourcesCount: string | number;
  dataSourcesDocumentsCount: string | number;
  dataSourcesDocumentsSizeMb: string | number;
  maxUsers: string | number;
  billingType: "fixed" | "free" | "monthly_active_users";
  isNewPlan?: boolean;
};

export const fromPokePlanType = (plan: PokePlanType): EditingPlanType => {
  return {
    name: plan.name,
    stripeProductId: plan.stripeProductId || "",
    code: plan.code,
    isSlackBotAllowed: plan.limits.assistant.isSlackBotAllowed,
    isSlackAllowed: plan.limits.connections.isSlackAllowed,
    isNotionAllowed: plan.limits.connections.isNotionAllowed,
    isGoogleDriveAllowed: plan.limits.connections.isGoogleDriveAllowed,
    isGithubAllowed: plan.limits.connections.isGithubAllowed,
    maxMessages: plan.limits.assistant.maxMessages,
    dataSourcesCount: plan.limits.dataSources.count,
    dataSourcesDocumentsCount: plan.limits.dataSources.documents.count,
    dataSourcesDocumentsSizeMb: plan.limits.dataSources.documents.sizeMb,
    maxUsers: plan.limits.users.maxUsers,
    billingType: plan.billingType,
  };
};

export const toPokePlanType = (editingPlan: EditingPlanType): PokePlanType => {
  return {
    code: editingPlan.code.trim(),
    name: editingPlan.name.trim(),
    stripeProductId: editingPlan.stripeProductId.trim() || null,
    limits: {
      assistant: {
        isSlackBotAllowed: editingPlan.isSlackBotAllowed,
        maxMessages: parseInt(editingPlan.maxMessages.toString(), 10),
      },
      connections: {
        isSlackAllowed: editingPlan.isSlackAllowed,
        isNotionAllowed: editingPlan.isNotionAllowed,
        isGoogleDriveAllowed: editingPlan.isGoogleDriveAllowed,
        isGithubAllowed: editingPlan.isGithubAllowed,
      },
      dataSources: {
        count: parseInt(editingPlan.dataSourcesCount.toString(), 10),
        documents: {
          count: parseInt(editingPlan.dataSourcesDocumentsCount.toString(), 10),
          sizeMb: parseInt(
            editingPlan.dataSourcesDocumentsSizeMb.toString(),
            10
          ),
        },
      },
      users: {
        maxUsers: parseInt(editingPlan.maxUsers.toString(), 10),
      },
    },
    billingType: editingPlan.billingType,
  };
};

const getEmptyPlan = (): EditingPlanType => ({
  name: "",
  stripeProductId: "",
  code: "",
  isSlackBotAllowed: false,
  isSlackAllowed: false,
  isNotionAllowed: false,
  isGoogleDriveAllowed: false,
  isGithubAllowed: false,
  maxMessages: "",
  dataSourcesCount: "",
  dataSourcesDocumentsCount: "",
  dataSourcesDocumentsSizeMb: "",
  maxUsers: "",
  isNewPlan: true,
  billingType: "fixed",
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
  stripeProductId: {
    type: "string",
    width: "large",
    title: "Stripe Product ID",
    error: (plan: EditingPlanType) => {
      if (!plan.stripeProductId) {
        return null;
      }

      // only alphanumeric and underscore
      if (!/^[a-zA-Z0-9_]+$/.test(plan.stripeProductId)) {
        return "Stripe Product ID must only contain alphanumeric characters and underscores";
      }

      return null;
    },
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
  isSlackAllowed: {
    type: "boolean",
    width: "tiny",
    title: "Slack",
  },
  isNotionAllowed: {
    type: "boolean",
    width: "tiny",
    title: "Notion",
  },
  isGoogleDriveAllowed: {
    type: "boolean",
    width: "tiny",
    title: "Drive",
  },
  isGithubAllowed: {
    type: "boolean",
    width: "tiny",
    title: "Github",
  },
  maxMessages: {
    type: "number",
    width: "medium",
    title: "# Messages",
    error: (plan: EditingPlanType) => errorCheckNumber(plan.maxMessages),
  },
  dataSourcesCount: {
    type: "number",
    width: "medium",
    title: "# DS",
    error: (plan: EditingPlanType) => errorCheckNumber(plan.dataSourcesCount),
  },
  dataSourcesDocumentsCount: {
    type: "number",
    width: "medium",
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
    width: "medium",
    title: "# Users",
    error: (plan: EditingPlanType) => errorCheckNumber(plan.maxUsers),
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

  const fieldNode = (() => {
    switch (field.type) {
      case "string":
      case "number":
        return isEditing && !disabled ? (
          <Input
            value={editingPlan && editingPlan[fieldName].toString()}
            onChange={(x) => {
              if (!editingPlan) {
                return;
              }
              setEditingPlan({ ...editingPlan, [fieldName]: x });
            }}
            placeholder=""
            name={fieldName}
            error={editingPlan && field.error(editingPlan)}
            showErrorLabel={false}
          />
        ) : (
          <div
            className={classNames(
              plan[fieldName] === null ? "italic text-element-600" : ""
            )}
          >
            {plan[fieldName] === null
              ? "NULL"
              : field.type == "number" && plan[fieldName] === "-1"
              ? "∞"
              : plan[fieldName]?.toString()}
          </div>
        );
      case "boolean":
        return (
          <Checkbox
            checked={
              editingPlan && isEditing
                ? !!editingPlan[fieldName]
                : !!plan[fieldName]
            }
            onChange={(x) => {
              if (!editingPlan) {
                return;
              }
              setEditingPlan({ ...editingPlan, [fieldName]: x });
            }}
            disabled={!isEditing || disabled}
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
      case "large":
        return "w-72 min-w-[12rem]";
      case "medium":
        return "max-w-48 min-w-[8rem]";
      case "tiny":
        return "min-w-[3rem]";
      default:
        assertNever(field);
    }
  })();

  return (
    <td
      className={classNames("flex-none border px-4 py-2 text-sm", widthClass)}
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
