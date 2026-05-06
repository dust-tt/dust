import type { SVGProps } from "react";
import * as React from "react";

const SvgPaperclip = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12.996 2.743a4.536 4.536 0 0 1 6.414 6.414l-8.662 8.662a2.786 2.786 0 0 1-3.94-3.938l7.602-7.602a1.035 1.035 0 0 1 1.464 1.464l-7.602 7.6a.716.716 0 0 0 1.012 1.012l8.662-8.662a2.465 2.465 0 0 0-3.486-3.486l-9.016 9.015a4.215 4.215 0 0 0 5.961 5.961l9.016-9.015a1.035 1.035 0 0 1 1.463 1.464l-9.015 9.015a6.286 6.286 0 0 1-8.889-8.889z"
    />
  </svg>
);
export default SvgPaperclip;
