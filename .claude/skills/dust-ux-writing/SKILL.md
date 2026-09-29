---
name: dust-ux-writing
description: Guidelines for writing and reviewing Dust product UI copy — buttons, errors, empty states, onboarding, tooltips, modals, form labels, notifications, settings, and any text a user reads inside the product. Use whenever writing, editing, or reviewing user-facing strings in front/ or sparkle/. Does NOT cover marketing or landing page copy, blog posts, release notes, help center articles, sales emails, or API documentation.
---

# Dust product UX writing

## When to use this skill

Use for any text that ships inside the product interface — buttons, errors, empty states, onboarding, tooltips, modals, form labels, notifications, settings, and anything else a user reads while using the product.

Does NOT cover marketing and landing page copy, blog posts, release notes, help center articles, sales emails, or API documentation.

If the component is unknown, find a matching one in the Sparkle design system: `sparkle/src/components/` (stories in `sparkle/src/stories/`).

## About Dust

Dust is a secure AI platform that combines language models, company knowledge, and collaboration tools. It is a technical product designed to remain accessible to non-technical users.

## Voice

- Compressed, straightforward and confident. No preamble, no wind-up.
- Warm but not casual. Precise and concise but not cold.
- Clear and accessible to non-tech experts — but don't strip the technical signals that help understand AI mechanics. Make technical features understandable without oversimplifying them.
- No forced personality. Precision is the style here.
- Solution-driven. Focused on helping people understand and act.

Our neutral is warm-but-efficient. That is the baseline the whole scale moves around: "serious" means dropping the warmth, not becoming clinical or robotic, and "playful" means a little more warmth, not a different personality.

## Vocabulary

- Plain language — always. For example, prefer "Your agent has been saved." to "Agent saved".
- Do not use marketing buzzwords such as Boost, Augment, Enhance, Leverage, Drive, Empower.
- "You" and "your" dominate — the reader is the subject.
- Use the words "agents" or "skills", never "assistant" or "bot".
- Refer to Dust as a "platform", not as a "tool".
- Refer to Dust product documentation and existing product copy to find feature names and terminology.

## 1. Identify the component when the user hasn't specified it

Before proposing copy, identify the relevant Sparkle component family and content role internally. Suggest it to the user to confirm.

This skill applies to:

- Error messages
- CTAs and buttons
- Tooltips
- Empty states
- Onboarding flows
- In-product feature discovery
- Button labels
- Form labels
- Helper text
- Banners
- Toast messages
- Modal titles and subtitles
- Confirmation dialogs
- Validation messages
- Navigation labels
- Menu items
- Table actions
- Status messages
- Loading messages
- Component states
- Agent and conversation surfaces
- Titles and subtitles

If no Sparkle guidance is available, apply the general rules in this skill and clearly label assumptions. Do not present assumptions as Sparkle standards.

## 2. Identify the component contract

Before proposing copy, determine internally:

- What the component is
- What the component is used for
- What the user is doing
- What outcome the copy should support
- Which content slots exist
- The information hierarchy
- The appropriate length
- The expected action or reading pattern
- Relevant states
- Accessibility requirements
- The relationship to adjacent elements

Use this reasoning internally. Do not output a separate component analysis by default. Only mention the component reasoning when it changes the recommendation or the user asks for it.

## 3. General product-writing principles

If context is unclear, ask one or two concise clarifying questions before suggesting copy.

### Use the user's language

Avoid internal, technical, or implementation-focused terminology when users do not need it. Translate system concepts into language that describes what the user experiences. For example:

- Prefer "This conversation is too long" over "Context limit reached."
- Prefer "Start a new conversation" over "Reset context."
- Prefer "Close without saving" over "Discard instance state."

Do not simplify the copy if doing so changes the meaning or hides an important consequence.

### Stakes set the ceiling on playfulness

Errors, failures, permission requests, and destructive confirmations get plain, direct, serious language — no wordplay. Use constructive and respectful language, but do not soften the message so much that the user cannot understand what happened. Avoid blame, shame, unnecessary alarm, jokes, and overly casual language when stakes are high.

### Celebration should be proportional to effort

Not all success is equal. A small success — draft saved, link copied, field validated — is a receipt: keep it short, concise, informative. A large success — finished onboarding, shipped a first project, completed something that took real work — has earned genuine warmth, and flat language there feels cold. Match the size of the reaction to the size of what the user actually invested.

### Warmth is carried by word choice, not punctuation

Do not use emoji. Do not use exclamation marks. If a line only feels friendly because of an exclamation mark, the words are not doing the work — rewrite the words.

## 4. Onboarding and feature discovery

Onboarding, product tours, new-feature presentation, in-product announcements, discovery surfaces, and first-use experiences are product surfaces.

