# Contributing to Prodlike

## Workflow

1. **Pick an issue** from the GitHub Projects board. Every issue is one slice of a requirement, labelled with its ID (e.g. `FR-03`, `NFR-07`), with one owner and a due date. Work outside the board does not count.
2. **Branch** from `main`: `feat/FR-03-catalogue-filters`, `fix/NFR-09-error-copy`, `chore/ci-cache`.
3. **Commit** in small steps using [Conventional Commits](https://www.conventionalcommits.org/): `feat(api): add scenario list endpoint`.
4. **Open a pull request** using the template. Link the requirement it delivers.
5. **Review:** a _different_ team member must approve. CI must be green. Squash-merge.

## Ownership (from Assignment 1)

| Area                                                | Owner   | Reviewer                            |
| --------------------------------------------------- | ------- | ----------------------------------- |
| Backend: API, auth, sandbox runner, engine, scoring | Najiah  | Bilal (schema), Zeeshan (contracts) |
| Frontend: pages, workspace, 3D map                  | Zeeshan | Najiah                              |
| Database, scenarios, tests, CI/DevOps               | Bilal   | Zeeshan (accessibility/UX)          |

## Definition of done

- [ ] Tests written (unit, plus integration or end-to-end where it touches several layers)
- [ ] Accessibility checked: keyboard reachable, visible focus, status never shown by colour alone (NFR-07)
- [ ] Error states handled with a "what to do next" message (NFR-09)
- [ ] Docs updated (README, ADR or scenario guide) if behaviour changed
- [ ] Demoed at the Friday sprint demo

## Local checks before pushing

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm scenarios:validate
```
