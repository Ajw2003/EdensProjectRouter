# Roadmap

## Milestone 1 — Approved design (10%)

**Contains:** a design page with the stack, layout and onboarding choices.
**Acceptance:** Aj replies "Design approved: router prototype" with their picks.

## Milestone 2 — Working prototype on Windows (70%)

**Contains:** a GitHub Pages site that reads each account's Claude folder, groups every session by project, shows context, 5-hour and weekly limit bars on each session, and has a skippable first-run walkthrough.
**Acceptance:** Aj opens the Pages link in Edge on their Windows PC, picks their Claude folders, and sees their real sessions from all three accounts grouped by project, each with the three bars.

*Changed 2026-10-18.* This used to say "starts it with one double-click" and "starts a session under a chosen account". Aj's design answer moved it to a hosted site with no account switching; see the 2026-10-18 entry in [Decisions](../6-decisions/Decisions.md).

## Milestone 3 — Daily use (100%)

**Contains:** fixes from Aj's own use.
**Acceptance:** Aj has used it for a week of normal work and says it is done. The exact list is TODO until milestone 2 has been used.

## Companion milestones (approved 2026-11-18, not started)

From `docs/plans/companion-app.html`, built on this app as `docs/plans/companion-rebase.html` decided.

- **Visual view:** a question Claude asks shows as a card, tapping an answer moves the terminal on, and a page Claude writes shows in the conversation.
- **Account handoff:** a session started on Main resumes on Work with its earlier messages visible, offered when the tracked limits say an account is full.
- **Phone at home:** Aj pairs the Android app on home Wi-Fi, answers a question in the Visual view, and sees the PC's terminal move on.
- **Phone away from home:** the same test on mobile data, over Tailscale.
