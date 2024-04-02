import { useRouter } from "next/router";
import { useState, useEffect, useCallback } from "react";
import { InferGetServerSidePropsType } from "next";
import { withDefaultUserAuthRequirements } from "@dust-tt/lib/iam/session";
import { subNavigationAdmin } from "@dust-tt/components/sparkle/navigation";
import { ConnectorProvider } from "@dust-tt/types";
import { Button, Chip, ContextItem, Popup } from "@dust-tt/sparkle";
import { CloudArrowLeftRightIcon } from "@dust-tt/icons";
import { ConnectorSyncingChip } from "@dust-tt/components/sparkle/ConnectorSyncingChip";
import { Cog6ToothIcon } from "@dust-tt/icons";
import { InformationCircleIcon } from "@dust-tt/icons;
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";



export const userGoogleDriveConnector = withDefaultUserAuthRequirements<{ 
  owner: WorkspaceType; 
  subscription: SubscriptionType; 
}>(async (context, auth) => {
  return (
        <ContextItem
                  title={'Google Drive'}
                  visual={
                    <ContextItem.Visual
                      visual={
                        CONNECTOR_CONFIGURATIONS['google_drive']
                          .logoComponent
                      }
                    />
                  }
                  action={
                    <div className="relative">
                      <Button.List>
                        {(() => {
                          let disabled = !isAdmin;

                          const onClick = async () => {
                            let isDataSourceAllowedInPlan: boolean;
                            // TODO : PUT A REAL PLAN CHECK HERE
                            // isDataSourceAllowedInPlan = planConnectionsLimits.isGoogleDriveAllowed;
                            isDataSourceAllowedInPlan = true;

                            if (!isDataSourceAllowedInPlan) {
                              // setShowUpgradePopupForProvider(
                              //   ds.connectorProvider as ConnectorProvider
                              // );
                              disabled = true;
                            } else {
                              if (isBuilt) {
                                setShowConfirmConnection(ds);
                              } else {
                                setShowPreviewPopupForProvider(
                                  ds.connectorProvider
                                );
                              }
                            }
                            return;
                          };

                          const label = !isBuilt
                            ? "Preview"
                            : !isLoadingByProvider[
                                ds.connectorProvider as ConnectorProvider
                              ] && !ds.fetchConnectorError
                            ? "Connect"
                            : "Connecting...";

                          if (!ds || !ds.connector) {
                            return (
                              <Button
                                variant="primary"
                                icon={
                                  isBuilt
                                    ? CloudArrowLeftRightIcon
                                    : InformationCircleIcon
                                }
                                disabled={disabled}
                                onClick={onClick}
                                label={label}
                              />
                            );
                          } else {
                            return (
                              <Button
                                variant="secondary"
                                icon={Cog6ToothIcon}
                                disabled={
                                  !isBuilt ||
                                  isLoadingByProvider[
                                    ds.connectorProvider as ConnectorProvider
                                  ] ||
                                  // Can't manage or view if not (admin or not readonly (ie builder)).
                                  !(isAdmin || !readOnly)
                                }
                                onClick={() => {
                                  void router.push(
                                    `/w/${owner.sId}/builder/data-sources/${ds.dataSourceName}`
                                  );
                                }}
                                label={isAdmin ? "Manage" : "View"}
                              />
                            );
                          }
                        })()}
                      </Button.List>
                      <Popup
                        show={
                          showUpgradePopupForProvider === ds.connectorProvider
                        }
                        className="absolute bottom-8 right-0"
                        chipLabel={`${plan.name} plan`}
                        description="Unlock this managed data source by upgrading your plan."
                        buttonLabel="Check Dust plans"
                        buttonClick={() => {
                          void router.push(`/w/${owner.sId}/subscription`);
                        }}
                        onClose={() => {
                          setShowUpgradePopupForProvider(null);
                        }}
                      />
                      <Popup
                        show={
                          showPreviewPopupForProvider === ds.connectorProvider
                        }
                        className="absolute bottom-8 right-0"
                        chipLabel="Coming Soon!"
                        description="Please email us at team@dust.tt for early access."
                        buttonLabel="Contact us"
                        buttonClick={() => {
                          window.open(
                            "mailto:team@dust.tt?subject=Early access to the Intercom connection"
                          );
                        }}
                        onClose={() => {
                          setShowPreviewPopupForProvider(null);
                        }}
                      />
                    </div>
                  }
                >
                  {ds && ds.connector && (
                    <div className="mb-1 mt-2">
                      {(() => {
                        if (ds.fetchConnectorError) {
                          return (
                            <Chip color="warning">
                              Error loading the connector. Try again in a few
                              minutes.
                            </Chip>
                          );
                        } else {
                          return (
                            <ConnectorSyncingChip
                              initialState={ds.connector}
                              workspaceId={ds.connector.workspaceId}
                              dataSourceName={ds.connector.dataSourceName}
                            />
                          );
                        }
                      })()}
                    </div>
                  )}
                  <ContextItem.Description>
                    <div className="text-sm text-element-700">
                      {ds.description}
                    </div>
                  </ContextItem.Description>
                </ContextItem>

  );
}
);