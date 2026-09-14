import type { SVGProps } from "react";
import * as React from "react";

const SvgJira = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#1868DB"
      d="M8.075 15.936h-1.97C3.131 15.936 1 14.128 1 11.484h10.596c.55 0 .905.387.905.935V23c-2.65 0-4.426-2.129-4.426-5.097zm5.233-5.259h-1.97c-2.972 0-5.105-1.774-5.105-4.419H16.83c.549 0 .937.355.937.903v10.581c-2.65 0-4.459-2.13-4.459-5.097zm5.266-5.225h-1.97c-2.973 0-5.105-1.807-5.105-4.452h10.596c.55 0 .905.387.905.903v10.58c-2.65 0-4.426-2.128-4.426-5.096z"
    />
  </svg>
);
export default SvgJira;
