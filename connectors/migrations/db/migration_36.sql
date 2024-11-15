-- Migration created on Nov 15, 2024
ALTER TABLE public.zendesk_tickets ADD COLUMN "ticketCreatedAt" TIMESTAMP WITH TIME ZONE;
UPDATE public.zendesk_tickets SET "ticketCreatedAt" = "createdAt";
ALTER TABLE public.zendesk_tickets ALTER COLUMN "ticketCreatedAt" SET NOT NULL;
