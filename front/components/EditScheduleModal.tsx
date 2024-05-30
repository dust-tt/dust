import {
  Checkbox,
  DropdownMenu,
  Hoverable,
  Input,
  Modal,
  Page,
  TextArea,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import type { Channel } from "@slack/web-api";
import moment from "moment-timezone";
import { useCallback, useContext, useEffect, useRef, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { getSlackClient } from "@app/lib/scheduled_agents/slack";
import { useAgentConfigurations } from "@app/lib/swr";
import { isEmailValid } from "@app/lib/utils";

import { SendNotificationsContext } from "./sparkle/Notification";

type ScheduleType = "weekly" | "monthly";

const scheduleTypes = {
  weekly: "Daily / weekly",
  monthly: "Monthly",
};

export type ScheduledAgentType = {
  sId: string | null | undefined;
  name: string;
  timeOfDay: string;
  timeZone: string;
  agentConfigurationId: string;
  prompt: string;
  scheduleType: ScheduleType;
  weeklyDaysOfWeek: number[] | null | undefined;
  monthlyNthDayOfWeek: number | null | undefined;
  monthlyDayOfWeek: number | null | undefined;
  monthlyFirstLast: string | null | undefined;
  emails: string[];
  slackChannelId: string | null;
};

interface EditScheduleModalProps {
  isOpened: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  editSchedule: ScheduledAgentType | null;
}

const daysOfTheWeek = [
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 },
  { label: "Sunday", value: 0 },
];

export function EditScheduleModal({
  isOpened,
  onClose,
  owner,
  editSchedule,
}: EditScheduleModalProps) {
  const sendNotification = useContext(SendNotificationsContext);
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
  });
  const agents = agentConfigurations.filter((a) => a.status === "active");

  const initialSchedule: ScheduledAgentType = {
    sId: null,
    name: "",
    timeOfDay: "00:00",
    timeZone: "UTC",
    agentConfigurationId: "",
    prompt: "",
    scheduleType: "weekly",
    weeklyDaysOfWeek: [],
    monthlyNthDayOfWeek: null,
    monthlyDayOfWeek: null,
    monthlyFirstLast: "last",
    emails: [],
    slackChannelId: null,
  };
  const initialScheduleRef = useRef(initialSchedule);

  const [schedule, setSchedule] = useState(initialSchedule);

  const handleSelectAssistant = (assistant: LightAgentConfigurationType) => {
    setSchedule({ ...schedule, agentConfigurationId: assistant.sId });
  };

  const getAvailableSlackChannels = useCallback(async () => {
    const slackClient = await getSlackClient(owner.sId);
    try {
      const result = await slackClient.conversations.list();
      const channels = result.channels;
      return channels;
    } catch (error) {
      console.error("Error fetching channels:", error);
      return [];
    }
  }, [owner.sId]);
  const [availableSlackChannels, setAvailableSlackChannels] = useState<
    Channel[] | null
  >(null);

  const isScheduleValid = () => {
    if (!schedule.name) {
      return false;
    }

    if (!schedule.agentConfigurationId) {
      return false;
    }

    if (!schedule.emails.length) {
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (schedule.emails.some((email) => !isEmailValid(email))) {
      sendNotification({
        type: "error",
        title: "Invalid email",
        description: `One or more emails are invalid.`,
      });
      return;
    }

    const scheduleToSend = {
      ...schedule,
    };

    delete scheduleToSend.sId;

    if (schedule.scheduleType === "monthly") {
      delete scheduleToSend.weeklyDaysOfWeek;
    }
    if (schedule.scheduleType === "weekly") {
      delete scheduleToSend.monthlyDayOfWeek;
      delete scheduleToSend.monthlyFirstLast;
      delete scheduleToSend.monthlyNthDayOfWeek;
    }

    const fetchUrl = schedule.sId
      ? `/api/w/${owner.sId}/scheduled_agents/${schedule.sId}`
      : `/api/w/${owner.sId}/scheduled_agents`;
    const fetchMethod = schedule.sId ? "PATCH" : "POST";

    const res = await fetch(fetchUrl, {
      method: fetchMethod,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(scheduleToSend),
    });

    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Failed to save schedule",
        description: "An error occurred while saving the schedule.",
      });
      return;
    }

    sendNotification({
      type: "success",
      title: "Schedule saved",
      description: `The schedule ${schedule.name} has been saved.`,
    });

    onClose();
  };

  useEffect(() => {
    setSchedule(editSchedule || initialScheduleRef.current);
  }, [editSchedule, getAvailableSlackChannels]);

  useEffect(() => {
    const fetchSlackChannels = async () => {
      const channels = await getAvailableSlackChannels();
      setAvailableSlackChannels(channels || null);
    };

    void fetchSlackChannels();
  }, []);
  return (
    <Modal
      isOpen={isOpened}
      onClose={onClose}
      hasChanged={isScheduleValid()}
      onSave={async () => {
        await handleSave();
      }}
      variant="full-screen"
      title={"Edit schedule"}
    >
      <Page>
        <Page.Layout direction="vertical" gap="lg">
          <Page.H variant="h6">Name your schedule</Page.H>
          <Input
            name="scheduleName"
            placeholder="Schedule name"
            value={schedule.name}
            onChange={(e) => setSchedule({ ...schedule, name: e })}
          />

          <Page.H variant="h6">When should it run?</Page.H>

          <DropdownMenu>
            <DropdownMenu.Button
              type="select"
              label={
                schedule.scheduleType
                  ? scheduleTypes[schedule.scheduleType]
                  : "Schedule type"
              }
            />

            <DropdownMenu.Items origin="topLeft">
              {Object.entries(scheduleTypes).map(([key, value]) => (
                <DropdownMenu.Item
                  key={key}
                  label={value}
                  onClick={() =>
                    setSchedule({
                      ...schedule,
                      scheduleType: key as ScheduleType,
                    })
                  }
                />
              ))}
            </DropdownMenu.Items>
          </DropdownMenu>

          <Page.Layout direction="vertical" gap="md">
            {schedule.scheduleType === "weekly" && (
              <Page.Layout direction="horizontal" gap="lg">
                {daysOfTheWeek.map((day) => (
                  <Hoverable
                    key={day.value}
                    onClick={() =>
                      setSchedule({
                        ...schedule,
                        weeklyDaysOfWeek: schedule.weeklyDaysOfWeek?.includes(
                          day.value
                        )
                          ? schedule.weeklyDaysOfWeek.filter(
                              (d) => d !== day.value
                            )
                          : [...(schedule.weeklyDaysOfWeek ?? []), day.value],
                      })
                    }
                    className="my-1 flex w-full items-center"
                  >
                    <Checkbox
                      variant="checkable"
                      className="ml-auto"
                      checked={
                        schedule.weeklyDaysOfWeek?.includes(day.value) || false
                      }
                      partialChecked={false}
                      onChange={() => {}}
                    />
                    <div className="ml-2">
                      <Page.P>{day.label}</Page.P>
                    </div>
                  </Hoverable>
                ))}
              </Page.Layout>
            )}

            {schedule.scheduleType === "monthly" && (
              <Page.Layout direction="horizontal" gap="lg">
                <Page.P>On the </Page.P>
                <DropdownMenu>
                  <DropdownMenu.Button
                    type="select"
                    label={
                      schedule.monthlyFirstLast
                        ? schedule.monthlyFirstLast
                        : "First / Last"
                    }
                  />

                  <DropdownMenu.Items origin="topLeft">
                    {["first", "last"].map((value) => (
                      <DropdownMenu.Item
                        key={value}
                        label={value}
                        onClick={() =>
                          setSchedule({
                            ...schedule,
                            monthlyFirstLast: value,
                          })
                        }
                      />
                    ))}
                  </DropdownMenu.Items>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenu.Button
                    type="select"
                    label={
                      schedule.monthlyDayOfWeek
                        ? daysOfTheWeek.find(
                            (d) => d.value === schedule.monthlyDayOfWeek
                          )?.label
                        : "Day of the week"
                    }
                  />

                  <DropdownMenu.Items origin="topLeft">
                    {daysOfTheWeek.map((day) => (
                      <DropdownMenu.Item
                        key={day.value}
                        label={day.label}
                        onClick={() =>
                          setSchedule({
                            ...schedule,
                            monthlyDayOfWeek: day.value,
                          })
                        }
                      />
                    ))}
                  </DropdownMenu.Items>
                </DropdownMenu>
              </Page.Layout>
            )}

            <Page.Layout direction="horizontal" gap="lg">
              <input
                type="time"
                id="time"
                className="block rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm leading-none text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
                onChange={(e) =>
                  setSchedule({ ...schedule, timeOfDay: e.target.value })
                }
                value={schedule.timeOfDay}
                required
              />
              <div className="mt-2">
                <DropdownMenu>
                  <DropdownMenu.Button
                    type="select"
                    label={schedule.timeZone ? schedule.timeZone : "Timezone"}
                  />
                  <DropdownMenu.Items origin="topLeft" width={300}>
                    {moment.tz.names().map((tz) => (
                      <DropdownMenu.Item
                        key={tz}
                        label={tz}
                        onClick={() =>
                          setSchedule({ ...schedule, timeZone: tz })
                        }
                      />
                    ))}
                  </DropdownMenu.Items>
                </DropdownMenu>
              </div>
            </Page.Layout>

            <Page.H variant="h6">Which assistant shoud it run?</Page.H>
            <Page.Layout direction="horizontal">
              <AssistantPicker
                owner={owner}
                size="sm"
                onItemClick={(assistant) => handleSelectAssistant(assistant)}
                assistants={agents}
                showFooterButtons={false}
              />
              <Page.P>
                <strong>
                  {agents.find((a) => a.sId === schedule.agentConfigurationId)
                    ?.name || "Pick an assistant"}
                </strong>
              </Page.P>
            </Page.Layout>

            <TextArea
              value={schedule.prompt}
              onChange={(e) => {
                setSchedule({ ...schedule, prompt: e });
              }}
              placeholder="Prompt"
            />

            <Page.H variant="h6">Who should receive the results?</Page.H>

            <Input
              name="emails"
              placeholder="Emails"
              value={schedule.emails.join(",")}
              onChange={(e) =>
                setSchedule({ ...schedule, emails: e.split(",").map((e) => e) })
              }
            />

            {!!availableSlackChannels &&
              availableSlackChannels.map((channel) => (
                <Hoverable
                  key={day.value}
                  onClick={() =>
                    setSchedule({
                      ...schedule,
                      weeklyDaysOfWeek: schedule.weeklyDaysOfWeek?.includes(
                        day.value
                      )
                        ? schedule.weeklyDaysOfWeek.filter(
                            (d) => d !== day.value
                          )
                        : [...(schedule.weeklyDaysOfWeek ?? []), day.value],
                    })
                  }
                  className="my-1 flex w-full items-center"
                >
                  <Checkbox
                    variant="checkable"
                    className="ml-auto"
                    checked={
                      schedule.weeklyDaysOfWeek?.includes(day.value) || false
                    }
                    partialChecked={false}
                    onChange={() => {}}
                  />
                  <div className="ml-2">
                    <Page.P>{day.label}</Page.P>
                  </div>
                </Hoverable>
              ))}
          </Page.Layout>
        </Page.Layout>
      </Page>
    </Modal>
  );
}
