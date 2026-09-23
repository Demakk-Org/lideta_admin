# Scheduled jobs

Nothing in this repo schedules anything. Every job below is registered on
**cron-job.org** and hits an authenticated route here, so this file is the only
record of what is supposed to be running. Update it when you change a schedule.

A `vercel.json` `crons` entry exists for `/api/notify-daily-verse`, but Vercel
crons run on **production deployments only** — preview branches are never
triggered by it.

## Jobs

| Time (Africa/Addis_Ababa) | Method | Path | Purpose |
| --- | --- | --- | --- |
| 08:00 daily | POST | `/api/cron/recurring-events?lead=0` | Reminders for ordinary events, on the morning of |
| 14:00 daily | POST | `/api/cron/recurring-events?lead=1` | Reminders for **important** events, the day before |
| every 5 min | POST | `/api/cron/daily-verse-reminders` | Daily-verse read reminders |

All send `Authorization: Bearer ${CRON_SECRET}` and `Content-Type: application/json`.

## Why two jobs for one route

`?lead=` selects which pass is running. An event matches exactly one of them —
important events on the day-before pass, everything else on the morning-of pass
(`isDueOnTick` in `src/lib/events/reminders.ts`). That is what stops the two
schedules reminding the same occurrence twice.

## Things that will bite

**Timezone is not cosmetic.** The `lead=0` pass asks whether an occurrence has
already finished, so a job set to 08:00 **UTC** fires at 11:00 Addis and skips
anything that started earlier. Set the timezone on the job itself.

**The secret differs per environment.** Production and preview hold different
`CRON_SECRET` values. A mismatch is a clean 401 in the job's saved response.

**Preview deployments are protected.** `lideta-admin-git-<branch>-<scope>.vercel.app`
returns a 302 to Vercel SSO until Deployment Protection is disabled for
previews (or a bypass token is sent), so dev jobs fail until that is changed.

**Retries are expected.** cron-job.org retries a failed execution, so every
route here must be idempotent. The reminder route claims `reminded_ymd` inside a
transaction before sending, so a retry cannot double-send.

**Branch aliases are stable, deployment URLs are not.** Point dev jobs at
`…-git-<branch>-…vercel.app`, never at a per-deployment URL.

## Verifying

Turn on "save responses" and read the JSON summary. A healthy tick looks like:

```json
{ "targetYmd": "2026-09-25", "lead": 1, "processed": 13, "sent": 1,
  "skippedNotDue": 0, "skippedAlreadyReminded": 0, "skippedFinished": 0,
  "skippedUnusable": 0, "skippedOtherTick": 12, "errorCount": 0 }
```

- `skippedOtherTick` — belongs to the other pass. Expected, not a problem.
- `skippedNotDue` — no occurrence on the target day. Expected most days.
- `skippedFinished` — the occurrence had already ended when the tick ran. If
  this is non-zero every day, the job is firing too late, or event times are
  stored wrong.
- `skippedUnusable` — `recurrence_active` is set but the rule or anchor is
  unreadable. A data problem; check the named event.
