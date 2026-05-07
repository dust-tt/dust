import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowBlockUp = (props: SVGProps<SVGSVGElement>) => (
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
      d="M7.498 8.965H9c.572 0 1.035.463 1.035 1.035v9.965h3.93V10c0-.572.463-1.035 1.035-1.035h1.502L12 4.463zM16.035 20.2c0 .123 0 .277-.01.412a1.5 1.5 0 0 1-.157.585 1.54 1.54 0 0 1-.67.671 1.5 1.5 0 0 1-.586.156c-.135.011-.289.011-.412.011H9.8c-.123 0-.277 0-.412-.01a1.5 1.5 0 0 1-.585-.157 1.54 1.54 0 0 1-.671-.67 1.5 1.5 0 0 1-.156-.586c-.011-.135-.011-.289-.011-.412v-9.165H5a1.035 1.035 0 0 1-.731-1.766l7-7 .078-.072a1.035 1.035 0 0 1 1.385.072l7 7A1.035 1.035 0 0 1 19 11.035h-2.965z"
    />
  </svg>
);
export default SvgArrowBlockUp;
