# eVoting Application Integrity Audit

## Scope

This document began as a read-only application audit. Its election-lifecycle sections were updated during the backend lifecycle refactor on 2026-09-21; other historical findings below retain the status of the audit that first recorded them unless explicitly updated.

The original sections 14-16 are a dated snapshot of findings and recommendations, not a current assessment. The current election lifecycle contract is documented in sections 2 and 4 and in `EVOTING_DOCUMENTATION.md`.

Inspected:

- README, application documentation, configuration, URL routing, models, serializers, authentication, permissions, views, migrations, and admin configuration
- Frontend routing, authentication context, Axios integration, React Query hooks, pages, and shared components
- Existing backend tests and test-like scripts
- Backend system checks and migration checks
- Frontend lint and TypeScript checks

The lifecycle refactor changed backend code, tests, documentation, and added a migration. It did not change frontend code or apply the migration to a development or production database.

## 1. System architecture summary

The eVoting application is located at D:\Devs\evoting.

- Backend app: core/
- Django project: evoting/
- Frontend: evoting-frontend/
- Tests: core/tests.py and tests/
- Documentation: EVOTING_DOCUMENTATION.md

The backend is Django/DRF with PostgreSQL configuration, Simple JWT, optional rate limiting, OpenPyXL bulk imports, and optional Cloudinary image storage.

The frontend uses React 19, TypeScript, Vite, React Router DOM, Tailwind CSS 4, TanStack React Query, Axios, jwt-decode, and React Toastify.

There are two authentication paths:

1. JWT authentication for administrators.
2. Header-based HMAC authentication for student voters.

Frontend server state is managed with React Query. Admin authentication uses Context API. Admin tokens/session data are stored in localStorage. Voter token and election context are stored in sessionStorage.

Important files:

- core/models.py
- core/serializers.py
- core/views.py
- core/authentication.py
- core/permissions.py
- core/utils.py
- core/urls.py
- evoting/settings.py
- evoting-frontend/src/App.tsx
- evoting-frontend/src/apiConfig.ts
- evoting-frontend/src/contexts/AuthContext.tsx
- evoting-frontend/src/hooks/useVotingData.ts

## 2. Complete election lifecycle

### Creation

POST /api/elections/create/ is handled by ElectionCreateView.post() with ElectionSerializer and IsSuperUser. There is currently no separate schedule-update API endpoint.

The serializer exposes election configuration and derived lifecycle fields. It requires `end_time` to be later than `start_time`. Schedule updates use the same validation wherever `ElectionSerializer` is used for updates.

Remaining schedule policy:

- Overlapping elections are not prevented.
- Multiple elections with voting enabled are explicitly supported; voter login returns 409 when a student ID is eligible in more than one open election.

### Configuration

Students are attached to elections through Student.election.

Positions are attached through Position.election and ordered by display_order.

Candidates are attached to a student and position. Candidate assignment validation requires the student and position to belong to the same election.

Candidate and position changes are rejected at or after the scheduled opening time, even while voting is paused. Existing votes keep the ballot locked. Moving the stored start time forward after the original start has passed is rejected.

### Activation and deactivation

GET/PATCH /api/elections/manage/ is handled by ElectionManageView.

The PATCH changes only Election.voting_enabled inside a transaction. Election status is derived centrally and is not stored.

The temporary deprecated API alias `is_active` maps to the same `voting_enabled` field because the frontend and backend deploy separately. There is no second stored switch.

Lifecycle values are `scheduled`, `open`, `paused`, and `ended`. Voting is open exactly when `voting_enabled` is true and `start_time <= now < end_time`. `Student.is_active` remains the independent student-activation flag. The backend returns election-level `voting_open` and, in the voter login response, student-level `can_vote_now`.

Confirmed:

- Multiple elections may have voting enabled simultaneously; this policy is unchanged.
- Deactivation does not directly delete or revoke voter tokens.
- Existing tokens become unusable for voting when the election is scheduled, paused, or ended.
- Deactivation does not deactivate students.

### Completion

There is no stored completed flag. Status becomes `ended` at or after `end_time`, even if `voting_enabled` remains true. The stored switch may remain true, but management actions cannot change an ended election; it cannot reopen voting.

Results remain accessible to permitted administrators regardless of active status or end time.

