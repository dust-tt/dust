import type { SVGProps } from "react";
import * as React from "react";

const SvgBb = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#FFDA44"
      d="M14.348.992A9.96 9.96 0 0 0 10.001 0a9.96 9.96 0 0 0-4.348.992L4.783 10l.87 9.008A9.96 9.96 0 0 0 10 20a9.96 9.96 0 0 0 4.347-.992l.87-9.008z"
    />
    <path
      fill="#0052B4"
      d="M5.652.993A10 10 0 0 0 0 10a10 10 0 0 0 5.652 9.007zM14.348.993v18.014A10 10 0 0 0 20 10 10 10 0 0 0 14.348.993"
    />
    <path
      fill="#000"
      d="m13.043 6.087-.583-.292c-.035.07-.797 1.62-.921 3.988h-.887V6.087L10 5.217l-.652.87v3.696H8.46c-.124-2.368-.886-3.917-.921-3.988l-1.167.584c.008.016.8 1.63.8 4.056v.652h2.175v3.696h1.304v-3.696h2.174v-.652c0-1.255.217-2.29.4-2.936.198-.706.4-1.118.401-1.122z"
    />
  </svg>
);
export default SvgBb;
