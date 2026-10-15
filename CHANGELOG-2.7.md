# 2.7.0

- Explicit daily posting slots, with 6/8/10 presets, custom add/remove times and minimum 15-minute spacing. PostgreSQL claims each exact scheduled slot once with a five-minute grace period; legacy schedules remain intact until saved.
- Keeps a shared product cap of one post before noon and one after noon across all channels/manual posting; explicit time schedules are allowed throughout the day.
- Rebuilt automation UI around three steps: times, source and channels. Advanced AI, account setup, activity and errors start collapsed.
- Shared accessible pagination: products 12, images 24, categories/source selections 10, content/jobs/errors 6. Content/job/error APIs paginate with exact counts and owner filters; product inventory has an explicit 1,000-item bound instead of a silent 500-item cut.
- Searchable media/categories and selection lists; drafts remain selected across product-picker pages. Unsaved content edits warn on filter/page changes; retained when updating neighboring records.
- Improved contrast, typography, spacing, mobile controls and navigation. Setup sections and AI-image tools open on demand; OAuth return opens the relevant connection panel.
- Upgrade from 2.6: automation-times.sql, then rerun automation-schedule.sql, deploy and save the new schedule.
- Validation: production build and 39 targeted tests (including schedule SQL, posting limits, retention, carousels and pagination). Live cron/Meta execution and browser visual QA not performed.
