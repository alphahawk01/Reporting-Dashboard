-- Add an optional email to user accounts. Used to provision (invite) the same
-- person into the LMS when a dashboard account is created — the LMS invites by
-- email. Nullable so existing accounts remain valid and username-only accounts
-- still work (they just won't be auto-provisioned into the LMS).

alter table public.user_accounts
    add column if not exists email text;
