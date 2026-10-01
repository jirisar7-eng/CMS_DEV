# AI Studio & Agent Confinement Rules

All automated agents and contributors must observe these rules before performing mutations in this repository:

1. **Ruleset Verification**: Read and validate `.synthesis/ruleset.lock.json` against repository snapshots before executing any mutation.
2. **Task Capsule Confinement**: Obey the active Task Capsule in `.synthesis/task-capsule.json`. Mutate only explicitly allowed paths.
3. **Fail-Closed Gate**: Fail closed on any ruleset, hash, version, branch, or allowed-path mismatch.
4. **Security & Boundary Protection**: Never bypass protected main branch protections, authentication, MFA, RBAC permissions, or project isolation.
5. **Technical Authority**: Treat exact pushed commit SHAs evaluated by GitHub Actions CI as authoritative technical gate.
6. **Anti-Drift Requirement**: Stop execution immediately upon detecting governance drift, uncommitted changes, or authoritative remote divergence.
7. **No Implicit Approval**: Never silently regenerate approvals, weaken security gates, or invent commit hashes.
8. **Canonical Task-Branch Alignment**: Never manually merge main or manually resolve capsule conflicts on task branches. Use the canonical alignment engine (`node scripts/ci/align_branch.mjs --mode=plan` followed by authorized `--mode=apply --plan-hash=<sha>`). Fail closed on any unexpected concurrent edit or conflict outside canonical shared paths.
