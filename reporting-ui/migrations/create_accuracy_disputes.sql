-- Instance disputes: an analyst (the one a check is saved to) or an admin can
-- flag a specific coded instance in a saved accuracy check as disputed.
-- Admins then confirm/deny each dispute, optionally with a reason.
--
-- A dispute is keyed to a saved check (check_id) and a specific instance
-- (instance_id = the XML <ID>, which is stable within a file) on a given
-- side (master or analyst).

create table if not exists public.accuracy_disputes (
    id              bigint generated always as identity primary key,
    created_at      timestamptz not null default now(),

    check_id        bigint not null
        references public.accuracy_checks (id) on delete cascade,

    -- Which instance, and on which side of the comparison.
    instance_id     text not null,
    side            text not null,        -- 'master' | 'analyst'

    -- Denormalised instance detail so the disputes list is self-describing
    -- without re-parsing the XML.
    stat            text,
    player          text,
    team            text,
    code_time       double precision,

    -- Who raised it and why.
    raised_by       text,                 -- username
    reason          text,

    -- Resolution.
    status          text not null default 'open',  -- open | confirmed | denied
    resolved_by     text,
    resolved_at     timestamptz,
    resolution_note text
);

-- One dispute per (check, instance, side).
create unique index if not exists idx_accuracy_disputes_unique
    on public.accuracy_disputes (check_id, instance_id, side);

create index if not exists idx_accuracy_disputes_check
    on public.accuracy_disputes (check_id);

create index if not exists idx_accuracy_disputes_status
    on public.accuracy_disputes (status);

alter table public.accuracy_disputes disable row level security;

-- Permission matrix entry for the new global Disputes page.
insert into public.role_permissions (role, page_key, can_access) values
    ('super_admin', 'disputes', true),
    ('admin', 'disputes', true),
    ('analyst', 'disputes', false)
on conflict do nothing;
