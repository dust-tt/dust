import { Image } from "@app/lib/platform";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { Button, XMarkIcon } from "@dust-tt/sparkle";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

const TABLE_IMAGE_PATH = "/static/banners/table_webinar.png";
const TABLE_BANNER_LOCAL_STORAGE_KEY = "table-sales-banner-dismissed";
const TABLE_BANNER_URL =
  "https://watch.getcontrast.io/register/dust-table-for-sales";

export function TableForSalesBanner() {
  const [showBanner, setShowBanner] = useState(() => {
    return localStorage.getItem(TABLE_BANNER_LOCAL_STORAGE_KEY) !== "true";
  });

  const onDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    localStorage.setItem(TABLE_BANNER_LOCAL_STORAGE_KEY, "true");
    setShowBanner(false);
  };

  const onRegister = () => {
    window.open(TABLE_BANNER_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <AnimatePresence>
      {showBanner ? (
        <motion.div
          initial={{ opacity: 100, translateY: "0%" }}
          transition={{ duration: 0.1, ease: "easeIn" }}
          exit={{ opacity: 0, translateY: "120%" }}
          className="relative z-10 mx-2 mb-2 hidden cursor-pointer flex-col rounded-2xl border border-border-dark bg-white shadow-md dark:border-border-night dark:bg-background-night sm:flex"
          onClick={withTracking(
            TRACKING_AREAS.BANNER,
            "cta_table_sales_banner",
            onRegister
          )}
        >
          <div className="relative w-full overflow-hidden rounded-t-2xl">
            <Image
              src={TABLE_IMAGE_PATH}
              alt="Table for Sales"
              width={300}
              height={98}
              className="w-full border-b border-border-dark object-cover dark:border-border-night"
              priority
            />
            <Button
              variant="outline"
              icon={XMarkIcon}
              className="absolute right-1 top-1 opacity-80"
              onClick={onDismiss}
            />
          </div>
          <div className="relative px-4 py-3">
            <div className="mb-1 text-sm font-medium text-foreground dark:text-foreground-night">
              Table for Sales — Live Demo
            </div>
            <h4 className="mb-3 text-xs leading-tight text-muted-foreground dark:text-muted-foreground-night">
              Watch our Sales rep demo the agents he built to run his entire
              sales process. Real workflows, zero fluff. Mar 2, 6PM CET.
            </h4>
            <Button
              variant="highlight"
              size="xs"
              label="Register"
              onClick={withTracking(
                TRACKING_AREAS.BANNER,
                "cta_table_sales_banner",
                onRegister
              )}
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
