# eVoting Product Roadmap

This document records feature ideas and reliability improvements for the eVoting system. Items are grouped by priority and implementation area.

## Priority 1: Trust And Election Operations

### Election-aware voter login

- Carry the selected election ID through the voter login flow.
- Scope login validation and voter tokens to that election.
- Prevent ambiguity when the same test voter ID exists in multiple open elections.
- Keep the multiple-election conflict when no safe election context exists.

### Audit trail

- Record activation, deactivation, PIN generation, PIN resend, manual PIN generation, and SMS delivery results.
- Record voter login, failed login, logout, session expiry, and vote submission.
- Record administrator, election, timestamp, result, and relevant request metadata.
- Make audit entries append-only and available to authorized administrators.

### Election operations dashboard

Provide live metrics for each election and aggregate metrics for super administrators:

- Total voters
- Activated voters
- Logged-in voters
- Votes cast
- Turnout percentage
- Expired sessions
- Failed login attempts
- SMS delivery failures
- Per-election breakdowns when multiple elections are open

### Voter recovery tools

- Invalidate a voter session.
- Regenerate a PIN.
- Resend an SMS PIN.
- Manually generate a PIN when SMS delivery fails.
- Re-activate a voter.
- Show why a voter cannot currently log in.

## Priority 2: Backend Reliability And Security

### Election and voter data integrity

- Enforce election scoping on every voter-facing request.
- Add database constraints where they improve correctness.
- Detect duplicate voter IDs and conflicting election assignments.
- Prevent a voter from being eligible in multiple open elections unless an explicit election context is supplied.

### Authentication protection

- Rate-limit voter login and PIN verification attempts.
- Add lockouts or escalating delays after repeated failures.
- Keep voter tokens scoped to one election.
- Invalidate tokens after a successful vote, election closure, or explicit administrative invalidation.
- Keep activation expiry and authenticated session expiry as separate concepts.

### Idempotent operations

- Make vote submission safely reject duplicate requests without creating extra votes.
- Make SMS send and resend operations idempotent where possible.
- Prevent duplicate activation requests from generating confusing new states.

### SMS and background-job health

- Add a provider health/status endpoint.
- Track queued, sent, delivered, failed, skipped, and manually recovered SMS states.
- Add scheduled cleanup for expired activations and failed delivery records.
- Provide retry limits and clear failure reasons.

### Backup and recovery

- Document database backup procedures.
- Document restoration and election recovery procedures.
- Verify that backups can actually be restored before an election begins.

## Priority 3: Frontend Experience

### Election context

- Show the active election clearly throughout voter and administrator workflows.
- Display the election name in voter login, voting, activation, results, and management views.
- Make it obvious when a super administrator is viewing aggregate data versus one election.

### Session visibility

- Show an accessible countdown for activation and authenticated voter sessions.
- Warn the voter before the session expires.
- Provide a clear expired-session state and safe return to login.
- Avoid relying on color alone for session and delivery status.

### Activation workflow

- Add bulk activation and deactivation with confirmation.
- Show progress and row-level errors for bulk operations.
- Add clear conflict messages when a voter is eligible in another election.
- Keep PIN generation, resend, manual generation, and delivery status in one workflow.

### Import and export tools

- Add CSV import preview before saving records.
- Show row-level validation errors.
- Detect duplicate IDs, duplicate phone numbers, and malformed records before import.
- Add exportable voter, turnout, results, and audit reports.

### Live operational feedback

- Add live SMS delivery status updates.
- Show voter progress during an active election.
- Provide clear loading, empty, retry, and offline states.
- Preserve useful backend error details instead of replacing them with generic messages.

### Accessibility and responsive operation

- Improve keyboard navigation throughout admin workflows.
- Add screen-reader labels and announcements for status changes.
- Test voter and activator workflows on mobile devices.
- Keep tables, metrics, dialogs, and forms usable at narrow widths.

## Priority 4: Testing And Quality

### Automated coverage

- Test concurrent vote submissions.
- Test duplicate voter IDs across elections.
- Test election-scoped authentication.
- Test activation expiry separately from session expiry.
- Test election start, pause, resume, and close boundaries.
- Test SMS provider failures and manual PIN recovery.
- Test permissions for superusers, staff, activators, and voters.

### End-to-end checks

- Verify a complete activation-to-vote journey.
- Verify the failed-SMS recovery journey.
- Verify multiple simultaneous open elections.
- Verify refreshes and browser recovery during voting.
- Verify mobile and desktop layouts.

### Release readiness

- Run type checking, linting, production builds, backend checks, and tests before release.
- Add a pre-election checklist for ballot readiness, voter imports, SMS configuration, schedules, permissions, and backups.
- Add a post-election checklist for results export, audit export, backups, and access review.

## Recommended Delivery Order

1. Election-aware voter login
2. Audit trail
3. Election operations dashboard
4. Voter recovery tools
5. Import validation and exportable reports
6. Authentication hardening and idempotent operations
7. SMS health monitoring and background-job improvements
8. Expanded accessibility, responsive, and end-to-end testing
