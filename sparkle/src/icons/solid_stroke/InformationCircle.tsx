import * as React from "react";
import type { SVGProps } from "react";
const SvgInformationCircle = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 3.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5ZM2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm9-3.75A.75.75 0 0 1 12 7.5h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75H12a.75.75 0 0 1-.75-.75V8.25Zm-.294 2.308c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 1 1 .67 1.34l-.041.022c-1.146.573-2.437-.463-2.126-1.706l.709-2.836-.042.02a.75.75 0 1 1-.67-1.34l.041-.022Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgInformationCircle;
