import {
  Button,
  CheckIcon,
  IconButton,
  PencilSquareIcon,
  PlusIcon,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { PlanType } from "@dust-tt/types";
import type * as t from "io-ts";
import React from "react";
import { useSWRConfig } from "swr";

import type { EditingPlanType } from "@app/components/poke/plans/form";
import {
  Field,
  fromPlanType,
  PLAN_FIELDS,
  toPlanType,
  useEditingPlan,
} from "@app/components/poke/plans/form";
import PokeNavbar from "@app/components/poke/PokeNavbar";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { usePokePlans } from "@app/lib/swr/poke";
import type { PlanTypeSchema } from "@app/pages/api/poke/plans";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

const PlansPage = () => {
  const { mutate } = useSWRConfig();

  const sendNotification = React.useContext(SendNotificationsContext);

  const { plans, isPlansLoading } = usePokePlans();

  const { editingPlan, resetEditingPlan, createNewPlan, setEditingPlan } =
    useEditingPlan();

  const handleSavePlan = async () => {
    if (!editingPlan) {
      sendNotification({
        title: "Error saving plan",
        type: "error",
        description: "Something went wrong (editingPlan is null)",
      });
      return;
    }
    const errors = Object.keys(PLAN_FIELDS)
      .map((fieldName) => {
        const field = PLAN_FIELDS[fieldName as keyof typeof PLAN_FIELDS];
        if ("error" in field) {
          return field.error?.(editingPlan);
        }
      })
      .filter((x) => !!x);

    if (errors.length) {
      sendNotification({
        title: "Error saving plan",
        type: "error",
        description: `${errors[0]}`,
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

    const requestBody: PlanType = toPlanType(editingPlan);

    const r = await fetch("/api/poke/plans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        requestBody satisfies t.TypeOf<typeof PlanTypeSchema>
      ),
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

    resetEditingPlan();
  };

  const plansToRender: EditingPlanType[] = (plans || []).map(fromPlanType);
  if (editingPlan?.isNewPlan) {
    plansToRender.push(editingPlan);
  }

  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      {isPlansLoading ? (
        <Spinner />
      ) : (
        <div className="flex h-full flex-col items-center justify-center">
          <div className="h-full py-8 text-2xl font-bold">Plans</div>
          <div className="h-full w-full overflow-x-auto pb-52 pt-12">
            <table className="mx-auto h-full table-auto overflow-visible rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(PLAN_FIELDS).map((fieldName) => {
                    const field =
                      PLAN_FIELDS[fieldName as keyof typeof PLAN_FIELDS];
                    return (
                      <th key={fieldName}>
                        {"IconComponent" in field ? (
                          <div className="flex flex-row justify-center">
                            <field.IconComponent />
                          </div>
                        ) : (
                          field.title
                        )}
                      </th>
                    );
                  })}
                  <th className="px-4 py-2">Edit</th>
                </tr>
              </thead>
              <tbody className="h-full bg-white pb-48 text-gray-700">
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
                              (!editingPlan?.isNewPlan &&
                                editingPlan?.code === plan.code) ||
                              (!!editingPlan?.isNewPlan && !!plan.isNewPlan)
                            }
                            setEditingPlan={setEditingPlan}
                            editingPlan={editingPlan}
                          />
                        </React.Fragment>
                      ))}
                      <td className="w-12 min-w-[4rem] flex-none border px-4 py-2">
                        {plan.code === editingPlan?.code || plan.isNewPlan ? (
                          <div className="flex flex-row justify-center">
                            <IconButton
                              icon={CheckIcon}
                              onClick={handleSavePlan}
                            />
                            <IconButton
                              icon={XMarkIcon}
                              onClick={resetEditingPlan}
                            />
                          </div>
                        ) : (
                          <div className="flex flex-row justify-center">
                            <IconButton
                              icon={PencilSquareIcon}
                              onClick={() => setEditingPlan(plan)}
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
          <div>
            <Button
              icon={PlusIcon}
              label="Create a new plan"
              variant="secondary"
              onClick={() => createNewPlan()}
              disabled={editingPlan?.isNewPlan || !!editingPlan}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PlansPage;
