# AWS cost data

`aws-costs.csv` is an AWS Cost Explorer export: **cost by Usage Type, one row per day**.

Layout:
- Header row: `Usage type`, then one column per AWS usage type (e.g. `APS2-EC2SP:c6a.1yrNoUpfront($)`), ending with `Total costs($)`.
- Row `Usage type total`: the whole-period total per usage type (ignored by the dashboard — it recomputes from the daily rows).
- Remaining rows: one per calendar day (`YYYY-MM-DD`), each cell = that usage type's cost that day.

## Updating the data

The AWS dashboard reads this `aws-costs.csv` directly at runtime. To update:
re-export from AWS Cost Explorer (Group by = Usage Type, daily granularity),
rename to `aws-costs.csv`, and replace this file. Then commit / redeploy.

The tab parses it at runtime and:
- converts every amount from **USD → AUD** (rate `USD_TO_AUD` in `lib/aws/costs.ts`, currently 1.4),
- drops any usage type whose **average cost per day < A$0.50** across the period,
- aggregates into daily / weekly (Fri–Thu) / monthly views,
- rolls usage types up into **categories** (see below).

The AWS export is in USD; all figures shown in the dashboard are AUD. To change
the exchange rate, edit `USD_TO_AUD`.

## Categories

The tab groups usage types into business-friendly categories (PD Database, PD
App, League App, S3 Storage, Snapshot, UK Server, Kiro, Data Transfer, Support,
Tax, Server Volume Drives, Deep Archive Storage, Opposition Analysis, …).

The mapping lives in code, not the CSV: `USAGE_TYPE_CATEGORY` in
`lib/aws/costs.ts`, keyed by the exact usage-type column header (including the
trailing `($)`). Any usage type not in that map — or mapped to an empty string —
is treated as **Uncategorised**: it's excluded from the category rollups/chart
but still shown in the per-usage-type table.

When the export grows a new usage type you want categorised, add a line to
`USAGE_TYPE_CATEGORY`.
