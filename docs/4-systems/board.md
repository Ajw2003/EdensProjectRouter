# Board

> The main screen is now the folding project list (`site/js/list.js`), described in `session-view.md`; `renderBoard` here remains only for the walkthrough's example card.

## What it owns

The screen: one column per project, a card per session, three bars on every card, account folders as small tags, and the three-step first-run walkthrough.

## How it works

Code: `site/js/board.js`, `site/js/walkthrough.js`, `site/styles.css`.


Each card shows the session title, the account folder it ran under, when it was last active, and three bars: context (this session), 5-hour limit (its account) and weekly limit (its account), each with the time it resets. A limit bar with no reporter reading says "Turn on limit tracking" instead of a number. A copy button copies the command that resumes that session.

Project colours come from a fixed palette of 8 colours picked by hashing the project name, so a project keeps its colour on every visit. Bars use one separate scale (calm under 70%, amber 70–89%, red 90% and above) that no project colour reuses.

## Invariants

- Layout never reorders while the pointer is over the board; numbers still update in place (`layoutKey` in `site/js/board.js`).
- No animation when reduce-motion is on.

## Traps

- Holding every redraw while hovering made Turn on limit tracking look broken, because the pointer is still on the card after the tap. Only reordering is held now.
