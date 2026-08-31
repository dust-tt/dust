import {
  Button,
  Download01,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Maximize01,
  Minimize01,
  Pin02,
  SheetClose,
  SheetHeader,
  SheetTitle,
  Upload01,
  XClose,
} from "@dust-tt/sparkle";

interface FrameSheetHeaderProps {
  title: string;
  isFullscreen: boolean;
  isPinnedAsBanner?: boolean;
  onToggleFullscreen: () => void;
  onAddToTopBar?: () => void;
  onAddAsBanner?: () => void;
}

export function FrameSheetHeader({
  title,
  isFullscreen,
  isPinnedAsBanner = false,
  onToggleFullscreen,
  onAddToTopBar,
  onAddAsBanner,
}: FrameSheetHeaderProps) {
  return (
    <SheetHeader hideButton>
      <div className="flex min-w-0 items-center gap-2">
        <SheetTitle className="min-w-0 flex-1 truncate">{title}</SheetTitle>
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                icon={Download01}
                isSelect
                label="Export"
                size="sm"
                variant="ghost"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem label="PDF" />
              <DropdownMenuItem label="PNG" />
              <DropdownMenuItem label="Template" />
            </DropdownMenuContent>
          </DropdownMenu>
          <Button icon={Upload01} label="Share" size="sm" variant="ghost" />
          <Button
            icon={isFullscreen ? Minimize01 : Maximize01}
            size="sm"
            tooltip={isFullscreen ? "Exit full screen" : "Open in full screen"}
            variant="ghost"
            onClick={onToggleFullscreen}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                icon={Pin02}
                isSelect
                size="sm"
                tooltip="Pin"
                variant={isPinnedAsBanner ? "highlight-ghost" : "ghost"}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                label="Add to pod top bar"
                onClick={onAddToTopBar}
              />
              <DropdownMenuItem
                label="Add as pod banner"
                onClick={onAddAsBanner}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SheetClose asChild>
          <Button icon={XClose} size="sm" tooltip="Close" variant="ghost" />
        </SheetClose>
      </div>
    </SheetHeader>
  );
}
