# eVoting Frontend Refresh Plan

This document records the read-only inspection of the NUPS-G and eVoting projects and proposes a practical, incremental frontend refresh plan.

No application files were modified during the inspection.

## 1. Project locations and architectures

### NUPS-G

Located at:

- [NUPS-G root](D:/devs/nupsg)
- Frontend: [NUPS-G frontend](D:/devs/nupsg/frontend)
- Backend: [NUPS-G backend](D:/devs/nupsg/backend)

Documentation inspected:

- [AGENTS.md](D:/devs/nupsg/AGENTS.md)
- [README.md](D:/devs/nupsg/README.md)
- [design-language.md](D:/devs/nupsg/docs/design-language.md)
- [frontend-css-organization.md](D:/devs/nupsg/docs/frontend-css-organization.md)
- [frontend-phase-one-plan.md](D:/devs/nupsg/docs/frontend-phase-one-plan.md)

Architecture:

- React + Vite
- JavaScript/JSX
- React Router
- Context-based authentication
- API modules separated from presentation
- Shared CSS tokens, layout styles, component styles, and page styles
- Shared `AppShell`, navigation, buttons, forms, dialogs, alerts, loading, and error components
- Responsive layout switches to a navigation drawer below 1024px
- CSS-first responsive behaviour
- Explicit keyboard, focus, modal, and reduced-motion handling

### eVoting

Located at:

- [eVoting root](D:/Devs/evoting)
- Frontend: [eVoting frontend](D:/Devs/evoting/evoting-frontend)
- Django backend: [core](D:/Devs/evoting/core)

Architecture:

- React 19 + TypeScript
- Vite
- React Router DOM
- Tailwind CSS 4
- TanStack React Query
- Axios
- Context-based admin authentication
- JWT admin authentication
- HMAC-based student voter authentication
- Page-oriented structure under `src/pages`
- Query hooks under `src/queries`
- Shared components currently limited to:
  - `AdminLayout`
  - `ConfirmModal`
  - `EditStudentModal`
  - `ImageUpload`
  - `StudentRow`

Routing is centralized in [App.tsx](D:/Devs/evoting/evoting-frontend/src/App.tsx). Admin routes are role-protected for `superuser`, `staff`, and `activator`.

The current frontend has no dedicated design-token layer and no shared page, form, button, badge, table, loading, error, or empty-state primitives beyond the components listed above.

## 2. NUPS-G patterns worth adopting

The most valuable NUPS-G ideas are structural rather than brand-specific.

### Design foundations

- Tokenized colours, spacing, typography, radii, shadows, control heights, breakpoints, and focus rings
- A small, predictable visual scale
- White surfaces on a quiet off-white page canvas
- Blue reserved for actions, active navigation, links, focus, and selected states
- Semantic green, amber, and red states
- Consistent 8–12px control/card radii
- Quiet borders and restrained shadows

### Layout

- Shared page container with a maximum width
- Consistent page gutters
- Shared page header with title, supporting text, and action area
- Constrained forms and wide-but-contained tables
- Consistent vertical page rhythm
- Desktop sidebar with top bar
- Mobile top bar plus navigation drawer
- Role-filtered navigation, while retaining independent route/API authorization

### Components

- Shared `Button`
- Shared `FormField`
- Shared input/select patterns
- Shared `Badge`
- Shared `Alert`
- Shared `LoadingSkeleton`
- Shared `ErrorState`
- Shared `ModalFrame`
- Shared table and empty-state patterns

### Interaction and accessibility

- Visible `:focus-visible` styles
- Minimum 44px touch targets on mobile/coarse pointers
- Associated labels and `aria-describedby`
- `aria-invalid` on invalid fields
- Semantic buttons, links, lists, tables, and landmarks
- Keyboard-operable dialogs
- Escape-to-close and trigger-focus restoration
- Body scroll locking while drawers/dialogs are open
- Reduced-motion support
- Explicit success, loading, empty, error, and permission states

## 3. eVoting page-by-page audit

### Student login

[StudentLoginPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/StudentLoginPage.tsx)

Retain:

- Dedicated student-facing flow
- Clear explanatory content
- Student ID-specific messaging
- Responsive split layout concept

Improve:

- It uses a separate visual language from the admin login.
- It relies on large gradients, oversized headings, rounded-xl controls, and heavy shadows.
- The form field and submit button differ from the admin form.
- Error feedback is primarily toast-based.
- It should use a shared authentication foundation while retaining student-specific messaging.
- Focus, field association, and API error-summary behaviour should be verified.

