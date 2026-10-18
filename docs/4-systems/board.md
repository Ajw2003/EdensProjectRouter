# Board (planned, not built)

## What it owns

The screen: one column per project, a card per session, three bars on every card, account folders as small tags, and the three-step first-run walkthrough.

## How it works (planned)

Each card shows the session title, the account folder it ran under, when it was last active, and three bars: context (this session), 5-hour limit (its account) and weekly limit (its account), each with the time it resets. A limit bar with no reporter reading says "Turn on limit tracking" instead of a number. A copy button copies the command that resumes that session.

Project colours come from a fixed palette of 8 colours picked by hashing the project name, so a project keeps its colour on every visit. Bars use one separate scale (calm under 70%, amber 70–89%, red 90% and above) that no project colour reuses.

## Invariants

- Layout never reorders while you look at it; a newer session moves to the top only on the next refresh after you stop hovering.
- No animation when reduce-motion is on.

## Traps

None recorded yet.