## 3. Complete administrator workflow

### Authentication

LoginPage.tsx calls POST /api/auth/login/, which is provided by Simple JWT.

AuthContext.login() stores access and refresh tokens, then calls GET /api/auth/me/ through MeView to obtain the custom role.

Axios adds the access token to protected requests. A failed 401 triggers one refresh attempt. Failed refresh clears local auth state and redirects to admin login.

### Roles and permissions

Backend roles:

- superuser
- staff
- activator

Backend permission classes:

- IsSuperUser
- IsStaffOrSuperUser
- IsActivatorOrSuperUser
- IsStaffOrSuperUserOrReadOnlyActivator

Frontend ProtectedRoute controls navigation only. Backend permissions are the real authorization boundary.

Role mismatch found:

- Backend permits staff to manage elections, positions, and election activation.
- Frontend exposes some of these routes only to superusers.
- Backend permits staff to view results.
- Frontend protects the results route as superuser-only.

### Election management

- Create: ElectionCreateView and useCreateElection
- List: ElectionViewSet and useElections
- Activate/deactivate: ElectionManageView and useToggleElection
- Statistics: ElectionStatsView
- Results: ElectionResultsView

### Position management

PositionViewSet provides public list/retrieve access. PositionCreateView provides create, update, and delete operations for staff/superusers.

### Student management

StudentViewSet provides CRUD. BulkStudentUploadView handles Excel imports. Filtering uses election_id.

Bulk upload:

1. Reads the active worksheet.
2. Requires student_id, full_name, and class_name.
3. Skips incomplete rows.
4. Skips duplicate IDs within the file.
5. Excludes existing IDs for the selected election.
6. Uses bulk_create(ignore_conflicts=True).

Student deletion is blocked when has_voted is true.

### Candidate management

CandidateViewSet provides scoped reads. CandidateCreateView and PositionViewSet provide mutations. CandidateSerializer.validate() checks ballot-number uniqueness, candidate uniqueness, and that candidate student and position belong to the same election. Candidate and position mutations are locked at scheduled opening and after votes exist.

### Image upload

POST /api/upload/image/ is handled by ImageUploadView.

- Staff/superuser only
- JPEG, PNG, and WebP
- Maximum 5 MB
- Cloudinary when configured
- Local media/candidates/ otherwise

The returned URL is stored through the frontend candidate mutation flow.

## 4. Complete voter workflow

### Voter authentication

StudentLoginPage.tsx calls POST /api/voter/login/.

StudentVoterLoginView._actual_post() selects elections for which the central lifecycle service reports `voting_open`, then requires matching student ID and election, `Student.is_active=True`, and `has_voted=False`.

If the same student ID is active in multiple elections, the endpoint returns a 409 conflict.

The token is generated as HMAC(VOTER_HMAC_KEY, student_id + "_" + election_id).

The frontend stores the token, student data, and election context in sessionStorage.

### Ballot loading

useVotingData.fetchVotingData():

1. Reads election context from sessionStorage.
2. Loads positions using GET /api/positions/?election_id=...
3. Sorts positions by display_order.
4. Loads candidates for each position using GET /api/candidates/?position_id=...

The hook constructs a synthetic election object from sessionStorage rather than re-fetching the full election.

### Selection, confirmation, and submission

VotingPage.handleSelectCandidate() updates local selected-vote state and advances to the next position.

VotingPage.handleSubmitVotes():

1. Reads student ID, voter token, and election ID from sessionStorage.
2. Builds the selected-vote payload.
3. Requires the number of selected votes to equal the number of positions.
4. Sends POST /api/vote/ with X-Student-Id, X-Election-Id, and X-Voter-Token.
5. On success, shows an inline success state, clears sessionStorage after three seconds, and returns to /.

### Backend vote storage

MultiVoteView.post() applies optional production rate limiting and delegates to _actual_post().

MultiVoteView._actual_post():

1. Validates the request body with MultiVoteSerializer.
2. Gets the authenticated student and token from VoterAuthentication.
3. Locks the fresh student row with select_for_update().
4. Rejects inactive students.
5. Rejects students with has_voted=True.
6. Checks the central lifecycle service reports the authenticated election as open and checks student-level eligibility.
7. Validates positions belong to submitted elections.
8. Validates candidates belong to submitted positions.
9. Checks for existing votes by token and position.
10. Creates all Vote rows with bulk_create().
11. Sets has_voted=True and is_active=False.
12. Commits the atomic transaction and returns HTTP 201.