### Admin login

[LoginPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/LoginPage.tsx)

Current issues:

- Much smaller and plainer than the student login.
- Uses a separate input/button treatment.
- No shared auth layout.
- Limited product/organisation identity.
- No shared inline error state.
- Autocomplete and accessibility attributes should be standardized.

Recommendation:

- Consolidate with a shared `AuthLayout`, `FormField`, `TextInput`, `PasswordInput`, and `Button`.
- Preserve admin wording and authentication logic.

### Voting page

[VotingPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/VotingPage.tsx)

Retain:

- Position-by-position voting workflow
- Candidate photos and ballot numbers
- Progress indicators
- Prevention of incomplete submissions
- Explicit success and failure handling
- Election/student context in the header

Improve substantially:

- It uses a dark blue header, amber title, green action, blue panels, and red logout button simultaneously.
- Candidate cards have fixed widths/heights that may be difficult at narrow tablet widths.
- Nested overflow containers may create scrolling problems on smaller screens.
- The button-shake animation can be distracting and has no reduced-motion handling.
- Candidate selection should use semantic radio-group behaviour where only one candidate can be selected per position.
- The progress indicator should expose a textual accessible status.
- Loading and error states should use shared components.
- A confirmation summary should precede the irreversible vote submission.

Proposed treatment:

- Calm neutral canvas
- One blue primary action
- Position sections as cards
- Candidate cards with selected border, background, check indicator, and keyboard support
- Clearly visible progress and submit area
- Dedicated confirmation summary before submission

### Success page

[SuccessPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/SuccessPage.tsx)

Retain:

- Simple completion message
- Clear return/login action
- No unnecessary data disclosure

Improve:

- Align card, typography, icon, success colour, and spacing with shared state-panel patterns.
- Do not rely on green alone to communicate completion.
- Ensure completion is announced appropriately.

### Admin dashboard

[Dashboard.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/Dashboard.tsx)

Current issues:

- Three gradient metric cards use different blues/cyans without a clear semantic reason.
- Active election details use progressively tinted green blocks.
- No shared page header or metric-card component.
- Loading is implemented as a repeated translucent overlay.
- Content is not clearly constrained on wide screens.

Recommendation:

- Shared page header
- Shared statistic cards
- One active-election summary card
- Clear turnout, activation, and vote metrics
- Skeleton metric cards during loading
- Empty state when no active election exists
- Error state with retry

### Students page

[StudentsPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/StudentsPage.tsx)

Retain:

- Single and bulk creation workflows
- Election filtering
- Student status indicators
- Edit/delete behaviour
- Excel upload

Improve:

- Repeated form and table styling
- Ad hoc control heights and colours
- Green used for some actions while blue is used elsewhere
- Mobile behaviour relies heavily on horizontal table scrolling
- Bulk-upload guidance should use a reusable help panel
- Status badges should be consolidated

Recommended structure:

1. Page header
2. Election context/filter toolbar
3. Summary metrics
4. Primary actions
5. Add/bulk upload sections
6. Student data table on desktop
7. Student cards or row details on mobile

### Elections page

[ElectionsPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/ElectionsPage.tsx)

Current issues:

- Creation form and listing use repeated local patterns.
- Date/time controls need consistent labels, helper text, and errors.
- Summary-card and table conventions are duplicated.
- Search UI appears partially disabled/commented out.
- Active/inactive status needs a shared badge.

Recommendation:

- Reusable `ElectionForm`
- Shared `DataTable`
- Shared `StatusBadge`
- Consistent date formatting and timezone explanation
- Explicit empty state for no elections

### Manage elections page

[ManageElectionsPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/ManageElectionsPage.tsx)

Retain:

- Dedicated operational activation/deactivation page
- Active election summary
- Clear deactivation action

Improve:

- Duplicates Elections page metrics, table, and status styles.
- Destructive action should use a shared confirmation dialog.
- Active-election panel needs clearer warning copy.
- Loading overlay should become a page or section busy state.

### Positions page

[PositionsPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/PositionsPage.tsx)

Current issues:

- Add and edit forms duplicate controls.
- Position ordering lacks explanatory context.
- Search and table styles duplicate other management pages.
- Several class combinations appear inconsistent or accidental.

Recommendation:

- Shared entity form pattern
- Shared election selector
- Shared order-field treatment
- Shared table and action buttons
- Empty state for elections without positions

### Candidates page

[CandidatesPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/CandidatesPage.tsx)

This is the most complex admin page and the highest-risk visual refactor.

