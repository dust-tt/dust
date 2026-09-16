import { defineSignal } from "@temporalio/workflow";

export const syncWorkOSITContactsSignal = defineSignal<[void]>(
  "sync_workos_it_contacts_signal"
);
