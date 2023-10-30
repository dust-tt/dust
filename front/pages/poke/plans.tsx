import { IconButton, PencilSquareIcon, Spinner } from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useState } from "react";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { usePokePlans } from "@app/lib/swr";

import { PokePlanType } from "../api/poke/plans";

// const PlanForm: React.FC<PlanFormProps> = ({ onSave, onCancel }) => {
//   return (
//     <Modal
//       isOpen={true}
//       type="full-screen"
//       title="Edit Plan"
//       onClose={onCancel}
//       // onSave={() => currentPlan && onSave(currentPlan)}
//       hasChanged={false}
//     >
//       <div className="mx-auto max-w-2xl">
//         <div className="pt-8" />
//         <Form
//           schema={PlanFormSchema}
//           onSubmit={() => {
//             alert("submit");
//           }}
//           props={{
//             code: {
//               placeholder: "",
//               title: "Code",
//             },
//             name: {
//               placeholder: "",
//               title: "Name",
//             },
//             stripeProductId: {
//               placeholder: "",
//               title: "Stripe product ID",
//             },
//             isSlackBotAllowed: {
//               title: "Slack bot allowed",
//             },
//             dataSourcesCount: {
//               placeholder: "",
//               title: "Data sources count",
//             },
//           }}
//         />
//       </div>
//     </Modal>
//   );
// };

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

  const { plans, isPlansLoading } = usePokePlans();
  const [, setSelectedPlan] = useState<PokePlanType | null>(null);

  const handleEditPlan = (plan: PokePlanType) => {
    setSelectedPlan(plan);
  };

  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      {isPlansLoading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col items-center justify-center">
          <div className="py-8 text-2xl font-bold">Plans</div>
          <div className="flex flex-col gap-8">
            {plans?.map((plan) => (
              <div key={plan.code} className="flex flex-col gap-2">
                <div className="text-xl font-bold">{plan.name}</div>
                <div className="text-sm">
                  Stripe product ID: {plan.stripeProductId || "None"}
                </div>
                <div className="text-sm">Plan code: {plan.code}</div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-row gap-2">
                    <div className="text-sm font-bold">Assistant</div>
                    <div className="text-sm">
                      {plan.limits.assistant.isSlackBotAllowed
                        ? "Slack bot allowed"
                        : "Slack bot not allowed"}
                    </div>
                    <div className="text-sm">
                      {nbOrInfinite(plan.limits.assistant.maxMessages)} messages
                    </div>
                  </div>
                  <div className="flex flex-row gap-2">
                    <div className="text-sm font-bold">Connections</div>
                    <div className="text-sm">
                      {plan.limits.connections.isSlackAllowed
                        ? "Slack allowed"
                        : "Slack not allowed"}
                    </div>
                    <div className="text-sm">
                      {plan.limits.connections.isNotionAllowed
                        ? "Notion allowed"
                        : "Notion not allowed"}
                    </div>
                    <div className="text-sm">
                      {plan.limits.connections.isGoogleDriveAllowed
                        ? "Google Drive allowed"
                        : "Google Drive not allowed"}
                    </div>
                    <div className="text-sm">
                      {plan.limits.connections.isGithubAllowed
                        ? "Github allowed"
                        : "Github not allowed"}
                    </div>
                  </div>
                  <div className="flex flex-row gap-2">
                    <div className="text-sm font-bold">Data sources</div>
                    <div className="text-sm">
                      {nbOrInfinite(plan.limits.dataSources.count)} data sources
                    </div>
                    <div className="text-sm">
                      {nbOrInfinite(plan.limits.dataSources.documents.count)}{" "}
                      documents
                    </div>
                    <div className="text-sm">
                      {nbOrInfinite(plan.limits.dataSources.documents.sizeMb)}{" "}
                      MB
                    </div>
                  </div>
                  <IconButton
                    icon={PencilSquareIcon}
                    onClick={() => handleEditPlan(plan)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlansPage;

const nbOrInfinite = (nb: number): string => {
  if (nb === -1) {
    return "∞";
  }
  return nb.toString();
};
