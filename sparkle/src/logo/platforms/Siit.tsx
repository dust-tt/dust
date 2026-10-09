import * as React from "react";
import type { SVGProps } from "react";
const SvgSiit = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect width={24} height={24} fill="#026049" rx={6} />
    <path
      fill="#FFF"
      fillRule="evenodd"
      d="m11.64 4.62-2.764-.345a3.23 3.23 0 0 0-3.604 2.806l-.575 4.625h2.82L8.605 7.91a1.29 1.29 0 0 1 1.598-.885l1.437.412zm0 11.714-3.794-1.088a1.29 1.29 0 0 1-.886-1.598l.37-1.289H4.615l-.34 2.735a3.23 3.23 0 0 0 2.806 3.603l4.56.568zm.654 3.012v-2.824l1.507.432c.685.196 1.4-.2 1.597-.886l1.064-3.709h2.8l-.564 4.53a3.23 3.23 0 0 1-3.604 2.806zm0-11.722V4.701l4.595.571a3.23 3.23 0 0 1 2.806 3.604l-.352 2.83h-2.694l.395-1.376a1.29 1.29 0 0 0-.886-1.597z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgSiit;
