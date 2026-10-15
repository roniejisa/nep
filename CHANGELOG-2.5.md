# 2.5.0

- Configurable Vietnam morning/evening posting windows; one post per product per period across all channels, including manual publishing through Nếp.
- Atomic PostgreSQL product-slot reservations plus a publishing transition trigger. Existing published/publishing/unknown posts also count; error cleanup cannot reset limits.
- Filters exhausted products before AI; skips outside windows. Checks Meta identity/token before generating, preserving explicit target IDs.
- Structured private errors: timestamp, channel, stage, category, HTTP/code/subcode and remedy. Preserves nested Meta errors without raw provider bodies or tokens.
- Dashboard polls status/errors every 30 seconds; manual generate/publish errors also recorded.
- Independent minute cleanup: errors expire at 8h; completed job summaries kept 48h; daily slots keep current/previous day; only Nếp's own cron execution history pruned.
- Upgrade: run automation-controls.sql, rerun automation-schedule.sql, deploy source and save windows.
- Verification: production build and 28 tests, including PGlite constraints/retention and mocked API errors. Live Meta/cron execution and browser visual QA not performed.
