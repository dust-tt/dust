import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { Button, XClose } from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import { useContext, useState } from "react";

const MODEL_PICKER_IMAGE_PATH = "/static/Model_Picker_Banner.png";
const MODEL_PICKER_BANNER_LOCAL_STORAGE_KEY = "model-picker-banner-dismissed";
const MODEL_PICKER_DOCS_URL =
  "https://docs.dust.tt/docs/user-documentation/agents/model-selection";

interface ModelPickerBannerProps {
  showModelPickerBanner: boolean;
  onShowModelPickerBanner: (open: boolean) => void;
}

function ModelPickerBanner({
  showModelPickerBanner,
  onShowModelPickerBanner,
}: ModelPickerBannerProps) {
  const { openModelPickerRef } = useContext(InputBarContext);

  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    localStorage.setItem(MODEL_PICKER_BANNER_LOCAL_STORAGE_KEY, "true");
    onShowModelPickerBanner(false);
  };

  const onOpenModelPicker = () => {
    openModelPickerRef.current?.();
  };

  const onLearnMore = () => {
    window.open(MODEL_PICKER_DOCS_URL, "_blank", "noopener,noreferrer");
  };

  if (!showModelPickerBanner) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 100, translateY: "0%" }}
      transition={{ duration: 0.1, ease: "easeIn" }}
      exit={{ opacity: 0, translateY: "120%" }}
      className="relative z-10 mx-2 mb-2 hidden max-w-[300px] flex-col rounded-2xl border border-border-dark bg-background shadow-md sm:flex"
    >
      <div className="relative overflow-hidden rounded-t-2xl">
        <img
          src={MODEL_PICKER_IMAGE_PATH}
          alt="Model picker"
          width={300}
          height={98}
          className="h-[98px] w-[300px] border-b border-border-dark object-cover"
        />
        <Button
          variant="outline"
          icon={XClose}
          size="icon-xs"
          className="absolute right-1 top-1"
          onClick={onDismiss}
        />
      </div>
      <div className="relative px-4 py-3">
        <div className="mb-1 text-sm font-medium text-foreground">
          Choose your model straight from the input bar
        </div>
        <h4 className="mb-3 text-xs leading-tight text-primary">
          The global model agents (GPT, Claude, Gemini) are retired! Use the
          model picker with any agent instead.
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="highlight"
            size="xs"
            label="Pick a model"
            onClick={withTracking(
              TRACKING_AREAS.CONVERSATION,
              "open_model_picker_banner",
              onOpenModelPicker
            )}
          />
          <Button
            variant="outline"
            size="xs"
            label="Learn more"
            onClick={withTracking(
              TRACKING_AREAS.CONVERSATION,
              "learn_more_model_picker_banner",
              onLearnMore
            )}
          />
        </div>
      </div>
    </motion.div>
  );
}

interface StackedInAppBannersProps {
  owner: { sId: string };
}

export function StackedInAppBanners({
  owner: _owner,
}: StackedInAppBannersProps) {
  const { hasFeature } = useFeatureFlags();
  const [showModelPickerBanner, setShowModelPickerBanner] = useState(
    () => localStorage.getItem(MODEL_PICKER_BANNER_LOCAL_STORAGE_KEY) !== "true"
  );

  return (
    <AnimatePresence>
      <ModelPickerBanner
        key="model-picker-banner"
        showModelPickerBanner={
          showModelPickerBanner && hasFeature("models_picker")
        }
        onShowModelPickerBanner={setShowModelPickerBanner}
      />
    </AnimatePresence>
  );
}
