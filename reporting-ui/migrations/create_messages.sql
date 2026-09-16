-- Direct messaging: admins and analysts communicate (e.g. about disputes /
-- flags feedback). Mirrors the LMS platform's messaging model, adapted to this
-- app's lightweight auth (no Supabase Auth): participants are user_accounts.id
-- (bigint), and access is enforced in the app layer, so RLS stays disabled to
-- match every other table here.
--
-- Model:
--   conversations         — a thread ("direct" 1:1, or "group")
--   conversation_members  — who is in a thread + their last_read_at
--   messages              — individual messages in a thread
--
-- A conversation may optionally reference a dispute/check it was started from
-- (dispute_id / check_id) so "Message about this flag" threads link back.

create table if not exists public.conversations (
    id          bigint generated always as identity primary key,
    created_at  timestamptz not null default now(),

    -- 'direct' (1:1) | 'group'
    type        text not null default 'direct',
    -- Group title (null for direct conversations).
    title       text,
    -- user_accounts.id of the creator.
    created_by  bigint,

    -- Optional link to the dispute/flag (and its check) this thread is about.
    dispute_id  bigint references public.accuracy_disputes (id) on delete set null,
    check_id    bigint references public.accuracy_checks (id) on delete set null
);

create table if not exists public.conversation_members (
    id               bigint generated always as identity primary key,
    conversation_id  bigint not null
        references public.conversations (id) on delete cascade,
    -- user_accounts.id of the member.
    user_id          bigint not null,
    -- Timestamp the member last opened the thread; drives unread counts.
    last_read_at     timestamptz
);

create table if not exists public.messages (
    id               bigint generated always as identity primary key,
    created_at       timestamptz not null default now(),
    conversation_id  bigint not null
        references public.conversations (id) on delete cascade,
    -- user_accounts.id of the sender.
    sender_id        bigint not null,
    content          text
);

-- One membership row per (conversation, user).
create unique index if not exists idx_conversation_members_unique
    on public.conversation_members (conversation_id, user_id);

create index if not exists idx_conversation_members_user
    on public.conversation_members (user_id);

create index if not exists idx_messages_conversation
    on public.messages (conversation_id, created_at);

create index if not exists idx_conversations_dispute
    on public.conversations (dispute_id);

-- Same open posture as every other table (anon key read/write, RLS off).
alter table public.conversations disable row level security;
alter table public.conversation_members disable row level security;
alter table public.messages disable row level security;

-- Permission matrix entry for the new Messages page. All three roles can
-- message (analysts <-> admins about disputes/flags).
insert into public.role_permissions (role, page_key, can_access) values
    ('super_admin', 'messages', true),
    ('admin', 'messages', true),
    ('analyst', 'messages', true)
on conflict (role, page_key) do update set can_access = excluded.can_access;

-- NOTE: For live message delivery, enable Supabase Realtime for the `messages`
-- table (Database → Replication / Publications). Without it, the thread still
-- works but new messages appear on the next load instead of instantly.
