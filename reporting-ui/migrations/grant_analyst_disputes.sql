-- Let analysts open the Disputes page so they can review/dispute their own
-- checks. The page itself scopes data to the logged-in analyst's checks; this
-- only grants navigation access to the page.
insert into public.role_permissions (role, page_key, can_access)
values ('analyst', 'disputes', true)
on conflict (role, page_key) do update set can_access = true;
