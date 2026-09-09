import { Avatar, Icon } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

import type {
  AvatarCounterSizeType,
  AvatarCounterVariantType,
} from "../components/AvatarCounter";
import {
  AVATAR_COUNTER_SIZES,
  AvatarCounter,
} from "../components/AvatarCounter";
import { PlaygroundScreen } from "../components/PlaygroundScreen";
import { getRequestTypeIcon, getUserById } from "../data";

const VARIANTS: AvatarCounterVariantType[] = [
  "outline",
  "primary",
  "highlight",
  "warning",
  "info",
  "ghost",
];

const requester = getUserById("3");
const creditIcon = getRequestTypeIcon("creditManagement");
const knowledgeIcon = getRequestTypeIcon("knowledgeManagement");

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-6">
      <span className="w-16 shrink-0 text-sm text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-8">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="heading-base text-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** One person and one agent, so the corner counter can be judged on a circle and on a rounded square. */
function SizeRow({ size }: { size: AvatarCounterSizeType }) {
  return (
    <Row label={size}>
      <AvatarCounter
        size={size}
        name={requester?.fullName}
        visual={requester?.portrait}
        isRounded
        badgeIcon={creditIcon}
        badgeLabel="Credit management"
      />
      <AvatarCounter
        size={size}
        name={requester?.fullName}
        visual={requester?.portrait}
        isRounded
        count={3}
        badgeLabel="3 requests"
      />
      <AvatarCounter
        size={size}
        name="Translator"
        emoji="💬"
        backgroundColor="bg-green-200"
        badgeIcon={knowledgeIcon}
        badgeLabel="Knowledge management"
      />
      <AvatarCounter
        size={size}
        name="Translator"
        emoji="💬"
        backgroundColor="bg-green-200"
        count={12}
        badgeLabel="12 requests"
      />
    </Row>
  );
}

export default function AvatarCounterStory() {
  return (
    <PlaygroundScreen>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="heading-2xl text-foreground">AvatarCounter</h1>
          <p className="text-base text-muted-foreground">
            An avatar carrying a Counter in its top-right corner, holding a
            count or a secondary icon.
          </p>
        </div>

        <Section title="Sizes">
          <div className="flex flex-col gap-6">
            {AVATAR_COUNTER_SIZES.map((size) => (
              <SizeRow key={size} size={size} />
            ))}
          </div>
        </Section>

        <Section title="Variants">
          <div className="flex flex-col gap-6">
            {VARIANTS.map((variant) => (
              <Row key={variant} label={variant}>
                <AvatarCounter
                  name={requester?.fullName}
                  visual={requester?.portrait}
                  isRounded
                  variant={variant}
                  badgeIcon={creditIcon}
                  badgeLabel="Credit management"
                />
                <AvatarCounter
                  name={requester?.fullName}
                  visual={requester?.portrait}
                  isRounded
                  variant={variant}
                  count={3}
                  badgeLabel="3 requests"
                />
              </Row>
            ))}
          </div>
        </Section>

        <Section title="No counter">
          <Row label="empty">
            <AvatarCounter
              name={requester?.fullName}
              visual={requester?.portrait}
              isRounded
            />
            <AvatarCounter
              name={requester?.fullName}
              visual={requester?.portrait}
              isRounded
              count={0}
            />
          </Row>
        </Section>

        <Section title="In a request row">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <AvatarCounter
                name={requester?.fullName}
                visual={requester?.portrait}
                isRounded
                badgeIcon={creditIcon}
                badgeLabel="Credit management"
              />
              <div className="flex min-w-0 flex-col">
                <span className="heading-sm text-foreground">
                  Credit management{" "}
                  <span className="text-muted-foreground">
                    {requester?.fullName}
                  </span>
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  Raise my monthly credit limit
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Avatar
                size="sm"
                name={requester?.fullName}
                visual={requester?.portrait}
                isRounded
              />
              <div className="flex min-w-0 flex-col">
                <span className="heading-sm flex items-center gap-2 text-foreground">
                  <Icon visual={creditIcon} size="xs" />
                  Credit management{" "}
                  <span className="text-muted-foreground">
                    {requester?.fullName}
                  </span>
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  Raise my monthly credit limit
                </span>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </PlaygroundScreen>
  );
}
