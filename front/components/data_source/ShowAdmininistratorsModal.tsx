import { Avatar, Modal, Page } from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";

import { useAdmins } from "@app/lib/swr";

type ShowAdmininistratorsModalProps = {
  isOpen: boolean;
  owner: LightWorkspaceType;
  onClose: () => void;
};

export const ShowAdmininistratorsModal = ({
  isOpen,
  owner,
  onClose,
}: ShowAdmininistratorsModalProps) => {
  const { admins, isAdminsLoading } = useAdmins(owner);
  return (
    <Modal
      isOpen={isOpen}
      title="Administrators"
      onClose={onClose}
      hasChanged={false}
      variant="side-sm"
    >
      <div className="flex flex-col gap-5 pt-6 text-sm text-element-700">
        <Page.SectionHeader
          title="Administrators"
          description={`${owner.name} has the following administrators:`}
        />
        {isAdminsLoading ? (
          <div className="flex animate-pulse items-center justify-center gap-3 border-t border-structure-200 bg-structure-50 py-2 text-xs sm:text-sm">
            <div className="hidden sm:block">
              <Avatar size="xs" />
            </div>
            <div className="flex grow flex-col gap-1 sm:flex-row sm:gap-3">
              <div className="font-medium text-element-900">Loading...</div>
              <div className="grow font-normal text-element-700"></div>
            </div>
          </div>
        ) : (
          <div className="s-w-full">
            {admins.map((admin) => {
              return (
                <div
                  key={`member-${admin.id}`}
                  className="flex items-center justify-center gap-3 border-t border-structure-200 p-2 text-xs sm:text-sm"
                >
                  <div className="hidden sm:block">
                    <Avatar
                      visual={admin.image}
                      name={admin.fullName}
                      size="sm"
                    />
                  </div>
                  <div className="flex grow flex-col gap-1 sm:flex-row sm:gap-3">
                    <div className="font-medium text-element-900">
                      {admin.fullName}
                    </div>
                    <div className="grow font-normal text-element-700">
                      {admin.email}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
