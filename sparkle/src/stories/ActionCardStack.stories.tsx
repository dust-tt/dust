import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import { expect, userEvent } from "storybook/test";

import {
  ActionCardBlock,
  ActionCardStack,
  Avatar,
  Button,
  Edit04,
} from "../index_with_tw_base";

const meta = {
  title: "Product/Conversation/ActionCardStack",
  component: ActionCardStack,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `A pile of action cards rendered inside an agent message when several proposals are grouped together. The front card (\`children\`) is the only interactive one; up to two tilted, decorative layers are drawn behind it based on **cardCount**, and they stretch to the front card's height.

**When to use**
- When an agent message proposes several changes at once: put a recap **ActionCardBlock** ("N edits ready for your review", with review / reject all / accept all actions) at the front, then swap in each proposal as the user reviews them.

**Guidelines**
- Give the front card \`cardVariant="secondary"\` so it reads lighter than the layers behind it.
- Pass the number of cards still to review as **cardCount**, so the pile shrinks as the user goes through it.
- Once nothing is left to review, set **cardCount** to 1 to drop the layers and show a resolved summary card.`,
      },
    },
  },
} satisfies Meta<typeof ActionCardStack>;

export default meta;
type Story = StoryObj<typeof meta>;

interface RecapCardProps {
  pendingCount: number;
  onReview?: () => void;
  onRejectAll?: () => void;
  onAcceptAll?: () => void;
}

function RecapCard({
  pendingCount,
  onReview,
  onRejectAll,
  onAcceptAll,
}: RecapCardProps) {
  return (
    <ActionCardBlock
      cardVariant="secondary"
      title={`${pendingCount} edits ready for your review`}
      visual={
        <Avatar size="sm" icon={Edit04} backgroundColor="bg-background" />
      }
      actions={
        <div className="flex w-full items-center justify-between gap-2 pl-11">
          <Button
            variant="ghost-secondary"
            size="sm"
            label="Reject all"
            onClick={onRejectAll}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              label="Accept all"
              onClick={onAcceptAll}
            />
            <Button
              variant="highlight"
              size="sm"
              label="Review"
              onClick={onReview}
            />
          </div>
        </div>
      }
    />
  );
}

/**
 * The full pile: a recap card at the front with two tilted layers behind it.
 * Four or more cards still render only three.
 *
 * @summary Recap card on top of a pile of four proposals.
 */
export const RecapOnTop: Story = {
  args: {
    cardCount: 4,
    children: <RecapCard pendingCount={4} />,
  },
  render: (args) => <ActionCardStack {...args} />,
};

/**
 * With two cards, a single layer is drawn behind the front card.
 *
 * @summary Pile of two proposals.
 */
export const TwoCards: Story = {
  args: {
    cardCount: 2,
    children: <RecapCard pendingCount={2} />,
  },
  render: (args) => <ActionCardStack {...args} />,
};

/**
 * Once every proposal is reviewed, the pile collapses to a single resolved
 * summary card with no layers behind it.
 *
 * @summary Collapsed pile after every proposal was reviewed.
 */
export const ReviewedSummary: Story = {
  args: {
    cardCount: 1,
    children: (
      <ActionCardBlock
        title="4 edits"
        acceptedTitle="3 edits accepted, 1 rejected"
        state="accepted"
      />
    ),
  },
  render: (args) => <ActionCardStack {...args} />,
};

const PROPOSALS = [
  {
    title: 'Rename agent to "Concise Researcher"',
    acceptedTitle: 'Rename to "Concise Researcher" accepted',
    rejectedTitle: 'Rename to "Concise Researcher" rejected',
    description: "A descriptive name helps users pick the right agent faster.",
  },
  {
    title: "Update agent instructions",
    acceptedTitle: "Instructions update accepted",
    rejectedTitle: "Instructions update rejected",
    description: "Ask the agent to cite its sources in every answer.",
  },
  {
    title: 'Change model to "Claude Sonnet"',
    acceptedTitle: 'Model change to "Claude Sonnet" accepted',
    rejectedTitle: 'Model change to "Claude Sonnet" rejected',
    description:
      "A faster model fits the short research tasks this agent runs.",
  },
];

type ProposalState = "active" | "accepted" | "rejected";

function StepThroughDemo() {
  const [states, setStates] = useState<ProposalState[]>(
    PROPOSALS.map(() => "active")
  );
  const [isReviewing, setIsReviewing] = useState(false);

  const pendingIndexes = states.flatMap((s, i) => (s === "active" ? [i] : []));
  const setAll = (state: ProposalState) =>
    setStates((current) => current.map((s) => (s === "active" ? state : s)));
  const review = (index: number, state: ProposalState) => {
    setStates((current) => current.map((s, i) => (i === index ? state : s)));
  };

  if (pendingIndexes.length === 0) {
    const acceptedCount = states.filter((s) => s === "accepted").length;
    return (
      <ActionCardStack cardCount={1}>
        <ActionCardBlock
          title={`${states.length} edits`}
          acceptedTitle={`${acceptedCount} accepted, ${states.length - acceptedCount} rejected`}
          state="accepted"
        />
      </ActionCardStack>
    );
  }

  if (!isReviewing) {
    return (
      <ActionCardStack cardCount={pendingIndexes.length}>
        <RecapCard
          pendingCount={pendingIndexes.length}
          onReview={() => setIsReviewing(true)}
          onRejectAll={() => setAll("rejected")}
          onAcceptAll={() => setAll("accepted")}
        />
      </ActionCardStack>
    );
  }

  const [current] = pendingIndexes;
  return (
    <ActionCardStack cardCount={pendingIndexes.length}>
      <ActionCardBlock
        key={current}
        cardVariant="secondary"
        {...PROPOSALS[current]}
        titleAside={`Edit ${current + 1} of ${PROPOSALS.length}`}
        actions={
          <div className="flex w-full items-center justify-between gap-2 pl-11">
            <Button
              variant="ghost-secondary"
              size="sm"
              label="Accept remaining"
              onClick={() => setAll("accepted")}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                label="Reject"
                onClick={() => review(current, "rejected")}
              />
              <Button
                variant="highlight"
                size="sm"
                label="Accept"
                onClick={() => review(current, "accepted")}
              />
            </div>
          </div>
        }
      />
    </ActionCardStack>
  );
}

/**
 * "Review" brings the first proposal to the front; each accept or reject
 * reveals the next one, and "Accept remaining" accepts every pending
 * proposal at once, until the pile collapses into a summary.
 *
 * @summary Step through proposals one by one from the recap card.
 */
export const StepThroughReview: Story = {
  args: {
    cardCount: PROPOSALS.length,
    children: null,
  },
  render: () => <StepThroughDemo />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("3 edits ready for your review")
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Review" }));
    await expect(canvas.getByText(PROPOSALS[0].title)).toBeInTheDocument();
    await expect(canvas.getByText("Edit 1 of 3")).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Reject" }));
    await expect(canvas.getByText(PROPOSALS[1].title)).toBeInTheDocument();
    await expect(canvas.getByText("Edit 2 of 3")).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Accept remaining" })
    );

    await expect(
      canvas.getByText("2 accepted, 1 rejected")
    ).toBeInTheDocument();
  },
};