Use product UX writing principles as the foundation, while allowing more benefit-oriented and welcoming language when it helps users understand or discover a capability.

The copy may:

- Explain why a feature is useful
- Create interest
- Make a new capability feel approachable
- Encourage the user to try the feature

Keep the copy concrete, concise, accurate, actionable, and relevant to the user's current context.

Do not add promotional language to errors, permissions, validation messages, security warnings, destructive confirmations, or other moments where clarity and reassurance matter more than discovery.

## 5. Component-specific rules

### Buttons and CTAs

- Use one clear action verb by default.
- If one word is not possible, use a concise verb-first label of two or three words.
- Do not make a button longer by default.
- Name the outcome when possible.
- If the user asks for a longer label, provide it but explain briefly that it may increase scanning effort and reduce action clarity.
- For icon-only buttons, require a meaningful tooltip.

### Modals and confirmation dialogs

- Put the main state, risk, or consequence in the title.
- Put supporting context in the subtitle or message.
- Use clear outcome-based buttons.
- Make the safer or reversible action easy to choose.
- Name destructive actions precisely.
- Use only the slots that exist or were provided. Never invent a subtitle, button, or other UI element.

### Error messages

When something changes, fails, or requires confirmation, make the following clear when relevant:

- What happened
- What it means for the user
- What the user can do next — one clear next step. Do not overwhelm with too many options.

Use everyday language instead of internal technical terms. Do not blame the user. Do not use jokes or marketing language in errors.

### Form labels and validation

- Identify the field or requirement precisely.
- Explain what needs to be corrected.
- Avoid generic messages such as "Invalid input" when a more specific explanation is possible.
- Keep the correction actionable.

### Tooltips and helper text

- Explain the control or concept.
- Provide the smallest useful amount of context.
- Do not repeat the visible label.
- Do not introduce unnecessary product terminology.

### Empty states

- Name the current state.
- Explain what is missing when necessary.
- Provide the next useful action.
- Do not use an empty state as an excuse for a long product description.

### Banners and toasts

- Lead with the status or change.
- Include a next step only when action is needed.
- Keep temporary messages short.
- Do not imply that an action is complete before it is complete.

### Navigation and menu labels

- Use concise nouns or verb phrases.
- Help users predict the destination or action.
- Keep labels consistent with nearby navigation items.
- Distinguish between a clickable nav item and a non-clickable section header. A section header labels a group — it tolerates two words and a noun phrase; a clickable nav item sitting among single-word peers should match that weight.
- For group headers, choose a label that names the nature of the group, not its absence from other groups. Avoid labels that describe what the items are not (e.g., "Unsorted", "Other") when a positive label is available.
- Check for vocabulary collisions: a label used elsewhere in the product (e.g., a pricing tier, a status, a feature name) will mislead users even if the meaning is technically distinct.

### Status and loading messages

- Describe the current state.
- Use language that reflects what is actually happening.
- Do not imply completion before the process is complete.
- Avoid unnecessary jokes, filler, or ellipses.

## 6. Output format

Unless the user explicitly asks for a different number, provide exactly three options.

### Option 1: Recommended

Mark Option 1 as recommended. Show only the relevant copy slots.

When the component has multiple slots, analyze each relevant slot separately. For example:

- Title tone
- Subtitle tone
- Button logic
- Message tone

For message-only components, analyze only the message.

### Options 2 and 3

Show only the relevant copy slots. For each option, provide:

- One concise overall **Tone** explanation
- One concise **Logic** explanation
- The main **trade-off** compared with Option 1

Do not analyze each slot separately for Options 2 and 3.

### Rules

- Do not invent UI elements.
- Do not add a separate Component, Recommendation, or Recap section.
- Do not repeat the recommended copy after Option 1.
- Do not provide eight near-duplicate options.

When editing copy directly in code (rather than proposing options), apply the recommended option and briefly mention the alternatives only if the choice is non-obvious.

## 7. Keep the answer focused

Do not output a separate component analysis, component family, assumptions, or process recap by default. Use that reasoning internally. Include it only when:

- It changes the recommendation
- Exact Sparkle guidance is unavailable
- The user asks for the reasoning
- A product behavior or accessibility concern needs to be surfaced

Keep the copy concise without removing necessary context.

## 8. Final quality check

Before responding, verify that:

- The copy is clearly product-oriented.
- The tone matches the product moment.
- Product copy is clear and actionable.
- Onboarding and feature-discovery copy has useful benefit framing without becoming hype.
- The main point appears immediately.
- The user can understand the copy without internal terminology.
- The next action is clear when action is required.
- The copy matches the relevant component and its available slots.
- No UI element was invented.
- Alternatives are meaningfully different.
- The answer is concise.
- No banned marketing buzzwords were introduced.
- No marketing language leaked into sensitive product moments.
- The copy sounds natural when read aloud.
