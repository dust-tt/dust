import {
  Avatar,
  Button,
  ChevronUpDownIcon,
  Icon,
  InformationCircleStrokeIcon,
  PageHeader,
  PencilSquareIcon,
  PlusIcon,
  RobotStrokeIcon,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { classNames } from "@app/lib/utils";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (
    !owner ||
    !user ||
    !auth.isBuilder() ||
    !isDevelopmentOrDustWorkspace(owner)
  ) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function CreateAssistant({
  user,
  owner,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({
        owner,
        current: "assistants",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title="Design your custom Assistant"
          onClose={() => {
            void router.push(`/w/${owner.sId}/builder/assistants`);
          }}
        />
      }
    >
      <div className="mt-8 flex flex-col space-y-8 pb-8">
        <PageHeader
          title="Assistant Editor"
          icon={RobotStrokeIcon}
          description="Make and maintain your customized assistants."
        />
        <div className="mt-8 flex flex-row items-start">
          <div className="flex flex-col items-center space-y-2">
            <Avatar
              size="lg"
              visual={<img src="/static/droidavatar/Droïd_Violet_2.jpg" />}
            />
            <Button
              labelVisible={true}
              label="Change"
              variant="tertiary"
              size="xs"
              icon={PencilSquareIcon}
            />
          </div>
          <div className="ml-4 space-y-4">
            <div className="block text-sm font-medium text-element-900">
              Name
            </div>
            <div className="flex-grow self-stretch text-sm font-normal text-element-700">
              The name of your Assistant will be used to call your Assistant
              with an “@” handle (for instance @myAssistant). It must be unique.
            </div>
            <input
              type="text"
              name="name"
              id="assistantName"
              className={classNames(
                "block w-full min-w-0 rounded-md text-sm",
                "border-gray-300 focus:border-action-500 focus:ring-action-500",
                "bg-structure-50 stroke-structure-50"
              )}
              placeholder="SalesAssistantFrance"
            />
            <div className="block text-sm font-medium text-element-900">
              Description
            </div>
            <div className="flex-grow self-stretch text-sm font-normal text-element-700">
              The description helps your collaborators and Dust to understand
              the purpose of the Assistant.
            </div>
            <input
              type="text"
              name="description"
              id="assistantDescription"
              className={classNames(
                "block w-full min-w-0 rounded-md text-sm",
                "border-gray-300 focus:border-action-500 focus:ring-action-500",
                "bg-structure-50 stroke-structure-50"
              )}
              placeholder="Assistant designed to answer sales questions"
            />
          </div>
        </div>
        <div className="mt-8 flex flex-row items-start">
          <div className="space-y-2">
            <div className="text-lg font-bold text-element-900">
              Instructions
            </div>
            <div className="flex-grow self-stretch text-sm font-normal text-element-700">
              lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non
              diam et dolor aliquet.
            </div>
            <input
              type="text"
              name="instructions"
              id="assistantInstructions"
              className={classNames(
                "block w-full min-w-0 rounded-md text-sm",
                "border-gray-300 focus:border-action-500 focus:ring-action-500",
                "bg-structure-50 stroke-structure-50"
              )}
              placeholder="Achieve a particular task, follow a template, use a certain formating..."
            />
            <div className="flex flex-row items-center space-x-2">
              <div className="text-sm font-semibold text-action-500">
                Select a specific LLM model
              </div>
              <Icon size="xs" visual={InformationCircleStrokeIcon} />
            </div>
          </div>
        </div>
        <div className="flex flex-row items-start">
          <div className="space-y-2">
            <div className="text-lg font-bold text-element-900">
              Data sources
            </div>
            <div className="flex-grow self-stretch text-sm font-bold text-element-900">
              <div className="font-normal text-element-700">
                Customize your Assistant's knowledge. Tips:
              </div>
              <ul role="list" className="list-disc pl-5 pt-2">
                <li>
                  Setting data sources is not an obligation.
                  <div className="font-normal text-element-700">
                    By default, your assistant will follow your instructions and
                    answer based on commun knowledge. Only do so if the context
                    is important.
                  </div>
                </li>
                <li>
                  Choose your data sources with care.
                  <div className="font-normal text-element-700">
                    The more targeted your data are the better the answers will
                    be.
                  </div>
                </li>
              </ul>
            </div>
            <div className="pt-6 text-base font-semibold">
              Select the data sources
            </div>
            <div className="flex h-48 items-center justify-center rounded-lg bg-structure-50">
              <Button
                labelVisible={true}
                label="Add a data source"
                variant="primary"
                size="md"
                icon={PlusIcon}
              />
            </div>
            <div className="pt-6 text-base font-semibold text-element-900">
              Timeframe for the data sources
            </div>
            <div className="text-sm font-normal text-element-900">
              Define a specific time frame if you want the Assistant to only
              focus on data from a specific time period.
              <br />
              <span className="font-bold">"Auto"</span> means the assistant will
              define itself, from the question, what the timeframe should be.
            </div>
            <div className="flex flex-row items-center space-x-2 pt-2">
              <div className="text-sm font-semibold text-element-900">
                Timeframe:
              </div>
              <Button
                labelVisible={true}
                label="Auto (default)"
                variant="secondary"
                size="sm"
                icon={ChevronUpDownIcon}
              />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
