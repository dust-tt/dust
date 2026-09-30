import { A } from "@marketing/components/home/ContentComponents";
import { Button, cn } from "@dust-tt/sparkle";
import { useState } from "react";

export interface CookieConsentChoices {
  analytics: boolean;
  replay: boolean;
}

const CONSENT_SUMMARY_TEXT =
  "With your consent, we use analytics cookies and PostHog session replay to understand how visitors use our marketing website. Session replay records your clicks, scrolling and page interactions so we can review and optimise the visitor experience. Form entries are masked before being sent to PostHog.";
const CONSENT_ACTIONS_TEXT =
  "‘Accept all’ enables both analytics cookies and session replay. Choose ‘Customise’ to select them separately, or ‘Reject all’ to decline both. You can change your choices at any time through Cookie Settings.";

// Choice descriptions. The replay one reuses sentences from the copy above.
const ANALYTICS_CHOICE_TEXT =
  "Help us understand how visitors use this website and measure our marketing.";
const REPLAY_CHOICE_TEXT =
  "Session replay records your clicks, scrolling and page interactions so we can review and optimise the visitor experience. Form entries are masked before being sent to PostHog.";

type BannerView = "summary" | "choices";

// Full-width, taller tap targets on mobile; natural width on larger screens. Every action shares it
// so Accept all and Reject all keep the same size.
const ACTION_SIZE_CLASSES = "h-12 w-full sm:h-10 sm:w-auto sm:min-w-32";
// Reject all: light grey with dark text (Sparkle "outline" darkened for contrast on the dark banner).
const REJECT_CLASSES = cn(
  ACTION_SIZE_CLASSES,
  "from-slate-200 to-slate-300 text-slate-900"
);
// Neutral outline for secondary actions on the dark banner.
const NEUTRAL_OUTLINE_CLASSES = cn(
  ACTION_SIZE_CLASSES,
  "border border-slate-400 text-white hover:bg-white/10 active:bg-white/10"
);

/**
 * @cc [owner:dchristenhuis,label:product;security] replay-choice-off-by-default-and-separate
 * The replay checkbox MUST NOT be shown on the first-visit summary; it is only offered in the
 * choices view (Customise / Cookie Settings), where it MUST start from `savedChoices.replay`, which is
 * false unless the visitor explicitly granted replay before. "Accept all" MUST save both choices as
 * on and "Reject all" MUST save both as off. "Save preferences" MUST save exactly the checkbox
 * values, so it never turns analytics or replay on by itself. Replay MUST NOT be saved as on while
 * analytics is off.
 */
export const CookieBanner = ({
  mode,
  savedChoices,
  onSave,
  onCancel,
  className,
}: {
  mode: "first-visit" | "settings";
  savedChoices: CookieConsentChoices;
  onSave: (choices: CookieConsentChoices) => void;
  onCancel: () => void;
  className?: string;
}) => {
  const [view, setView] = useState<BannerView>(
    mode === "settings" ? "choices" : "summary"
  );
  const [analytics, setAnalytics] = useState(savedChoices.analytics);
  const [replay, setReplay] = useState(savedChoices.replay);

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-banner-heading"
      className={cn(
        "fixed bottom-0 left-0 z-30 max-h-[90vh] w-full overflow-y-auto border-t border-slate-700 bg-slate-900/95 px-4 py-4 shadow-2xl backdrop-blur-sm md:px-8 md:py-5",
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        className || ""
      )}
    >
      <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
        <div className="flex min-w-0 max-w-4xl flex-1 flex-col gap-4">
          {view === "summary" ? (
            <section className="flex flex-col gap-1.5">
              <h2
                id="cookie-banner-heading"
                className="text-base font-medium text-white"
              >
                Cookies and session replay
              </h2>
              <p className="text-sm text-slate-300">{CONSENT_SUMMARY_TEXT}</p>
              <p className="text-sm text-slate-300">
                {CONSENT_ACTIONS_TEXT} View our{" "}
                <A variant="primary" href="/home/platform-privacy">
                  Privacy Policy
                </A>{" "}
                for more information.
              </p>
            </section>
          ) : (
            <>
              <section className="flex flex-col gap-1.5">
                <h2
                  id="cookie-banner-heading"
                  className="text-base font-medium text-white"
                >
                  Cookie Settings
                </h2>
                <p className="text-sm text-slate-300">
                  Choose which optional cookies and tracking you allow. View our{" "}
                  <A variant="primary" href="/home/platform-privacy">
                    Privacy Policy
                  </A>{" "}
                  for more information.
                </p>
              </section>
              <ConsentChoice
                id="cookie-consent-analytics"
                title="Analytics cookies"
                description={ANALYTICS_CHOICE_TEXT}
                checked={analytics}
                onChange={(checked) => {
                  setAnalytics(checked);
                  if (!checked) {
                    setReplay(false);
                  }
                }}
              />
              <ConsentChoice
                id="cookie-consent-session-replay"
                title="Session replay"
                description={REPLAY_CHOICE_TEXT}
                checked={analytics && replay}
                // Replay requires analytics consent.
                disabled={!analytics}
                disabledHint="Requires analytics cookies."
                onChange={setReplay}
              />
            </>
          )}
        </div>

        {/* Desktop: one row, left to right. Mobile summary: Reject all + Customise, then Accept all. */}
        <div
          className={cn(
            "shrink-0 gap-2 sm:flex sm:flex-row sm:justify-end",
            view === "summary" ? "grid grid-cols-2" : "flex flex-col"
          )}
        >
          {view === "summary" ? (
            <>
              {/* Same size as Accept all, different color. */}
              <Button
                variant="outline"
                size="md"
                label="Reject all"
                className={REJECT_CLASSES}
                onClick={() => onSave({ analytics: false, replay: false })}
              />
              <Button
                variant="ghost"
                size="md"
                label="Customise"
                className={NEUTRAL_OUTLINE_CLASSES}
                onClick={() => setView("choices")}
              />
              <Button
                variant="highlight"
                size="md"
                label="Accept all"
                // Full width on its own row on mobile.
                className={cn(ACTION_SIZE_CLASSES, "col-span-2")}
                onClick={() => onSave({ analytics: true, replay: true })}
              />
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="md"
                label={mode === "settings" ? "Cancel" : "Back"}
                className={NEUTRAL_OUTLINE_CLASSES}
                onClick={
                  mode === "settings" ? onCancel : () => setView("summary")
                }
              />
              <Button
                variant="highlight"
                size="md"
                label="Save preferences"
                className={ACTION_SIZE_CLASSES}
                onClick={() =>
                  onSave({ analytics, replay: analytics && replay })
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Heading row (checkbox + title) above its description. No card styling.
const ConsentChoice = ({
  id,
  title,
  description,
  checked,
  disabled = false,
  disabledHint,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onChange: (checked: boolean) => void;
}) => (
  <section className="flex flex-col gap-1">
    <div className="flex items-center gap-2.5">
      <input
        id={id}
        type="checkbox"
        aria-describedby={`${id}-description`}
        className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-500 text-highlight-500 disabled:cursor-not-allowed disabled:opacity-40"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label
        htmlFor={id}
        className="cursor-pointer text-base font-medium text-white"
      >
        {title}
      </label>
    </div>
    <p id={`${id}-description`} className="text-sm text-slate-300">
      {description}
      {disabled && disabledHint && (
        <span className="ml-1.5 text-slate-400">{disabledHint}</span>
      )}
    </p>
  </section>
);
