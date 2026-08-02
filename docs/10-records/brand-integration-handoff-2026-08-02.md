# Brand Integration Handoff 2026-08-02

Status: Accepted

## User Decision

The following brand assets are adopted and should be integrated into the main application.

- Logo: `docs/02-ux/assets/brand/meccha-manual-logo-mark.png`
- Site mascot: `docs/02-ux/assets/brand/meccha-manual-mascot-me-clear-eyes.png`

## Integration Request

Main development should wire these assets into the system UI after PR #5 is merged.

Expected initial usage:

- App shell brand area: logo mark.
- Login and onboarding screens: logo mark and mascot.
- Empty states: mascot.
- Help panels and guidance moments: mascot.
- Future landing or product pages: logo mark and mascot with Japanese-only copy.

## Design Notes

- The logo direction is adopted as the `me` + paper + numbered steps concept.
- The mascot direction is a cute personified `me` monster, not a human character.
- The clear-eyes mascot is adopted because the dark character stroke no longer overlaps the eyes.
- Keep Japanese office-worker tone: friendly, useful, and business-safe.

## Follow-up Tasks For Main Session

- Add these images to the app asset pipeline after the frontend structure is ready.
- Define stable asset constants instead of hard-coded paths in UI components.
- Add alt text in Japanese when images are rendered.
- Avoid using the generated-image cache path in production code.
- If the assets need transparent backgrounds, create a dedicated transparent variant in a separate brand asset task.
