import {
  Checkbox,
  ClockIcon,
  DropdownMenu,
  Hoverable,
  Icon,
  Input,
  Modal,
  Page,
  TextArea,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { useAgentConfigurations } from "@app/lib/swr";

interface NewScheduleModalProps {
  isOpened: boolean;
  onClose: () => void;
  owner: WorkspaceType;
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

export function NewScheduleModal({
  isOpened,
  onClose,
  owner,
}: NewScheduleModalProps) {
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
  });
  const agents = agentConfigurations.filter((a) => a.status === "active");

  // Types
  type ScheduleType = "weekly" | "monthly";

  type ScheduleTypes = {
    [key in ScheduleType]: string;
  };

  const scheduleTypes: ScheduleTypes = {
    weekly: "Daily / weekly",
    monthly: "Monthly",
  };

  type Schedule = {
    name: string;
    timeOfDay: string;
    timezone: string;
    daysOfTheWeek: number[];
    agentConfigurationId: string;
    prompt: string;
    scheduleType: ScheduleType;
    weeklyDaysOfWeek: number[];
    monthlyNthDayOfWeek: number;
    monthlyDayOfWeek: number;
    monthlyFirstLast: string;
    emails: string[];
    slackChannelIds: string[];
  };

  const initialSchedule: Schedule = {
    name: "",
    timeOfDay: "00:00",
    timezone: "UTC",
    daysOfTheWeek: [1],
    agentConfigurationId: "",
    prompt: "",
    scheduleType: "weekly",
    weeklyDaysOfWeek: [1],
    monthlyNthDayOfWeek: 1,
    monthlyDayOfWeek: 1,
    monthlyFirstLast: "last",
    emails: [],
    slackChannelIds: [],
  };

  const [schedule, setSchedule] = useState(initialSchedule);

  const handleSelectAssistant = (assistant: LightAgentConfigurationType) => {
    setSchedule({ ...schedule, agentConfigurationId: assistant.sId });
  };

  return (
    <Modal
      isOpen={isOpened}
      onClose={onClose}
      hasChanged={false}
      variant="full-screen"
      title="New schedule"
    >
      <Page.Layout direction="vertical" gap="lg">
        <div className="mt-4">
          <Page.Layout direction="horizontal" gap="md">
            <Icon visual={ClockIcon} size="lg" className="text-emerald-500" />
            Run an assistant regularly and send its results to a destination of
            your choice.
          </Page.Layout>
        </div>
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
                      weeklyDaysOfWeek: schedule.weeklyDaysOfWeek.includes(
                        day.value
                      )
                        ? schedule.weeklyDaysOfWeek.filter(
                            (d) => d !== day.value
                          )
                        : [...schedule.weeklyDaysOfWeek, day.value],
                    })
                  }
                  className="my-1 flex w-full items-center"
                >
                  <Checkbox
                    variant="checkable"
                    className="ml-auto"
                    checked={schedule.weeklyDaysOfWeek.includes(day.value)}
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

          <Page.H variant="h6">Which assistant shoud it run?</Page.H>
          <Page.Layout direction="horizontal">
            <AssistantPicker
              owner={owner}
              size="sm"
              onItemClick={(assistant) => handleSelectAssistant(assistant)}
              assistants={agents}
              showFooterButtons={false}
            />
            {schedule.agentConfigurationId && (
              <Page.P>
                <strong>
                  @
                  {
                    agents.find((a) => a.sId === schedule.agentConfigurationId)
                      ?.name
                  }
                </strong>
              </Page.P>
            )}
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
        </Page.Layout>
      </Page.Layout>
    </Modal>
  );
}
