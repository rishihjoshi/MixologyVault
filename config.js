// Overwritten at deploy time by .github/workflows/deploy.yml, which injects the
// repo's ANTHROPIC_API_KEY GitHub Actions secret. Committed empty; locally (and
// until a deploy runs) the "By photo" feature in Decide shows an "unavailable"
// notice instead of calling Claude.
window.ANTHROPIC_API_KEY = '';
