# 2.6.0

- Custom posting start/end times with minute precision in Vietnam time. Supabase checks schedule every minute, sends an hourly request aligned to the start minute of the active window, and retains the two-period product cap.
- Automation source modes: random from eligible inventory, random from explicit owned product selections, or random from selected category names.
- New `/categories/` page and private category APIs. Create, rename/merge and delete categories; deletion moves products to Khác and pauses schedules that filter by the deleted category. Product forms support custom names.
- Maximum 0–10 images per post, always bounded by the actual images of that product. Instagram is excluded automatically if no image is available or zero images are requested.
- Facebook multi-photo feed and Instagram/Threads carousel adapters. Child containers and parent readiness are checked; request deadlines bound media processing. Uncertain responses are not retried.
- Manual content composer supports multiple product images, previews, per-draft changes and removal. Drafts can be permanently deleted individually or in batches. Published records are hidden from the library without erasing rate-limit evidence; remote Meta posts are not deleted. Publishing/unknown posts remain protected.
- Upgrade from 2.5: run automation-flex.sql, rerun automation-schedule.sql, deploy and resave automation settings.
- Retains independent eight-hour error expiry/cleanup and token preflight checks from 2.5.

Validation: production build and 36 targeted tests passed, including minute-window SQL, category renaming/deletion, owned-post deletion, no-image Instagram exclusion and carousel transport mocks. Live Meta/cron execution and browser visual QA were not performed.