Retain:

- Election → position → student relationships
- Candidate search and conflict validation
- Ballot number handling
- Candidate photo upload
- Edit/delete workflows
- Existing API/query logic

Current issues:

- Approximately 45 KB of page-local JSX and style strings.
- Multiple forms, edit forms, filters, search dropdowns, tables, actions, and image controls are implemented locally.
- Custom student dropdowns do not appear to have complete combobox semantics.
- Many repeated border, focus, button, and status patterns exist.
- Desktop and mobile data presentation need deliberate design.
- Image controls need consistent keyboard and touch behaviour.

Recommendation:

- Refactor after foundations exist.
- Extract `ElectionPositionSelector`, `StudentCombobox`, `CandidateForm`, `CandidateTable`, `CandidateCard`, and `CandidateStatus`.
- Keep domain-specific validation in the page/hooks.

### Activations page

[ActivationsPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/ActivationsPage.tsx)

Retain:

- Activator-specific workflow
- Searchable student selection
- Active-election dependency
- Active/voted statuses
- Role-based route protection

Current issues:

- Uses different blue/cyan gradients from other pages.
- The no-active-election panel uses a red background with a yellow border.
- Search suggestions need keyboard navigation and an accessible active option.
- Activation should have a local progress state rather than blocking the whole page.
- Selected-student summary should use shared badges and action patterns.

### Results page

[ResultsPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/ResultsPage.tsx)

Retain:

- Election selection
- Position-by-position results
- Winner emphasis
- Vote counts and percentages
- CSV export

Current issues:

- Results use multiple gradients and bright winner treatments.
- Some controls have weak contrast and inconsistent hover colours.
- Position navigation may be difficult for keyboard and mobile users.
- Results are visually dense and need stronger hierarchy.
- Loading is duplicated.
- Error feedback is sent through a toast effect rather than a persistent page state.

Recommendation:

- Results summary header
- Restrained winner styling
- Semantic tables or clearly labelled result cards
- Accessible position navigation
- Preserve CSV export as a secondary action

### Users page

[UsersPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/UsersPage.tsx)

Retain:

- Superuser-only management
- Role badges
- Active/inactive status
- Add/edit/delete workflows

Improve:

- Role colours should be defined centrally.
- User form and table patterns duplicate other pages.
- Destructive actions need consistent confirmation treatment.
- Role capabilities should be explained clearly without exposing security-sensitive details.
- Permission-denied and empty states should be explicit.

### Admin layout

[AdminLayout.tsx](D:/Devs/evoting/evoting-frontend/src/components/AdminLayout.tsx)

Current strengths:

- Desktop sidebar and mobile drawer already exist.
- Navigation is filtered by role.
- Layout is separated from page content.
- Route changes close the mobile sidebar.

Current weaknesses compared with NUPS-G:

- Sidebar is a blue gradient rather than a stable dark navigation surface.
- Active navigation is a white pill rather than a light-blue active row with blue icon/text and an indicator.
- Sidebar width is 224px versus NUPS-G’s approximately 232–256px guidance.
- Desktop top bar is mostly empty and uses pale sky-blue.
- Mobile drawer lacks complete focus-trapping, Escape, focus-restoration, body-scroll, and reduced-motion behaviour.
- Navigation uses manual pathname equality instead of a reusable active-link pattern.
- Logout has no visible pending state.
- Page content has no shared max-width container.
- Styling is embedded directly in JSX.

## 4. Design-system comparison

| Area | NUPS-G | eVoting | Recommendation |
|---|---|---|---|
| Styling | Tokenized CSS layers | Page-local Tailwind strings | Keep Tailwind, add tokens and shared primitives |
| Primary colour | `#2727A8` | Several blues/cyans | Adopt one primary blue and dark partner |
| Page canvas | `#F7F7FC` | Mostly `gray-100` | Use a softer neutral canvas |
| Surface | White cards with quiet borders/shadows | White cards, often gradients around them | Keep white surfaces, reduce gradients |
| Typography | Roboto, compact documented scale | Inter configured, local sizes | Choose one font system and named type tokens |
| Sidebar | Dark blue, light active row | Blue gradient, white active pill | Adopt dark sidebar and blue active indicator |
| Mobile navigation | Drawer with focus/reduced-motion handling | Basic transform/overlay drawer | Improve behaviour without changing routes |
| Controls | Shared button/input/form primitives | Repeated local strings | Create primitives incrementally |
| Tables | Named scroll wrappers and mobile alternatives | Mostly `overflow-x-auto` | Add accessible table wrapper and mobile presentation |
| Loading | Skeletons and named loading states | Repeated overlays/spinners | Use skeletons for initial load and local busy states |
| Errors | Inline actionable error state | Toasts plus local red blocks | Inline page errors, toast transient mutation feedback |
| Empty states | Shared centred panels | Inconsistent local messages | Create reusable empty state |
| Modals | Shared modal frame and focus behaviour | Several separate implementations | Consolidate modal mechanics |
| Motion | Small, documented, reduced-motion aware | Fade/scale plus vote-button shake | Tokenize motion and reduce attention animations |
| Accessibility | Explicit documented requirements | Partially consistent | Add shared semantics through primitives |

