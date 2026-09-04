-- User accounts and role-based permissions for simple UI-level auth.
-- Passwords are SHA-256 hashed with a per-row salt.
-- No Supabase Auth — this is a lightweight username/password system.

-- User accounts
create table if not exists public.user_accounts (
    id              bigint generated always as identity primary key,
    created_at      timestamptz not null default now(),

    username        text not null,
    password_hash   text not null,
    salt            text not null,

    -- Display name / analyst link.
    analyst_name    text,

    -- One of: analyst, admin, super_admin
    role            text not null default 'analyst'
);

create unique index if not exists idx_user_accounts_username_lower
    on public.user_accounts (lower(username));

-- Role permission matrix: one row per (role, page_key).
-- Super admins can toggle these from the UI.
create table if not exists public.role_permissions (
    id          bigint generated always as identity primary key,
    role        text not null,
    page_key    text not null,
    can_access  boolean not null default false
);

create unique index if not exists idx_role_permissions_role_page
    on public.role_permissions (role, page_key);

-- Same open posture as the other tables (anon key read/write, RLS off).
alter table public.user_accounts disable row level security;
alter table public.role_permissions disable row level security;

-- =====================================================
-- Seed: first super admin — andydin / andydin
-- Salt: pd_a1b2c3d4e5f6a7b8
-- Hash: SHA-256(salt + password)
-- =====================================================
insert into public.user_accounts (username, password_hash, salt, analyst_name, role)
values (
    'andydin',
    'f73ee7c24ea85ecb0aca6134741167976c54b9e30438290cc04d011143382448',
    'pd_a1b2c3d4e5f6a7b8',
    'Andy Din',
    'super_admin'
) on conflict do nothing;

-- =====================================================
-- Seed: default permission matrix.
-- Every page_key for each role. Super admin gets all;
-- admin gets most; analyst gets limited.
-- =====================================================
insert into public.role_permissions (role, page_key, can_access) values
    -- super_admin: full access
    ('super_admin', 'dashboard', true),
    ('super_admin', 'operations', true),
    ('super_admin', 'computers', true),
    ('super_admin', 'downloads', true),
    ('super_admin', 'notifications', true),
    ('super_admin', 'fixtures', true),
    ('super_admin', 'competitions', true),
    ('super_admin', 'schedule', true),
    ('super_admin', 'recommendations', true),
    ('super_admin', 'analyst-management', true),
    ('super_admin', 'analyst-profile', true),
    ('super_admin', 'affiliated-teams', true),
    ('super_admin', 'reporting', true),
    ('super_admin', 'leaderboard', true),
    ('super_admin', 'analyst-compare', true),
    ('super_admin', 'accuracy-compare', true),
    ('super_admin', 'accuracy-checks', true),
    ('super_admin', 'settings', true),
    ('super_admin', 'users', true),
    ('super_admin', 'permissions', true),

    -- admin: most pages except user/permission management
    ('admin', 'dashboard', true),
    ('admin', 'operations', true),
    ('admin', 'computers', true),
    ('admin', 'downloads', true),
    ('admin', 'notifications', true),
    ('admin', 'fixtures', true),
    ('admin', 'competitions', true),
    ('admin', 'schedule', true),
    ('admin', 'recommendations', true),
    ('admin', 'analyst-management', true),
    ('admin', 'analyst-profile', true),
    ('admin', 'affiliated-teams', true),
    ('admin', 'reporting', true),
    ('admin', 'leaderboard', true),
    ('admin', 'analyst-compare', true),
    ('admin', 'accuracy-compare', true),
    ('admin', 'accuracy-checks', true),
    ('admin', 'settings', false),
    ('admin', 'users', false),
    ('admin', 'permissions', false),

    -- analyst: limited access
    ('analyst', 'dashboard', true),
    ('analyst', 'operations', false),
    ('analyst', 'computers', false),
    ('analyst', 'downloads', false),
    ('analyst', 'notifications', true),
    ('analyst', 'fixtures', false),
    ('analyst', 'competitions', false),
    ('analyst', 'schedule', true),
    ('analyst', 'recommendations', false),
    ('analyst', 'analyst-management', false),
    ('analyst', 'analyst-profile', true),
    ('analyst', 'affiliated-teams', false),
    ('analyst', 'reporting', false),
    ('analyst', 'leaderboard', true),
    ('analyst', 'analyst-compare', false),
    ('analyst', 'accuracy-compare', true),
    ('analyst', 'accuracy-checks', true),
    ('analyst', 'settings', false),
    ('analyst', 'users', false),
    ('analyst', 'permissions', false)
on conflict do nothing;
