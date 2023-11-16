import type { SVGProps } from "react";
import * as React from "react";
const SvgRobotShared = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M19 2.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M14 6a2 2 0 0 1 2-2h4c1.105 0 2 .894 2 1.999V9a2 2 0 0 1-2 2h-3.5a2.49 2.49 0 0 1-1.103-.256c-.568-.28-1.262-.442-1.801-.11A1.25 1.25 0 0 0 13 11.699v2.24a2 2 0 0 0 1.515 1.94l.246.061c.159.04.322.06.485.06H20a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-1.745c0-.593-.313-1.142-.824-1.444-.648-.383-1.463-.235-2.173.017A2.995 2.995 0 0 1 10 18H4a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3h6c.49 0 .95.117 1.359.325.593.302 1.308.468 1.893.151.46-.25.748-.731.748-1.256V6Zm2.5 1.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm1.5 2s1 0 1.5-.5v-.5h-3V9c.5.5 1.5.5 1.5.5Zm-9 5.25c-.667.75-1.5.75-2 .75s-1.333 0-2-.75V14h4v.75ZM19.5 21c-.5.5-1.5.5-1.5.5s-1 0-1.5-.5v-.5h3v.5ZM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm12.25 5.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm3 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM19.5 7.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM10 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="M7 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM18 15.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
    />
  </svg>
);
export default SvgRobotShared;
