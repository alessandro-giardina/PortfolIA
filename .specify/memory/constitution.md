<!--
SYNC IMPACT REPORT
==================
Version change:  [placeholder] → 1.0.0
Bump type:       MAJOR — initial population of all principles from template placeholders

Principles added (all new):
  I.   Methodology and Code Quality  (1.1 Test-First TDD, 1.2 Quality and Modularity)
  II.  Vision and Security           (2.1 User-Centered Experience, 2.2 Security-by-Design)
  III. Technical Stability           (3.1 Tech Stack Immutability)
  IV.  Interaction Protocol          (4.1 No Guessing, 4.2 Stop-and-Clarify)

Templates reviewed:
  ✅ .specify/templates/plan-template.md  — Constitution Check gate present; aligns with all principles; no changes needed
  ✅ .specify/templates/spec-template.md  — User story + FR structure aligns with Principle II.1; no changes needed
  ✅ .specify/templates/tasks-template.md — TDD ordering note ("Write tests FIRST") aligns with Principle I.1; no changes needed

Deferred TODOs: None — all placeholders resolved.
-->

# portfolIA Constitution

## Core Principles

### I. Methodology and Code Quality

#### 1.1. Test-First (TDD) — NON-NEGOTIABLE

Every new feature MUST begin with test definitions before any implementation code is written.
The Red–Green–Refactor cycle is strictly enforced:

- **Red**: Write a failing test that precisely captures the intended behavior.
- **Green**: Write the minimum implementation code needed to make the test pass.
- **Refactor**: Improve the code without changing external behavior; all tests MUST remain green.

No implementation code may be merged unless corresponding tests exist and were written first.
The `/speckit.tasks` command MUST schedule test tasks before their implementation counterparts.

#### 1.2. Quality and Modularity

Code MUST follow a modular architecture with clear separation of concerns:

- Each module MUST have a single, well-defined responsibility.
- Components MUST be reusable and independently testable.
- Simplicity is preferred over tooling complexity. A new tool or abstraction MUST only be
  introduced when the alternative creates demonstrable duplication or fragility.
- Dependencies between modules MUST be explicit and minimized.

### II. Vision and Security

#### 2.1. User-Centered Experience

Every technical decision MUST be subordinate to the ease of use and functional requirements
defined in the feature specification:

- If a technically elegant approach degrades user experience, the user-experience requirement wins.
- All acceptance scenarios in spec.md MUST be validated from the user's perspective, not the
  implementation's perspective.
- Performance, accessibility, and clarity goals defined in spec.md are non-negotiable constraints,
  not aspirational targets.

#### 2.2. Security-by-Design — NON-NEGOTIABLE

Security is a first-class design constraint, not an afterthought:

- Every module MUST be designed from inception to minimize attack surface and follow industry
  best practices (OWASP Top 10, principle of least privilege, input validation at boundaries).
- Authentication, authorization, and data-protection considerations MUST be addressed in
  plan.md before implementation begins.
- Any security assumption or accepted risk MUST be explicitly documented in the relevant spec
  or plan artifact.

### III. Technical Stability

#### 3.1. Tech Stack Immutability

Once the framework, database, and API architecture are defined and recorded in plan.md, the
tech stack is locked for that feature:

- Changing runtime frameworks, databases, or core API architecture choices REQUIRES an explicit
  update to both the feature specification (spec.md) and this Constitution.
- Introducing a new external dependency REQUIRES justification documented in plan.md and
  approval via the amendment procedure defined in the Governance section below.
- Minor upgrades within the same major version of an already-approved dependency are permitted
  without a constitution amendment.

### IV. Interaction Protocol (Anti-Guessing)

#### 4.1. No Guessing — NON-NEGOTIABLE

The agent MUST NOT make assumptions to fill in undefined requirements:

- Any ambiguity that cannot be resolved from approved artifacts (spec.md, plan.md, tasks.md,
  this Constitution) represents a **hard stop**.
- Guessing acceptable behavior, inferring unstated security boundaries, or extrapolating
  architectural decisions without explicit approval is strictly prohibited.

#### 4.2. Stop-and-Clarify

When a hard stop is reached, the agent MUST invoke the `/clarify` command immediately:

- Clearly state what the ambiguity or missing requirement is.
- Reference the specific artifact (or its absence) that makes progress impossible.
- Do not proceed until the user has provided explicit clarification and the relevant artifact
  has been updated accordingly.

## Amendment Protocol

Amendments to this Constitution require:

1. A clear statement of the principle or section being changed and the rationale.
2. An explicit update to this file (`constitution.md`) with a version bump per the Governance
   versioning policy.
3. Cascading updates to any plan.md, spec.md, or tasks.md artifacts that reference the
   amended principle.
4. User approval before the amended Constitution takes effect.

Tech stack changes additionally require updates to the relevant feature plan.md (see §III.1).

## Development Workflow

All `/speckit.plan` and `/speckit.implement` commands MUST adhere to the following gates:

| Gate | Principle | Enforcement |
|------|-----------|-------------|
| Constitution Check in plan.md | All | MUST pass before Phase 0 research |
| Tests defined before implementation | I.1 | MUST appear earlier in tasks.md than implementation tasks |
| Security review in plan.md | II.2 | MUST be completed before any Phase 2+ task |
| Tech stack confirmed in plan.md | III.1 | MUST be locked before tasks.md is generated |
| No unresolved ambiguities | IV.1–2 | MUST trigger `/clarify` if any are detected |

If any gate cannot be satisfied, the agent MUST halt and invoke `/clarify`.

## Governance

This Constitution supersedes all other development guidelines for the portfolIA project.
All pull requests, plans, and implementation artifacts MUST comply with the principles defined
herein.

**Versioning policy**:
- **MAJOR**: Backward-incompatible governance changes; principle removal or fundamental redefinition.
- **MINOR**: New principle or section added; material expansion of existing guidance.
- **PATCH**: Clarifications, wording improvements, typo fixes; no semantic change.

**Compliance review**: Every `/speckit.plan` execution triggers a Constitution Check gate.
Non-compliant plans MUST NOT proceed to `/speckit.tasks` or `/speckit.implement`.

**Version**: 1.0.0 | **Ratified**: 2026-04-14 | **Last Amended**: 2026-04-14
