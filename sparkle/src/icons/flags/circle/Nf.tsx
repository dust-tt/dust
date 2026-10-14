import type { SVGProps } from "react";
import * as React from "react";

const SvgNf = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M14.347.992A9.96 9.96 0 0 0 10 0a9.96 9.96 0 0 0-4.348.992L4.782 10l.87 9.008A9.96 9.96 0 0 0 10 20a9.96 9.96 0 0 0 4.347-.992l.87-9.008z"
    />
    <path
      fill="#6DA544"
      d="M5.652.993A10 10 0 0 0 0 10a10 10 0 0 0 5.652 9.007zM14.348.993v18.014A10 10 0 0 0 20 10 10 10 0 0 0 14.348.993M12.609 13.044 10 4.783l-2.608 8.26h1.956v2.174h1.304v-2.174z"
    />
  </svg>
);
export default SvgNf;