## 5. Authentication and authorization flow

### Administrator

1. Credentials are sent to Simple JWT.
2. Access and refresh tokens are returned.
3. Tokens are stored locally.
4. The frontend calls /api/auth/me/.
5. The backend returns username and custom role.
6. Axios attaches the access token.
7. A 401 triggers one refresh attempt.
8. Failed refresh logs the administrator out locally.

### Voter

1. Student submits an ID.
2. Backend checks calculated election availability, registration, student activation, and prior voting.
3. Backend returns an election-scoped HMAC.
4. Frontend stores it in sessionStorage.
5. Frontend sends it with the ballot.
6. VoterAuthentication validates election, window, student/election association, and HMAC.
7. MultiVoteView re-checks activation and has_voted under a row lock.

## 6. Step-by-step vote-submission trace

Frontend:

1. StudentLoginPage.handleSubmit() calls voter login and stores token/election context.
2. useVotingData.fetchVotingData() loads positions and candidates.
3. VotingPage.handleSelectCandidate() updates local selection.
4. VotingPage.handleSubmitVotes() sends the ballot.

Backend authentication:

5. VoterAuthentication.authenticate() reads the three voter headers.
6. It loads the requested election.
7. It checks calculated lifecycle status and requires `voting_open`.
8. It loads the student by student ID and election.
9. It verifies the election-scoped HMAC.
10. It returns StudentUser and the token.

Backend operation:

11. MultiVoteView.post() applies optional rate limiting.
12. _actual_post() validates the payload.
13. It locks the student row.
14. It validates student state.
15. It validates election, position, and candidate relationships.
16. It bulk-creates votes.
17. It updates student status.
18. The atomic transaction commits or rolls back.

## 7. Database models, relationships, and constraints

### User

User extends AbstractUser and adds role. There is no database constraint synchronizing role with Django is_staff or is_superuser.

### Election

Fields: name, year, start_time, end_time, voting_enabled. Status is calculated, not stored.

Enforced lifecycle rules:

- End time must be later than start time.
- Voting availability is enabled and within the half-open schedule window.
- Candidate and ballot configuration freezes at scheduled opening and after any vote.

Overlap policy remains unchanged: multiple elections may be enabled; ambiguous eligible voter login returns HTTP 409.

### Student

Fields: student_id, full_name, class_name, has_voted, is_active, election.

Constraint: unique election plus student_id.

This correctly allows the same ID in different elections while preventing duplicates within one election.

### Position

Fields: name, election, display_order.

There is no uniqueness constraint on election plus display order.

### Candidate

Fields: student, position, photo_url, ballot_number.

Constraints:

- Unique position plus ballot number
- Unique student globally

Missing relationship constraint:

candidate.student.election must equal candidate.position.election.

The global student uniqueness constraint also prevents a student from being a candidate in more than one position across all elections.

### Vote

Fields: election, position, candidate, voter_hash, created_at.

Constraint: unique voter_hash plus position.

Missing database relationship constraints:

- Vote position election equals Vote election
- Vote candidate position equals Vote position
- Vote candidate student election equals Vote election

### Deletion

Election, position, candidate, and vote relationships use cascading deletion in multiple places. Deleting an election, position, or candidate can therefore delete existing Vote rows.

Student deletion is blocked by the endpoint after voting, but equivalent protections do not exist for elections, positions, or candidates.

## 8. Frontend-to-backend API mapping

