import type { SVGProps } from "react";
import * as React from "react";

const SvgSpaceOpen = (props: SVGProps<SVGSVGElement>) => (
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
      d="M14.297 17.545a1 1 0 0 1 .765 1.848A8 8 0 0 1 12 20a8 8 0 0 1-3.062-.607 1 1 0 0 1 .765-1.848A6 6 0 0 0 12 18c.815 0 1.59-.162 2.297-.455M4 12c0-1.083.216-2.118.607-3.062a1 1 0 0 1 1.848.765A6 6 0 0 0 6 12c0 .815.162 1.59.455 2.297a1 1 0 0 1-1.848.765A8 8 0 0 1 4 12m14 0c0-.815-.162-1.59-.455-2.297a1 1 0 0 1 1.848-.765A8 8 0 0 1 20 12a8 8 0 0 1-.607 3.063 1 1 0 0 1-1.848-.766A6 6 0 0 0 18 12m-6-8c1.083 0 2.118.216 3.063.607a1 1 0 0 1-.766 1.848A6 6 0 0 0 12 6c-.815 0-1.59.162-2.297.455a1 1 0 0 1-.765-1.848A8 8 0 0 1 12 4"
    />
  </svg>
);
export default SvgSpaceOpen;
