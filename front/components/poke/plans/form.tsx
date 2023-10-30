import { Checkbox, Input } from "@dust-tt/sparkle";

import { assertNever, classNames } from "@app/lib/utils";
import { PokePlanType } from "@app/pages/api/poke/plans";

// convert all numbers to strings
type DeepNumbersAsStrings<T> = {
  [K in keyof T]: T[K] extends number
    ? string | number
    : T[K] extends object
    ? DeepNumbersAsStrings<T[K]>
    : T[K];
};
export type EditingPlanType = DeepNumbersAsStrings<PokePlanType> & {
  isNewPlan?: boolean;
};

export const PLAN_FIELDS = {
  name: {
    type: "string",
    set: (plan: EditingPlanType, value: string) => ({
      ...plan,
      name: value,
    }),
    value: (plan: EditingPlanType) => plan.name,
    width: "medium",
    title: "Name",
    error: (plan: EditingPlanType) => (plan.name ? null : "Name is required"),
  },
  stripeProductId: {
    type: "string",
    set: (plan: EditingPlanType, value: string) => ({
      ...plan,
      stripeProductId: value,
    }),
    value: (plan: EditingPlanType) => plan.stripeProductId,
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
    set: (plan: EditingPlanType, value: string) => ({
      ...plan,
      code: value,
    }),
    value: (plan: EditingPlanType) => plan.code,
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
    set: (plan: EditingPlanType, value: boolean) => ({
      ...plan,
      limits: {
        ...plan.limits,
        assistant: {
          ...plan.limits.assistant,
          isSlackBotAllowed: value,
        },
      },
    }),
    value: (plan: EditingPlanType) => plan.limits.assistant.isSlackBotAllowed,
    width: "tiny",
    title: "Bot",
  },
  isSlackAllowed: {
    type: "boolean",
    set: (plan: EditingPlanType, value: boolean) => ({
      ...plan,
      limits: {
        ...plan.limits,
        connections: {
          ...plan.limits.connections,
          isSlackAllowed: value,
        },
      },
    }),
    value: (plan: EditingPlanType) => plan.limits.connections.isSlackAllowed,
    width: "tiny",
    title: "Slack",
  },
  isNotionAllowed: {
    type: "boolean",
    set: (plan: EditingPlanType, value: boolean) => ({
      ...plan,
      limits: {
        ...plan.limits,
        connections: {
          ...plan.limits.connections,
          isNotionAllowed: value,
        },
      },
    }),
    value: (plan: EditingPlanType) => plan.limits.connections.isNotionAllowed,
    width: "tiny",
    title: "Notion",
  },
  isGoogleDriveAllowed: {
    type: "boolean",
    set: (plan: EditingPlanType, value: boolean) => ({
      ...plan,
      limits: {
        ...plan.limits,
        connections: {
          ...plan.limits.connections,
          isGoogleDriveAllowed: value,
        },
      },
    }),
    value: (plan: EditingPlanType) =>
      plan.limits.connections.isGoogleDriveAllowed,
    width: "tiny",
    title: "Drive",
  },
  isGithubAllowed: {
    type: "boolean",
    set: (plan: EditingPlanType, value: boolean) => ({
      ...plan,
      limits: {
        ...plan.limits,
        connections: {
          ...plan.limits.connections,
          isGithubAllowed: value,
        },
      },
    }),
    value: (plan: EditingPlanType) => plan.limits.connections.isGithubAllowed,
    width: "tiny",
    title: "Github",
  },
  dataSourcesCount: {
    type: "number",
    set: (plan: EditingPlanType, value: string) => ({
      ...plan,
      limits: {
        ...plan.limits,
        dataSources: {
          ...plan.limits.dataSources,
          count: value,
        },
      },
    }),
    value: (plan: EditingPlanType) => plan.limits.dataSources.count,
    width: "medium",
    title: "# DS",
    error: (plan: EditingPlanType) =>
      errorCheckNumber(plan.limits.dataSources.count),
  },
  dataSourcesDocumentsCount: {
    type: "number",
    set: (plan: EditingPlanType, value: string) => ({
      ...plan,
      limits: {
        ...plan.limits,
        dataSources: {
          ...plan.limits.dataSources,
          documents: {
            ...plan.limits.dataSources.documents,
            count: value,
          },
        },
      },
    }),
    value: (plan: EditingPlanType) => plan.limits.dataSources.documents.count,
    width: "medium",
    title: "# Docs",
    error: (plan: EditingPlanType) =>
      errorCheckNumber(plan.limits.dataSources.documents.count),
  },
  dataSourcesDocumentsSizeMb: {
    type: "number",
    set: (plan: EditingPlanType, value: string) => ({
      ...plan,
      limits: {
        ...plan.limits,
        dataSources: {
          ...plan.limits.dataSources,
          documents: {
            ...plan.limits.dataSources.documents,
            sizeMb: value,
          },
        },
      },
    }),
    value: (plan: EditingPlanType) => plan.limits.dataSources.documents.sizeMb,
    width: "small",
    title: "Size (MB)",
    error: (plan: EditingPlanType) =>
      errorCheckNumber(plan.limits.dataSources.documents.sizeMb),
  },
  maxUsers: {
    type: "number",
    set: (plan: EditingPlanType, value: string) => ({
      ...plan,
      limits: {
        ...plan.limits,
        users: {
          ...plan.limits.users,
          maxUsers: value,
        },
      },
    }),
    value: (plan: EditingPlanType) => plan.limits.users.maxUsers,
    width: "medium",
    title: "# Users",
    error: (plan: EditingPlanType) =>
      errorCheckNumber(plan.limits.users.maxUsers),
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
  const fieldNode = (() => {
    switch (field.type) {
      case "string":
        return (
          <TextField
            name={fieldName}
            isEditing={isEditing}
            value={(editingPlan && field.value(editingPlan)) || ""}
            onChange={(x) => {
              if (!editingPlan) {
                return;
              }
              setEditingPlan({ ...field.set(editingPlan, x) });
            }}
            readOnlyValue={field.value(plan)}
            error={editingPlan && field.error(editingPlan)}
            disabled={!editingPlan?.isNewPlan && isImmutable}
          />
        );
      case "boolean":
        return (
          <BooleanField
            name={fieldName}
            isEditing={isEditing}
            checked={(editingPlan && field.value(editingPlan)) || false}
            onChange={(x) => {
              if (!editingPlan) {
                return;
              }
              setEditingPlan(field.set(editingPlan, x));
            }}
            readOnlyChecked={field.value(plan)}
            disabled={!editingPlan?.isNewPlan && isImmutable}
          />
        );
      case "number":
        return (
          <NumberField
            name={fieldName}
            isEditing={isEditing}
            value={editingPlan && field.value(editingPlan || "").toString()}
            onChange={(x) => {
              if (!editingPlan) {
                return;
              }
              setEditingPlan(field.set(editingPlan, x));
            }}
            readOnlyValue={field.value(plan).toString()}
            error={editingPlan && field.error(editingPlan)}
            disabled={!editingPlan?.isNewPlan && isImmutable}
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
type TextFieldProps = {
  isEditing: boolean;
  value?: string | null;
  onChange: (x: string) => void;
  name: string;
  readOnlyValue?: string | null;
  error?: string | null;
  disabled: boolean;
};

const TextField: React.FC<TextFieldProps> = ({
  isEditing,
  value,
  onChange,
  name,
  readOnlyValue,
  error,
  disabled,
}) => {
  return isEditing && !disabled ? (
    <Input
      value={value || ""}
      onChange={onChange}
      placeholder=""
      name={name}
      error={error}
      showErrorLabel={false}
    />
  ) : (
    <div
      className={classNames(
        readOnlyValue === null ? "italic text-element-600" : ""
      )}
    >
      {readOnlyValue === null ? "NULL" : readOnlyValue}
    </div>
  );
};

type NumberFieldProps = {
  isEditing: boolean;
  value?: string | null;
  onChange: (x: string) => void;
  name: string;
  readOnlyValue?: string | null;
  error?: string | null;
  disabled: boolean;
};

const NumberField: React.FC<NumberFieldProps> = ({
  isEditing,
  value,
  onChange,
  name,
  readOnlyValue,
  error,
  disabled,
}) => {
  return isEditing ? (
    <Input
      value={value?.toString() || ""}
      onChange={onChange}
      placeholder=""
      name={name}
      error={error}
      showErrorLabel={false}
      disabled={disabled}
    />
  ) : (
    <div
      className={classNames(
        readOnlyValue === null ? "italic text-element-600" : ""
      )}
    >
      {readOnlyValue === null
        ? "NULL"
        : readOnlyValue === "-1"
        ? "∞"
        : readOnlyValue?.toString()}
    </div>
  );
};

type BooleanFieldProps = {
  isEditing: boolean;
  checked?: boolean | null;
  onChange: (x: boolean) => void;
  name: string;
  readOnlyChecked?: boolean | null;
  disabled: boolean;
};

const BooleanField: React.FC<BooleanFieldProps> = ({
  isEditing,
  checked,
  onChange,
  name,
  readOnlyChecked,
  disabled,
}) => {
  void name;
  return (
    <Checkbox
      checked={(isEditing ? checked : readOnlyChecked) || false}
      onChange={onChange}
      disabled={!isEditing || disabled}
    />
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