| Operation | Endpoint | Backend | Authorization |
|---|---|---|---|
| Admin login | POST /api/auth/login/ | TokenObtainPairView | Credentials |
| Refresh | POST /api/auth/refresh/ | TokenRefreshView | Refresh token |
| Admin profile | GET /api/auth/me/ | MeView | JWT |
| List elections | GET /api/elections/ | ElectionViewSet | Scoped management account |
| Create election | POST /api/elections/create/ | ElectionCreateView | Superuser |
| Manage election | GET/PATCH /api/elections/manage/ | ElectionManageView | Staff/superuser |
| Election stats | GET /api/elections/{id}/stats/ | ElectionStatsView | Staff/superuser |
| Election results | GET /api/elections/{id}/results/ | ElectionResultsView | Staff/superuser |
| Student CRUD | /api/students/ | StudentViewSet | Staff/superuser |
| Bulk upload | POST /api/students/bulk-upload/ | BulkStudentUploadView | Staff/superuser |
| Activate student | POST /api/students/activate/ | StudentActivationView | Activator/superuser |
| Position list | GET /api/positions/ | PositionViewSet | Public |
| Position mutations | /api/positions/ | PositionCreateView | Staff/superuser |
| Candidate list | GET /api/candidates/ | CandidateViewSet | Public |
| Candidate mutations | /api/candidates/ | CandidateCreateView | Staff/superuser |
| Candidate counts | GET /api/candidates-for-position/ | CandidatesForPositionView | Staff/superuser |
| Image upload | POST /api/upload/image/ | ImageUploadView | Staff/superuser |
| Voter login | POST /api/voter/login/ | StudentVoterLoginView | Public |
| Submit ballot | POST /api/vote/ | MultiVoteView | Voter headers |
| Position stats | GET /api/votes/position-stats/ | PositionStatsView | Staff/superuser |

## 9. Voting guarantees correctly enforced

Confirmed from code:

- Voter login considers elections where calculated `voting_open` is true.
- Student lookup during login is scoped to election.
- Login requires activation and no prior vote.
- Submission re-checks election availability, activation, and `has_voted` through the shared eligibility rule.
- Same-student submissions are serialized by a locked student row.
- Database uniqueness prevents the same voter token voting twice for one position.
- Duplicate positions in one request are rejected.
- Candidate IDs must belong to submitted positions.
- Submitted election must be the authenticated election and must remain open.
- Vote insertion and student status updates are in one transaction.
- has_voted is updated after vote creation in the transaction.
- Backend permissions are independent of frontend routes.
- Vote rows store a voter hash rather than a direct student foreign key.

## 10. Rules enforced only by the frontend

### Complete ballot

The frontend and backend require one selection for every election position. MultiVoteView compares submitted positions with the complete position set before creating votes.

### Displayed ballot context

The frontend trusts sessionStorage election values and constructs a synthetic election object. Backend submission validation remains authoritative, but the displayed context is not independently revalidated.

### Route visibility

Frontend role guards restrict navigation. They do not provide authorization.

## 11. Historical audit findings and current lifecycle status

The original findings below are retained for context. Election lifecycle rows are updated to the current backend behavior; unrelated findings should be rechecked against current code before being treated as open issues.

### Critical: cross-election vote payloads

MultiVoteView validates each payload election independently but does not require it to equal the authenticated election header or the locked student’s election.

Potential result:

- A valid token for election A is authenticated using election A.
- The payload contains valid position/candidate data from election B.
- The vote is stored against election B.
- The student from election A is marked as voted.

This violates election isolation and can corrupt results.

### Critical: candidate/student election mismatch

CandidateSerializer does not require candidate student election to equal position election. The vote view checks candidate-to-position membership only, allowing cross-election candidate assignment.

### Critical: cascading deletion

Positions, candidates, and elections can delete Vote rows through cascading foreign keys. This can destroy historical results.

### High: no independent voter-token expiry

The HMAC has no timestamp or expiry claim. It becomes unusable only when election or student state blocks it.

### High: results are not consistently election-filtered

PositionStatsView, ElectionResultsView, and CandidatesForPositionView do not consistently filter Vote queries by election. This becomes dangerous when inconsistent relationships or cross-election payloads exist.

### Resolved in the lifecycle refactor: configuration freeze

Position and candidate API mutations are locked at the scheduled opening time. Existing votes also lock ballot configuration. The same policy is checked by Django Admin forms/actions.

### High: partial ballots accepted by backend

The backend accepts any non-empty valid subset of positions.

### Resolved in the lifecycle refactor: invalid election times

ElectionSerializer rejects equal or reversed start/end values with a field-level `end_time` error.

### Product decision retained: multiple enabled elections

Multiple elections may remain enabled. If the same student ID is eligible in multiple open elections, voter login explicitly returns HTTP 409. Automatically selecting an election remains a separate product decision.

### Medium: exception details

