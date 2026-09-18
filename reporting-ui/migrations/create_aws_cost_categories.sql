-- AWS cost usage-type → category mapping.
--
-- The AWS Cost Explorer export ("cost by Usage Type") only contains usage types
-- that had a cost, so the column set differs from week to week. Rather than
-- re-categorise on every import, the AWS dashboard matches each usage-type
-- COLUMN HEADER against this table to attach a business-friendly category.
--
-- Matching is by the EXACT header string as it appears in the CSV, including
-- the trailing "($)" (e.g. "APS2-EBS:SnapshotUsage($)"). A usage type with no
-- row here — or an empty/blank category — is treated as "Uncategorised":
-- excluded from the category rollups but still shown in the usage-type table.
--
-- To add/relabel a category later, just insert/update a row here — no code
-- change or redeploy needed.

create table if not exists public.aws_cost_categories (
    id          bigint generated always as identity primary key,
    created_at  timestamptz not null default now(),

    -- The exact usage-type column header from the AWS CSV (incl. "($)").
    usage_type  text not null,
    -- Business-friendly category. NULL/'' => uncategorised.
    category    text
);

-- One category per usage type; case-insensitive so header casing can't create
-- duplicates. Upserts (below + from the app) rely on this.
create unique index if not exists idx_aws_cost_categories_usage_type_lower
    on public.aws_cost_categories (lower(usage_type));

-- Same RLS posture as the other reporting tables (client uses the anon key
-- for read/write). RLS disabled to match existing tables in this project.
alter table public.aws_cost_categories disable row level security;

-- ------------------------------------------------------------------
-- Seed the current mapping. Safe to re-run: on conflict we update the
-- category so this file stays the source of truth for the initial set.
-- ------------------------------------------------------------------
insert into public.aws_cost_categories (usage_type, category) values
    ('APS2-EC2SP:c6a.1yrNoUpfront($)',      'PD Database'),
    ('APS2-DataTransfer-Out-Bytes($)',      'Data Transfer'),
    ('No usage type($)',                    'Tax'),
    ('APS2-EC2SP:r6a.1yrNoUpfront($)',      'PD App'),
    ('APS2-EBS:SnapshotUsage($)',           'Snapshot'),
    ('Dollar($)',                           'Support'),
    ('APS2-EBS:VolumeUsage.gp3($)',         'Server Volume Drives'),
    ('APS2-TimedStorage-GDA-ByteHrs($)',    'S3 Storage'),
    ('APS2-EC2SP:t2.1yrNoUpfront($)',       'League App'),
    ('APS2-EBS:SnapshotArchiveStorage($)',  'Snapshot'),
    ('EUW2-BoxUsage:c6a.4xlarge($)',        'UK Server'),
    ('USE1-KiroEnterprise-Power($)',        'Kiro'),
    ('APS2-BoxUsage:c6a.8xlarge($)',        'PD Database'),
    ('APS2-BoxUsage:r6a.2xlarge($)',        'PD App'),
    ('APS2-BoxUsage:t2.2xlarge($)',         'League App'),
    ('APS2-TimedStorage-ByteHrs($)',        'Deep Archive Storage'),
    ('APS2-BoxUsage:t3.2xlarge($)',         'League App'),
    ('APS2-TimedStorage-INT-AIA-ByteHrs($)','Deep Archive Storage'),
    ('APS2-PublicIPv4:InUseAddress($)',     'UK Server'),
    ('APS2-EBS:SnapshotArchiveEarlyDelete($)','Snapshot'),
    ('APS2-BoxUsage:t3.small($)',           'Opposition Analysis'),
    ('APS2-BoxUsage:t3.medium($)',          'Opposition Analysis')
on conflict (lower(usage_type)) do update
    set category = excluded.category;
