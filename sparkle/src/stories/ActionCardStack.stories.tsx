import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import { expect, userEvent } from "storybook/test";

import type { ActionCardStackExitDirection } from "../index_with_tw_base";
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
        component: `A pile of action cards rendered inside an agent message when several proposals are grouped together. **cards** lists the whole pile, front first. Only the front card is rendered and interactive; up to two tilted, decorative layers are drawn behind it, and they stretch to the front card's height.

**When to use**
- When an agent message proposes several changes at once: put a recap **ActionCardBlock** ("N edits ready for your review", with review / reject all / accept all actions) in front of the proposals, then drop cards from the front as the user reviews them.

**Guidelines**
- Give the front card \`cardVariant="secondary"\` so it reads lighter than the layers behind it.
- Pass only the cards still to review, each with a stable **key**, so the pile shrinks as the user goes through it.
- Set **exitDirection** with each decision (\`"right"\` when accepted, \`"left"\` when rejected), so reviewed cards slide off the pile. Cards decided in bulk leave one after another, each shown in front first.
- Once nothing is left to review, pass a single resolved summary card.`,
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

// Cards behind the front one are never rendered, only counted as layers.
function placeholderCards(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    key: `proposal-${index}`,
    card: null,
  }));
}

/**
 * The full pile: a recap card at the front with two tilted layers behind it.
 * Four or more cards still render only three.
 *
 * @summary Recap card on top of a pile of four proposals.
 */
export const RecapOnTop: Story = {
  args: {
    cards: [
      { key: "recap", card: <RecapCard pendingCount={4} /> },
      ...placeholderCards(4),
    ],
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
    cards: [
      { key: "recap", card: <RecapCard pendingCount={2} /> },
      ...placeholderCards(1),
    ],
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
    cards: [
      {
        key: "summary",
        card: (
          <ActionCardBlock
            title="4 edits"
            acceptedTitle="3 edits accepted, 1 rejected"
            state="accepted"
          />
        ),
      },
    ],
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
  const [exitDirection, setExitDirection] =
    useState<ActionCardStackExitDirection>();

  const pendingIndexes = states.flatMap((s, i) => (s === "active" ? [i] : []));
  const decide = (indexes: number[], state: ProposalState) => {
    setExitDirection(state === "accepted" ? "right" : "left");
    setStates((current) =>
      current.map((s, i) => (indexes.includes(i) ? state : s))
    );
  };
  const startReview = () => {
    setExitDirection("right");
    setIsReviewing(true);
  };

  const proposalCards = pendingIndexes.map((index) => ({
    key: `proposal-${index}`,
    card: (
      <ActionCardBlock
        cardVariant="secondary"
        {...PROPOSALS[index]}
        titleAside={`Edit ${index + 1} of ${PROPOSALS.length}`}
        actions={
          <div className="flex w-full items-center justify-between gap-2 pl-11">
            <Button
              variant="ghost-secondary"
              size="sm"
              label="Accept remaining"
              onClick={() => decide(pendingIndexes, "accepted")}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                label="Reject"
                onClick={() => decide([index], "rejected")}
              />
              <Button
                variant="highlight"
                size="sm"
                label="Accept"
                onClick={() => decide([index], "accepted")}
              />
            </div>
          </div>
        }
      />
    ),
  }));

  const acceptedCount = states.filter((s) => s === "accepted").length;
  const cards =
    pendingIndexes.length === 0
      ? [
          {
            key: "summary",
            card: (
              <ActionCardBlock
                title={`${states.length} edits`}
                acceptedTitle={`${acceptedCount} accepted, ${states.length - acceptedCount} rejected`}
                state="accepted"
              />
            ),
          },
        ]
      : isReviewing
        ? proposalCards
        : [
            {
              key: "recap",
              card: (
                <RecapCard
                  pendingCount={pendingIndexes.length}
                  onReview={startReview}
                  onRejectAll={() => decide(pendingIndexes, "rejected")}
                  onAcceptAll={() => decide(pendingIndexes, "accepted")}
                />
              ),
            },
            ...proposalCards,
          ];

  return <ActionCardStack cards={cards} exitDirection={exitDirection} />;
}

/**
 * "Review" slides the recap card out and brings the first proposal to the
 * front; each accept or reject slides the card out (right when accepted, left
 * when rejected) and reveals the next one, and bulk actions slide every
 * pending card out one after another, until the pile collapses into a summary.
 *
 * @summary Step through proposals one by one from the recap card.
 */
export const StepThroughReview: Story = {
  args: {
    cards: [],
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
    // Each remaining proposal still shows in front before it leaves.
    await expect(canvas.getByText(PROPOSALS[2].title)).toBeInTheDocument();

    await expect(
      await canvas.findByText("2 accepted, 1 rejected", undefined, {
        timeout: 3000,
      })
    ).toBeInTheDocument();
  },
};
