import type { SVGProps } from "react";
import * as React from "react";

const SvgLokalise = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 489 489"
    {...props}
  >
    <path
      fill="#FCB9B0"
      d="M355.648 0H133.352C59.704 0 0 59.704 0 133.352v222.296C0 429.296 59.704 489 133.352 489h222.296C429.296 489 489 429.296 489 355.648V133.352C489 59.704 429.296 0 355.648 0"
    />
    <path
      fill="#131E29"
      d="M386.309 295.169h-91.383l-49.938 49.938-49.991-49.938h-91.33v49.938h70.66l35.304 35.357 35.357 35.303 35.304-35.303 35.356-35.357h70.661zM386.309 195.24H103.667v49.938h282.642zM386.309 95.311H103.667v49.938h282.642z"
    />
  </svg>
);
export default SvgLokalise;
