import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useSignUpModal } from "@marketing/hooks/useSignUpModal";
import { appendUTMParams } from "@marketing/lib/utils/utm";

const EU_SIGNUP_URL = "https://eu.dust.tt/api/workos/login?screenHint=sign-up";
const US_SIGNUP_URL = "/api/workos/login?screenHint=sign-up";

interface RegionCardProps {
  flag: string;
  label: string;
  description: string;
  href: string;
}

function RegionCard({ flag, label, description, href }: RegionCardProps) {
  return (
    <a
      href={appendUTMParams(href)}
      className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 p-6 transition-colors hover:border-emerald-500 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <span className="text-5xl" aria-hidden="true">
        {flag}
      </span>
      <div className="text-center">
        <p className="font-semibold text-gray-900">{label}</p>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
    </a>
  );
}

export function RegionSelectionModal() {
  const { isOpen, closeSignUpModal } = useSignUpModal();

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeSignUpModal();
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-8 shadow-xl focus:outline-none">
          <DialogPrimitive.Title className="mb-2 text-2xl font-semibold text-gray-900">
            Choose your region
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mb-6 text-sm text-gray-500">
            Select where your workspace data will be hosted. This cannot be
            changed after sign-up.
          </DialogPrimitive.Description>
          <div className="grid grid-cols-2 gap-4">
            <RegionCard
              flag="🇺🇸"
              label="United States"
              description="Data hosted in the US"
              href={US_SIGNUP_URL}
            />
            <RegionCard
              flag="🇪🇺"
              label="Europe"
              description="Data hosted in the EU"
              href={EU_SIGNUP_URL}
            />
          </div>
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded p-1 text-gray-400 transition-colors hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
