import { classNames } from "@app/lib/utils";

export function BuilderLayout({
  leftPanel,
  rightPanel,
  buttonsRightPanel,
  isRightPanelOpen,
}: {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  buttonsRightPanel: React.ReactNode;
  isRightPanelOpen: boolean;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex h-full w-full grow items-center justify-center gap-5 px-5">
        <div className="h-full w-full max-w-[900px] grow">{leftPanel}</div>
        <div className="hidden h-full items-center gap-4 lg:flex">
          {buttonsRightPanel}
          <div
            className={classNames(
              "duration-400 h-full transition-opacity ease-out",
              isRightPanelOpen ? "opacity-100" : "opacity-0"
            )}
          >
            <div
              className={classNames(
                "duration-800 h-full transition-all ease-out",
                isRightPanelOpen ? "w-[440px]" : "w-0"
              )}
            >
              {rightPanel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