MultiVoteView and ImageUploadView return exception strings in some error responses, potentially exposing implementation/provider details.

### Medium: bulk upload atomicity

Bulk upload has no explicit transaction boundary.

### Low/medium: debug prints

Operational views contain print calls that should not remain in production paths.

## 12. Concurrency and transaction-safety assessment

### Same-student submissions

The main path is substantially protected:

1. First request locks the student.
2. Second request waits.
3. First request creates votes and sets has_voted.
4. Second request sees has_voted and rejects.

The database uniqueness constraint provides additional protection. An explicit concurrency test is still needed.

### Partial failure

Vote creation and student status updates are inside one atomic transaction. A forced insertion failure should roll back both, but no such test exists.

### Election deactivation while voting

The vote path locks election rows with select_for_update(). Deactivation should serialize with voting, but this race is not tested.

### Candidate/position mutation

The vote path and ballot mutation endpoints lock election rows. Mutation endpoints reject changes at scheduled opening and after votes exist. Cascade deletion of historical votes remains a separate data-model risk.

### Timeout and retry

There is no idempotency key. If the server commits but the client times out, a retry should be rejected by status/uniqueness checks, but it will not be safely recognized as the same completed request.

## 13. Privacy and ballot-secrecy assessment

Positive properties:

- Vote rows store a voter hash instead of a direct student foreign key.
- Results endpoints do not expose voter hashes.
- The frontend does not display individual selections after success.

Limitations:

- The voter HMAC is deterministic for a student/election pair.
- The token is returned to and stored in the browser.
- XSS/browser compromise could expose token and student ID.
- Security logs contain raw student IDs, election IDs, IP addresses, and vote-attempt metadata.
- Privileged database operators can inspect vote hashes and student state.

Assessment:

This is application-level pseudonymization, not a formally unlinkable cryptographic ballot-secrecy protocol.

The election-scoped HMAC cannot be used for another election when the authentication election ID changes, because verification uses the requested election ID. It has no independent expiry.

## 14. Test coverage assessment

### Backend tests

Command run:

    .\\venv\\Scripts\\python.exe manage.py test --verbosity 1

Result:

- 5 tests discovered
- 3 passed
- 2 failed

Failures:

1. MultiVoteViewTests.test_happy_path_creates_votes_and_locks_student
2. MultiVoteViewTests.test_rejects_candidate_not_in_position

Both failed with HTTP 403 and Authentication credentials were not provided.

Confirmed cause:

- Tests call make_voter_hmac(student_id), not the current election-scoped HMAC.
- Tests omit HTTP_X_ELECTION_ID.
- Current VoterAuthentication requires the election header and verifies the election-scoped token.

The main vote tests do not currently reach their intended assertions.

### Backend checks

manage.py check passed with no system-check issues.

makemigrations --check --dry-run reported no model changes.

The test run warned that the staticfiles directory does not exist.

Pytest collection could not run because pytest is not installed in the virtual environment.

The scripts under tests/ are manual/integration-style scripts using requests, Django utilities, development data, and cleanup operations. They are not currently a dependable isolated regression suite.

### Frontend checks

npm run lint failed with 51 problems: 47 errors and 4 warnings.

Categories include:

- Explicit any types
- Unused variables
- Synchronous state updates inside effects
- Missing hook dependencies
- Manual memoization dependency mismatch

npx tsc --noEmit -p tsconfig.app.json completed without reported TypeScript errors.

There is no frontend test script or frontend automated test suite.

### Critical-rule coverage

Existing or partial coverage:

- Happy-path vote creation: test exists but fails at authentication.
- Wrong candidate/position: test exists but fails at authentication.
- Inactive election rejection: covered and passed.
- Student status updates: assertions exist in the failing happy-path test.
- Bulk upload creation and duplicate handling: covered and passed.

Missing reliable coverage:

- Cross-election payload rejection
- Election-scoped HMAC
- Inactive/already-voted submission
- Duplicate positions
- Concurrent submissions
- Transaction rollback
- Candidate/student election mismatch
- Deletion after votes
- Configuration changes after voting begins
- Election deactivation during voting
- Student deactivation between login and submission
- Multiple active elections
- Token reuse and expiry
- Results contamination
- Results exposure policy
- CSV correctness

