import type { SVGProps } from "react";
import * as React from "react";
const SvgClipboardCheck = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M7 7V4H5.993a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12.014a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H17v3H7Zm8-5H9v3h6V2Zm-4 13.5 4.5-4.5 1.5 1.5-6 6-4-4L8.5 13l2.5 2.5Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgClipboardCheck;
