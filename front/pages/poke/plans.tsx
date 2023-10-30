import {
  Button,
  Checkbox,
  CheckIcon,
  IconButton,
  Input,
  PencilSquareIcon,
  PlusIcon,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useState } from "react";
import React from "react";
import { useSWRConfig } from "swr";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { usePokePlans } from "@app/lib/swr";
import { assertNever, classNames } from "@app/lib/utils";

import { PokePlanType } from "../api/poke/plans";
export const getServerSideProps: GetServerSideProps<object> = async (
  _context
) => {
  void _context;
  return {
    props: {},
  };
};
type DeepNumbersAsStrings<T> = {
  [K in keyof T]: T[K] extends number
    ? string | number
    : T[K] extends object
    ? DeepNumbersAsStrings<T[K]>
    : T[K];
};

type EditingPlanType = DeepNumbersAsStrings<PokePlanType> & {
  isNewPlan?: boolean;
};

const PlansPage = (
  _props: InferGetServerSidePropsType<typeof getServerSideProps>
) => {
  void _props;
  const { mutate } = useSWRConfig();

  const sendNotification = React.useContext(SendNotificationsContext);

  const { plans, isPlansLoading } = usePokePlans();

  const [editingPlan, setEditingPlan] = useState<EditingPlanType | null>(null);
  const [editingPlanCode, setEditingPlanCode] = useState<string | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState<boolean>(false);

  const handleEditPlan = (plan: EditingPlanType) => {
    setEditingPlan({ ...plan });
    setEditingPlanCode(plan.code);
  };

  const handleSavePlan = async () => {
    if (!editingPlan) {
      sendNotification({
        title: "Error saving plan",
        type: "error",
        description: "Something went wrong (editingPlan is null)",
      });
      return;
    }
    const errors = Object.keys(PLAN_FIELDS).map((fieldName) => {
      const field = PLAN_FIELDS[fieldName as keyof typeof PLAN_FIELDS];
      if ("error" in field) {
        return field.error?.(editingPlan);
      }
    });

    if (errors.some((x) => !!x)) {
      sendNotification({
        title: "Error saving plan",
        type: "error",
        description: "Some fields are invalid",
      });
      return;
    }

    // check if plan code is unique
    const plansWithSameCode = plans?.filter(
      (plan) => plan.code.trim() === editingPlan.code.trim()
    );
    if (
      (editingPlan.isNewPlan && plansWithSameCode.length > 0) ||
      (!editingPlan.isNewPlan && plansWithSameCode.length > 1)
    ) {
      sendNotification({
        title: "Error saving plan",
        type: "error",
        description: "Plan code must be unique",
      });
      return;
    }

    // check if stripe product id is unique
    if (editingPlan.stripeProductId) {
      const plansWithSameStripeProductId = plans?.filter(
        (plan) =>
          plan.stripeProductId &&
          plan.stripeProductId.trim() === editingPlan.stripeProductId?.trim()
      );
      if (
        (editingPlan.isNewPlan && plansWithSameStripeProductId.length > 0) ||
        (!editingPlan.isNewPlan && plansWithSameStripeProductId.length > 1)
      ) {
        sendNotification({
          title: "Error saving plan",
          type: "error",
          description: "Stripe Product ID must be unique",
        });
        return;
      }
    }

    const requestBody: PokePlanType = {
      code: editingPlan.code.trim(),
      name: editingPlan.name.trim(),
      limits: {
        assistant: {
          isSlackBotAllowed: editingPlan.limits.assistant.isSlackBotAllowed,
          maxMessages: parseInt(
            editingPlan.limits.assistant.maxMessages.toString(),
            10
          ),
        },
        connections: {
          isSlackAllowed: editingPlan.limits.connections.isSlackAllowed,
          isNotionAllowed: editingPlan.limits.connections.isNotionAllowed,
          isGoogleDriveAllowed:
            editingPlan.limits.connections.isGoogleDriveAllowed,
          isGithubAllowed: editingPlan.limits.connections.isGithubAllowed,
        },
        dataSources: {
          count: parseInt(editingPlan.limits.dataSources.count.toString(), 10),
          documents: {
            count: parseInt(
              editingPlan.limits.dataSources.documents.count.toString(),
              10
            ),
            sizeMb: parseInt(
              editingPlan.limits.dataSources.documents.sizeMb.toString(),
              10
            ),
          },
        },
        users: {
          maxUsers: parseInt(editingPlan.limits.users.maxUsers.toString(), 10),
        },
      },
      stripeProductId: editingPlan.stripeProductId?.trim() || null,
    };

    await fetch("/api/poke/plans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    await mutate("/api/poke/plans");

    setEditingPlan(null);
    setEditingPlanCode(null);
    if (isCreatingPlan) {
      setIsCreatingPlan(false);
    }
    // spinner + await mutate (put the buttons in disabled)
  };

  const handleAddPlan = () => {
    const newPlan: EditingPlanType = {
      isNewPlan: true,
      name: "",
      stripeProductId: "",
      code: "",
      limits: {
        users: {
          maxUsers: "",
        },
        assistant: {
          isSlackBotAllowed: false,
          maxMessages: "",
        },
        connections: {
          isSlackAllowed: false,
          isNotionAllowed: false,
          isGoogleDriveAllowed: false,
          isGithubAllowed: false,
        },
        dataSources: {
          count: "",
          documents: {
            count: "",
            sizeMb: "",
          },
        },
      },
    };
    setEditingPlan(newPlan);
    setIsCreatingPlan(true);
  };

  const plansToRender: EditingPlanType[] =
    plans && isCreatingPlan && editingPlan ? [...plans, editingPlan] : plans;

  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      {isPlansLoading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col items-center justify-center ">
          <div className="py-8 text-2xl font-bold">Plans</div>
          <div className="w-full overflow-x-auto">
            <table className="mx-auto table-auto rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(PLAN_FIELDS).map((fieldName) => {
                    const field =
                      PLAN_FIELDS[fieldName as keyof typeof PLAN_FIELDS];
                    return <th key={fieldName}>{field.title}</th>;
                  })}
                  <th className="px-4 py-2">Edit</th>
                </tr>
              </thead>
              <tbody className="bg-white text-gray-700 shadow-md">
                {plansToRender?.map((plan) => {
                  const planId = plan.isNewPlan ? "newPlan" : plan.code;

                  return (
                    <tr key={planId}>
                      {Object.keys(PLAN_FIELDS).map((fieldName) => (
                        <React.Fragment key={`${planId}:${fieldName}`}>
                          <Field
                            plan={plan}
                            fieldName={fieldName as keyof typeof PLAN_FIELDS}
                            isEditing={
                              !!(
                                (!isCreatingPlan &&
                                  editingPlanCode === plan.code) ||
                                (isCreatingPlan &&
                                  editingPlan &&
                                  plan?.isNewPlan)
                              )
                            }
                            setEditingPlan={setEditingPlan}
                            editingPlan={editingPlan}
                          />
                        </React.Fragment>
                      ))}
                      <td className="w-12 min-w-[4rem] flex-none border px-4 py-2">
                        {editingPlanCode === plan.code || plan.isNewPlan ? (
                          <div className="flex flex-row justify-center">
                            <IconButton
                              icon={CheckIcon}
                              onClick={handleSavePlan}
                            />
                            <IconButton
                              icon={XMarkIcon}
                              onClick={() => {
                                setEditingPlan(null);
                                setEditingPlanCode(null);
                                setIsCreatingPlan(false);
                              }}
                            />
                          </div>
                        ) : (
                          <div className="flex flex-row justify-center">
                            <IconButton
                              icon={PencilSquareIcon}
                              onClick={() => handleEditPlan(plan)}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pt-8">
            <Button
              icon={PlusIcon}
              label="Create a new plan"
              variant="secondary"
              onClick={handleAddPlan}
              disabled={isCreatingPlan || !!editingPlan}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PlansPage;

const PLAN_FIELDS = {
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
    width: "large",
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
    error: (plan: EditingPlanType) => {
      if (
        plan.limits.dataSources.count === undefined ||
        plan.limits.dataSources.count === null ||
        plan.limits.dataSources.count === ""
      ) {
        return "Data Sources count is required";
      }

      const parsed: number =
        typeof plan.limits.dataSources.count === "number"
          ? plan.limits.dataSources.count
          : parseInt(plan.limits.dataSources.count, 10);

      if (isNaN(parsed)) {
        return "Data Sources count must be a number";
      }

      if (parsed < -1) {
        return "Data Sources count must be positive or -1 (unlimited)";
      }

      return null;
    },
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
    error: (plan: EditingPlanType) => {
      if (!plan.limits.dataSources.documents.count) {
        return "Data Sources Documents count is required";
      }

      const parsed: number =
        typeof plan.limits.dataSources.documents.count === "number"
          ? plan.limits.dataSources.documents.count
          : parseInt(plan.limits.dataSources.documents.count, 10);

      if (isNaN(parsed)) {
        return "Data Sources Documents count must be a number";
      }

      if (parsed < -1) {
        return "Data Sources Documents count must be positive or -1 (unlimited)";
      }

      return null;
    },
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
    error: (plan: EditingPlanType) => {
      if (!plan.limits.dataSources.documents.sizeMb) {
        return "Data Sources Documents size is required";
      }

      const parsed: number =
        typeof plan.limits.dataSources.documents.sizeMb === "number"
          ? plan.limits.dataSources.documents.sizeMb
          : parseInt(plan.limits.dataSources.documents.sizeMb, 10);

      if (isNaN(parsed)) {
        return "Data Sources Documents size must be a number";
      }

      if (parsed < -1) {
        return "Data Sources Documents size must be positive or -1 (unlimited)";
      }

      return null;
    },
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
    error: (plan: EditingPlanType) => {
      if (!plan.limits.users.maxUsers) {
        return "Max users is required";
      }

      const parsed: number =
        typeof plan.limits.users.maxUsers === "number"
          ? plan.limits.users.maxUsers
          : parseInt(plan.limits.users.maxUsers, 10);

      if (isNaN(parsed)) {
        return "Max users must be a number";
      }

      if (parsed < -1) {
        return "Max users must be positive or -1 (unlimited)";
      }

      return null;
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

const Field: React.FC<FieldProps> = ({
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
    <td className={classNames("flex-none border px-4 py-2", widthClass)}>
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
  return isEditing ? (
    <Input
      value={value || ""}
      onChange={onChange}
      placeholder=""
      name={name}
      error={error}
      showErrorLabel={true}
      disabled={disabled}
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
      showErrorLabel={true}
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
