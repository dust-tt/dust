import type { SVGProps } from "react";
import * as React from "react";

const SvgBuildingHospital = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16 16a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2zM12 6a1 1 0 0 1 1 1v1h1a1 1 0 1 1 0 2h-1v1a1 1 0 1 1-2 0v-1h-1a1 1 0 1 1 0-2h1V7a1 1 0 0 1 1-1"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M16.8 2c.543 0 1.012-.001 1.395.03.396.033.789.104 1.167.297a3 3 0 0 1 1.31 1.31c.194.379.265.772.298 1.168.031.383.03.852.03 1.395V20h1a1 1 0 1 1 0 2H2a1 1 0 1 1 0-2h1V6.2c0-.543-.001-1.012.03-1.395.033-.396.104-.789.297-1.167a3 3 0 0 1 1.31-1.31c.379-.194.772-.265 1.168-.298C6.188 2 6.657 2 7.2 2zM7.2 4c-.576 0-.949.001-1.232.024-.272.023-.373.06-.422.085a1 1 0 0 0-.437.437c-.025.05-.062.15-.085.422C5.001 5.25 5 5.624 5 6.2V20h1v-3a3 3 0 0 1 6 0v3h7V6.2c0-.576-.001-.949-.024-1.232-.023-.272-.06-.373-.085-.422a1 1 0 0 0-.437-.437c-.05-.025-.15-.062-.422-.085A17 17 0 0 0 16.8 4zM9 16a1 1 0 0 0-1 1v3h2v-3a1 1 0 0 0-1-1"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgBuildingHospital;
