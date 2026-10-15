# 2.7.1

- Fixed website settings editor padding being removed by the old `.settings-fold > .setup-card` selector; removed that obsolete selector and the incorrect replacement selector.
- Replaced the settings editor's global class dependencies with a scoped CSS Module: explicit container spacing, consistent field gaps, wrapping SEO text, responsive two/one-column layout, collapsible public-page editors and a separated save footer.
- Kept settings data, validation and API unchanged. Existing fallback database warning retains a direct SQL download link.
- Source update and redeploy only; no new SQL migration.
- Production compilation/type checking used for validation. Browser visual QA unavailable; no live deployment performed.
