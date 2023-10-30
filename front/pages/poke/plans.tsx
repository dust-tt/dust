import {
  Button,
  CheckIcon,
  IconButton,
  PencilSquareIcon,
  PlusIcon,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useState } from "react";
import React from "react";
import { useSWRConfig } from "swr";

import {
  EditingPlanType,
  Field,
  PLAN_FIELDS,
} from "@app/components/poke/plans/form";
import PokeNavbar from "@app/components/poke/PokeNavbar";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { usePokePlans } from "@app/lib/swr";

import { PokePlanType } from "../api/poke/plans";

export const getServerSideProps: GetServerSideProps<object> = async (
  _context
) => {
  void _context;
  return {
    props: {},
  };
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

    const r = await fetch("/api/poke/plans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    if (!r.ok) {
      sendNotification({
        title: "Error saving plan",
        type: "error",
        description: `Something went wrong: ${r.status} ${await r.text()}`,
      });
      return;
    }

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
