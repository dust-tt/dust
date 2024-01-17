import React, { useEffect, useState } from "react";

import { Button } from "@sparkle/_index";
import { XMark } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

interface BannerProps {
  allowDismiss: boolean;
  classNames: string;
  ctaLabel?: string;
  hidden: boolean;
  label: string;
  onClick?: () => void;
  onDismiss?: () => void;
  title: string;
}

// Define defaultProps for the Banner component.
Banner.defaultProps = {
  allowDismiss: true,
  classNames: "",
  hidden: false,
};

export function Banner(props: BannerProps) {
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    setIsDismissed(props.hidden);
  }, [props.hidden]);

  return isDismissed ? (
    <></>
  ) : (
    <div
      className={classNames(
        "sm:s-before:flex-1 s-flex s-items-center s-gap-x-6 s-px-6 s-py-2.5 sm:s-px-3.5",
        props.classNames
      )}
    >
      <div className="s-flex s-flex-1"></div>
      <div className="s-flex s-flex-row s-flex-wrap s-items-center s-gap-4">
        <p className="s-gap-4 s-text-sm s-leading-6 s-text-white">
          <strong className="s-font-semibold">{props.title}</strong>
          <svg
            viewBox="0 0 2 2"
            className="s-mx-2 s-inline s-h-0.5 s-w-0.5 s-fill-current"
            aria-hidden="true"
          ></svg>
          {props.label}
        </p>
        {props.ctaLabel && (
          <Button
            label={props.ctaLabel}
            variant="tertiary"
            onClick={props.onClick}
          />
        )}
      </div>
      <div className="s-flex s-flex-1 s-justify-end">
        <a
          className="focus-visible:outline-offset-[-4px] s--m-3 s-p-3"
          onClick={() => {
            setIsDismissed(true);
            if (props.onDismiss) {
              props.onDismiss();
            }
          }}
        >
          <span className="s-sr-only">Dismiss</span>
          <XMark className="s-h-5 s-w-5 s-text-white" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
