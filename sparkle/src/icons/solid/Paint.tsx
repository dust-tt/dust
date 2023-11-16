import type { SVGProps } from "react";
import * as React from "react";
const SvgPaint = (props: SVGProps<SVGSVGElement>) => (
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
      d="m19.228 18.732 1.767-1.768 1.768 1.768a2.5 2.5 0 1 1-3.535 0ZM8.878 1.08l11.314 11.313a1 1 0 0 1 0 1.414l-8.485 8.486a1 1 0 0 1-1.414 0l-8.485-8.486a1 1 0 0 1 0-1.414l7.778-7.778-2.122-2.121L8.88 1.08ZM11 6.03 3.929 13.1H18.07L11 6.03Z"
    />
  </svg>
);
export default SvgPaint;
