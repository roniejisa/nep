# 2.4.0

- New authenticated `/automation/` page: hourly posting on/off, random product/channel/image/angle, provider and custom model, short/tiny copy, daily attempt cap, explicit automatic publishing consent, pinned destination IDs, recent history.
- Server-only settings/history migration and transactional hourly claim RPC. Unique hour slots, serialized daily budget, private tables/function, CRON_SECRET authentication.
- Supabase Cron + Vault + pg_net schedule template; no Vercel hourly cron entry that would fail Hobby deployments.
- Shared generation/publishing services preserve manual workflows and enforce content limits, affiliate disclosure, ownership, state claims, target matching and unknown-result handling for automation.
- Ready products with verified source only; image required for Instagram. Automatic pause on errors; interrupted runs stop for review. No retry of uncertain posts.
- README: HUONG-DAN-TU-DONG.md and public SQL downloads.
- Verified production build and 24 targeted tests (mocked providers + PGlite); no live social posts, live cron installation or browser visual QA performed.
