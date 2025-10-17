-- Migration created on Oct 17, 2025
CREATE INDEX CONCURRENTLY "memberships_userId_fk" ON public.memberships USING btree ("userId")