## 5. Proposed eVoting design foundations

These should be adapted from NUPS-G, not copied wholesale.

### Colours

```text
--ev-color-primary: #2727A8
--ev-color-primary-dark: #17175F
--ev-color-primary-soft: #EEEEFF

--ev-color-background: #F7F7FC
--ev-color-surface: #FFFFFF
--ev-color-text: #1B1B2F
--ev-color-text-secondary: #6E6E7A
--ev-color-text-muted: #8A8A98
--ev-color-border: #E2E2EC

--ev-color-success: #178A55
--ev-color-success-soft: #EAF7F0
--ev-color-warning: #C78300
--ev-color-warning-soft: #FFF5DB
--ev-color-error: #C62828
--ev-color-error-soft: #FDECEC

--ev-color-nav-background: #17175F
--ev-color-focus-ring: rgba(39, 39, 168, .32)
--ev-color-overlay: rgba(23, 23, 95, .56)
```

eVoting-specific additions may include:

- `--ev-color-ballot-selected`
- `--ev-color-ballot-number`
- `--ev-color-voting-warning`
- `--ev-color-readonly`

Status should always include text or an icon, not colour alone.

### Typography

Recommended:

- Font: Roboto or the existing Inter family, but choose one consistently.
- Body: 14–15px compact admin scale, 16px in voter forms where helpful.
- Page title: 24px desktop, 20–22px mobile.
- Section title: 17–18px.
- Labels: 13–14px, medium.
- Buttons: 14–16px, medium.
- Table headings: 12px, medium/bold.
- Metrics: 24–32px, bold.
- Never use sub-12px UI text.

### Spacing

Use a compact shared scale:

```text
4px, 8px, 12px, 20px, 24px, 32px
```

Guidelines:

- Page gutters: 16px mobile, 24px tablet, 32px wide desktop
- Standard page section gap: 24px mobile, 32px desktop
- Card padding: 20px desktop, minimum 16px mobile
- Form field gaps: 16px
- Control heights: 40px desktop, 44px mobile/coarse pointer
- Voting candidate cards: flexible width, avoiding fixed heights where possible

### Breakpoints

```text
480px  small mobile
768px  tablet
1024px desktop shell/sidebar
1280px wide desktop
1440px very wide desktop
```

Use CSS/Tailwind responsive utilities for visual layout. Avoid JavaScript width checks unless the DOM or interaction genuinely differs.

### Layout

- Standard max-width: 1200px
- Data-heavy views: up to 1360px
- Auth forms: 440–480px
- Complex admin forms: up to 720px
- Tables stay within the page container and scroll internally
- Use `min-height: 100dvh`
- Keep the admin content area independently scrollable

### Borders, radii, and shadows

- Small radius: 4px
- Medium: 8px
- Large: 10px
- Card/modal: 12–16px
- Badge/pill: 999px
- Small shadow: `0 1px 2px rgba(23, 23, 95, .08)`
- Medium shadow: `0 3px 12px rgba(23, 23, 95, .12)`
- Avoid gradients except for a restrained voter-facing hero treatment when clearly useful.

### Component states

Every reusable interactive component should define:

- Default
- Hover
- Active/pressed
- Focus-visible
- Disabled
- Loading
- Selected
- Invalid/error
- Read-only where applicable

## 6. Reusable components

Suggested structure:

```text
src/
  components/
    layout/
      AdminShell.tsx
      AppTopBar.tsx
      MobileNavDrawer.tsx
      PageContainer.tsx
      PageHeader.tsx
    ui/
      Button.tsx
      IconButton.tsx
      TextInput.tsx
      PasswordInput.tsx
      SelectField.tsx
      FormField.tsx
      Badge.tsx
      Alert.tsx
      EmptyState.tsx
      LoadingState.tsx
      Skeleton.tsx
      Spinner.tsx
      Modal.tsx
      ConfirmModal.tsx
    tables/
      DataTable.tsx
      TableToolbar.tsx
      MobileRecordCard.tsx
    voting/
      CandidateCard.tsx
      PositionSection.tsx
      BallotProgress.tsx
      VoteReview.tsx
```

