import type { SVGProps } from "react";
import * as React from "react";

const SvgFigma = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10.965 16.535H8.5A2.465 2.465 0 1 0 10.965 19zm7-4.535a2.465 2.465 0 1 0-4.93 0l.013.252A2.465 2.465 0 0 0 17.965 12m-11.93 0A2.465 2.465 0 0 0 8.5 14.465h2.465v-4.93H8.5A2.465 2.465 0 0 0 6.035 12m11.93-7A2.465 2.465 0 0 0 15.5 2.535h-2.465v4.93H15.5A2.465 2.465 0 0 0 17.965 5M6.035 5A2.465 2.465 0 0 0 8.5 7.465h2.465v-4.93H8.5A2.465 2.465 0 0 0 6.035 5m14 0c0 1.41-.643 2.668-1.652 3.5a4.535 4.535 0 0 1-5.348 7.306V19a4.535 4.535 0 1 1-7.419-3.5A4.53 4.53 0 0 1 3.965 12c0-1.41.643-2.668 1.651-3.5A4.535 4.535 0 0 1 8.5.465h7A4.535 4.535 0 0 1 20.035 5"
    />
  </svg>
);
export default SvgFigma;
