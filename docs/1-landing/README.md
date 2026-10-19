# EdensProjectRouter

A tool to see and route work across several Claude Code accounts and sessions. Sessions are grouped by project, labelled by Git repository or folder name, and colour coded. It is meant to be calm for autistic and ADHD brains, teach itself through built-in onboarding, and never make setup the thing that stops you using it. It targets Windows first.

## Moving parts

| Part | What it is |
|---|---|
| `site/` | The board, the website, and the walkthrough (plain HTML and JavaScript, no build step) |
| `desktop/` | The Electron Windows app that loads `site/` and reads the disk directly |
| `tests/` | `npm test`, Node's built-in test runner |
| `.github/workflows/` | `pages.yml` publishes the website; `desktop.yml` tests on Windows and builds the installer |

## Tiers

| Tier | Document |
|---|---|
| 1 Landing | this file |
| 2 Roadmap | [Roadmap.md](../2-roadmap/Roadmap.md) |
| 3 State | [ProjectState.md](../3-state/ProjectState.md) |
| 4 Systems | [systems index](../4-systems/README.md) |
| 5 Today | [Today.md](../5-today/Today.md) |
| 6 Decisions | [Decisions.md](../6-decisions/Decisions.md) |

Plans live in `docs/plans/`, tool-made output in `docs/generated/`, and inert documents in `docs/archive/`.