Prioritize:

1. `PageContainer`
2. `PageHeader`
3. `Button`
4. `FormField`
5. `TextInput`
6. `SelectField`
7. `Badge`
8. `Alert`
9. `LoadingState`
10. `EmptyState`
11. `Modal`
12. `DataTable`
13. `CandidateCard`

Avoid abstractions for one-off domain logic. Keep candidate conflict rules, election-specific validation, and voting rules in the existing page/query/domain code.

## 7. Phased implementation plan

### Phase 1 — Foundations and admin shell

Scope:

- Add design tokens using CSS variables or Tailwind-compatible theme tokens.
- Normalize body background, font, text colours, focus rings, control heights, radii, and shadows.
- Replace the admin gradient sidebar with a stable dark-blue navigation surface.
- Add a shared page container and page header.
- Improve mobile drawer semantics, Escape handling, focus restoration, body scroll locking, and reduced-motion behaviour.
- Preserve routes, permissions, API calls, authentication, and logout behaviour.

Likely files:

- [index.css](D:/Devs/evoting/evoting-frontend/src/index.css)
- [tailwind.config.ts](D:/Devs/evoting/evoting-frontend/tailwind.config.ts)
- [AdminLayout.tsx](D:/Devs/evoting/evoting-frontend/src/components/AdminLayout.tsx)
- New files under `src/components/layout/`
- Possibly [App.tsx](D:/Devs/evoting/evoting-frontend/src/App.tsx) for route-focus handling

### Phase 2 — Shared UI primitives

Create and adopt:

- Button variants
- Form fields
- Selects
- Inputs
- Badges
- Alerts
- Loading states
- Empty states
- Modal mechanics
- Icon buttons

Likely files:

- New `src/components/ui/*`
- [ConfirmModal.tsx](D:/Devs/evoting/evoting-frontend/src/components/ConfirmModal.tsx)
- [EditStudentModal.tsx](D:/Devs/evoting/evoting-frontend/src/components/EditStudentModal.tsx)
- [ImageUpload.tsx](D:/Devs/evoting/evoting-frontend/src/components/ImageUpload.tsx)
- [StudentRow.tsx](D:/Devs/evoting/evoting-frontend/src/components/StudentRow.tsx)

### Phase 3 — Authentication and voter entry

Refactor:

- Admin login
- Student login
- Success page

Likely files:

- [LoginPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/LoginPage.tsx)
- [StudentLoginPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/StudentLoginPage.tsx)
- [SuccessPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/SuccessPage.tsx)
- New auth layout/components

Do not change JWT, HMAC, token storage, or authentication API behaviour.

### Phase 4 — Dashboard and operational overview

Refactor:

- Dashboard metric cards
- Active-election summary
- Loading, empty, and error states

Likely files:

- [Dashboard.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/Dashboard.tsx)
- New `StatisticCard.tsx`
- Dashboard-specific styling/components

### Phase 5 — Election, position, student, and activation management

Refactor:

- Elections
- Manage elections
- Positions
- Students
- Activations

Likely files:

- [ElectionsPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/ElectionsPage.tsx)
- [ManageElectionsPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/ManageElectionsPage.tsx)
- [PositionsPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/PositionsPage.tsx)
- [StudentsPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/StudentsPage.tsx)
- [ActivationsPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/ActivationsPage.tsx)

### Phase 6 — Candidates and image workflows

Refactor the largest and most duplicated page after the component system is stable.

Likely files:

- [CandidatesPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/CandidatesPage.tsx)
- [ImageUpload.tsx](D:/Devs/evoting/evoting-frontend/src/components/ImageUpload.tsx)
- New candidate-specific components

Keep existing candidate validation and mutation hooks.

### Phase 7 — Results and voting refinement

Refactor:

- Results presentation
- CSV export affordance
- Candidate cards
- Ballot progress
- Confirmation/review state
- Mobile voting behaviour

Likely files:

- [ResultsPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/admin/ResultsPage.tsx)
- [VotingPage.tsx](D:/Devs/evoting/evoting-frontend/src/pages/VotingPage.tsx)
- New `src/components/voting/*`

This phase needs focused manual testing because it touches the most sensitive user workflow.