## 15. Bugs, risks, and inconsistencies

### Critical

- C1: Cross-election vote payload vulnerability.
- C2: Vote-linked entities can cascade-delete votes.
- C3: Candidate can be attached across elections.
- C4: Core vote tests fail at authentication.

### High

- H1: Backend accepts partial ballots.
- H2: No configuration freeze after voting starts.
- H3: Results are not explicitly election-filtered everywhere.
- H4: Voter tokens have no independent expiry.
- H5: Frontend/backend role-policy mismatch.
- H6: Vote retries are not idempotent.

### Medium

- M1: Election time fields lack cross-field validation.
- M2: Multiple active elections lack an explicit policy.
- M3: Bulk upload has no explicit transaction.
- M4: Generic exception details are returned.
- M5: No frontend automated tests.
- M6: Frontend lint is failing.
- M7: SuccessPage.tsx is not routed; VotingPage owns the success state.
- M8: Frontend trusts session values for displayed ballot context.

### Low

- L1: Debug prints remain in backend views.
- L2: staticfiles directory warning.
- L3: Many frontend any types.
- L4: State-reset effects fail lint.

## 16. Recommended fixes in priority order

### Priority 0: before UI refresh

1. Update vote tests for the current election-scoped HMAC and required election header.
2. Require each submitted vote election ID to equal the authenticated election and locked student election.
3. Validate candidate student election equals position election.
4. Prevent deletion of elections, positions, candidates, or other vote-linked records once votes exist.
5. Explicitly scope all result/statistics Vote queries by election.

### Priority 1: reliable voting guarantees

6. Decide and enforce the ballot policy server-side: complete ballot or explicitly supported skipped positions.
7. Freeze positions/candidates after voting begins, or introduce safe versioning.
8. Validate election end time after start time.
9. Add transaction rollback tests.
10. Add concurrent same-student submission tests.
11. Add election-deactivation race tests.
12. Add student-deactivation-between-login-and-submit tests.

### Priority 2: token and operations

13. Decide whether voter tokens need explicit expiry/revocation.
14. Replace generic exception details with stable safe messages.
15. Add idempotency or document safe retry behaviour.
16. Remove debug prints.
17. Add an explicit bulk-upload transaction if partial imports are unacceptable.
18. Define and test results exposure while elections are active.

### Priority 3: frontend integrity baseline

19. Add frontend tests for admin roles, voter login, session storage, election-scoped ballot loading, payload headers/IDs, incomplete ballots, and success/error/retry handling.
20. Fix frontend lint failures before large visual refactors.
21. Standardize API error typing and response interfaces.
22. Decide whether SuccessPage should be routed or removed in favour of the inline success state.

## 17. Areas the UI refactor must not change

The UI refresh must not alter:

- Voter eligibility checks
- Election-window validation
- HMAC generation or verification semantics
- Voter headers
- Vote payload field names or IDs
- Student/election composite identity
- Vote serializer rules without an approved policy decision
- Student row locking
- Atomic vote creation/status updates
- Vote uniqueness constraints
- has_voted update ordering
- Student deactivation after successful voting
- Backend permissions
- Backend API contracts
- Results election scoping
- Candidate/position/election relationships
- Duplicate-submission behaviour
- Session/token clearing semantics without security review
- Image upload constraints and returned URL handling
- Query invalidation needed for admin consistency

## Conclusion

The vote transaction has a sound starting structure: it locks the student row, validates active/time-window state, bulk-creates votes inside a transaction, and updates has_voted only after vote creation. Same-student concurrent submissions are likely serialized correctly, with database uniqueness as an additional defense.

The application is not currently safe enough to preserve unchanged through a UI refresh. Backend corrections are needed first because the audit confirmed:

- Cross-election vote payloads are not rejected.
- Candidate/student election consistency is not enforced.
- Vote-linked records can cascade-delete existing votes.
- The primary vote-path tests currently fail at authentication.

The first phase should be backend integrity correction and test repair, not visual implementation. Before design work begins, add and pass tests for cross-election submissions, candidate-election consistency, deletion protection, rollback, incomplete ballots, concurrent submissions, token reuse, election deactivation during voting, and results election scoping.

After those protections and tests pass, the UI refresh can proceed while preserving the verified vote-submission contracts.