### Phase 8 — Cleanup and consistency pass

- Remove duplicated Tailwind strings where shared components now exist.
- Remove obsolete gradients and inconsistent colour variants.
- Check all pages for headings, labels, focus states, loading, empty, error, and permission states.
- Confirm no backend/API/security logic was altered.

## 8. Risks and dependencies

- The eVoting frontend currently has no formal frontend design documentation or `AGENTS.md`; proposed tokens should be documented once approved.
- Tailwind 4 differs from the NUPS-G plain CSS architecture. Directly copying NUPS-G CSS files would create unnecessary integration risk.
- Existing pages mix domain logic with presentation. Large rewrites could affect election selection, candidate conflict validation, or mutation invalidation.
- The voting flow has security-sensitive UI boundaries. Visual refactoring must not alter submit timing, headers, selected-vote payloads, or duplicate-submission prevention.
- HMAC voter authentication should remain untouched.
- Hidden navigation must never be treated as authorization.
- Some existing visual behaviour may be relied on by users, especially the student voting layout and candidate photos. Refactor progressively.
- Directly copying NUPS-G branding, logo treatment, terminology, or organisation-specific navigation would be inappropriate.
- NUPS-G membership workflows do not map one-to-one to elections, ballots, candidates, or results.
- NUPS-G sidebar sizing and typography should be adapted to eVoting’s denser admin tables rather than applied rigidly.

## 9. Testing checklist

### Desktop

- Test at 1024px, 1280px, 1440px, and wider screens.
- Verify sidebar width and content max-width.
- Verify header alignment.
- Ensure tables remain contained.
- Ensure forms do not stretch excessively.
- Ensure dashboard cards maintain useful minimum widths.

### Tablet

- Test at 768px and approximately 900px.
- Verify two-column forms only where fields are logically paired.
- Verify navigation transition before/at 1024px.
- Verify tables and action toolbars remain usable.
- Verify candidate cards wrap without clipping.

### Mobile

- Test at 320px, 360px, 390px, and 480px.
- Test drawer opening and closing.
- Verify no background scroll while drawer/modal is open.
- Verify 44px touch targets.
- Verify readable form controls.
- Verify stacked buttons.
- Verify deliberate table scrolling or card alternatives.
- Verify voting candidate cards do not create horizontal page overflow.

### Accessibility

- Keyboard navigation through forms and tables
- Visible focus rings
- Correct heading order
- Associated labels and descriptions
- `aria-invalid` and error associations
- Modal focus trap, Escape, and focus restoration
- Drawer accessibility
- Radio/combobox semantics for voting and student search
- Screen-reader announcements for loading, success, and urgent errors
- Status conveyed through text/icons as well as colour
- 200% zoom and text reflow
- Contrast verification for primary blue, dark blue, muted text, and status colours

### States

For every query/mutation page, test:

- Initial loading
- Background refetch
- Mutation pending
- Empty collection
- Search with no matches
- API error
- Retry
- Success feedback
- Disabled action
- Permission-denied route
- Missing active election
- Invalid form submission
- Destructive confirmation
- Already-voted/locked student state
- Activation unavailable state

### Motion

- Normal motion
- `prefers-reduced-motion: reduce`
- No essential information dependent on animation
- No distracting vote-submit shake when reduced motion is enabled

## 10. Decisions needed before implementation

The following decisions could affect the first implementation:

1. Should eVoting use Roboto to match NUPS-G, or retain the currently configured Inter family?
2. Should the student voter experience share the same blue/neutral foundation as the admin application, or retain a modestly distinct voter-facing hero treatment?
3. Should mobile navigation switch at 1024px, matching NUPS-G, or remain at the current Tailwind `md` breakpoint?
4. Should mobile tables use horizontal scrolling, compact cards, or a page-specific combination?
5. Is the current eVoting branding/logo asset approved, or should the refresh use a text-based brand lockup initially?

Recommended defaults:

- Roboto for visual consistency
- Shared blue/neutral foundation for both experiences
- 1024px shell breakpoint
- Tables scroll on tablet and use compact cards where the data is action-heavy
- Preserve current eVoting text branding until a logo decision is made

## Recommended first implementation phase

Start with Phase 1: design foundations and the admin shell.

It offers the widest visual improvement with the lowest domain risk. It establishes the colours, typography, spacing, containers, sidebar, top bar, mobile drawer, focus behaviour, and responsive rules that every later page can reuse.

Phase 1 should not change query hooks, API calls, authentication, permissions, routing, or voting logic. Code changes should wait for approval.
