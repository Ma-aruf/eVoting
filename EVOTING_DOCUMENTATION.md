# eVoting Application Documentation

## Overview

The eVoting application is a comprehensive electronic voting system built with a Django REST Framework backend and React/TypeScript frontend. It is designed to manage school elections with role-based access control, secure voter authentication, and real-time voting capabilities.

## Architecture

### Technology Stack

**Backend:**
- Django 5.2.7
- Django REST Framework
- PostgreSQL (database)
- Simple JWT (authentication)
- Django CORS Headers
- WhiteNoise (static files)
- Redis (rate limiting in production)
- Cloudinary (image uploads in production)

**Frontend:**
- React 19.2.0
- TypeScript 5.9.3
- Vite 7.2.4 (build tool)
- React Router DOM 7.12.0 (routing)
- TanStack React Query 5.90.20 (data fetching)
- Axios 1.7.9 (HTTP client)
- TailwindCSS 4.1.18 (styling)
- React Toastify 11.0.5 (notifications)

**Deployment:**
- Railway (backend hosting)
- Render (frontend hosting)
- Vercel (alternative frontend)

## Project Structure

```
evoting/
├── evoting/                    # Django project configuration
│   ├── settings.py            # Django settings with environment-based config
│   ├── urls.py                # Main URL routing
│   ├── wsgi.py                # WSGI configuration
│   └── asgi.py                # ASGI configuration
├── core/                      # Main Django app
│   ├── models.py              # Database models
│   ├── serializers.py        # DRF serializers
│   ├── views.py               # API views
│   ├── urls.py                # API URL routing
│   ├── authentication.py      # Custom voter authentication
│   ├── permissions.py        # Role-based permissions
│   ├── middleware.py          # Custom middleware
│   ├── utils.py               # Utility functions (HMAC)
│   ├── signals.py             # Django signals
│   ├── admin.py               # Django admin configuration
│   └── migrations/            # Database migrations
├── evoting-frontend/          # React frontend
│   ├── src/
│   │   ├── pages/            # Page components
│   │   │   ├── admin/       # Admin dashboard pages
│   │   │   ├── StudentLoginPage.tsx
│   │   │   ├── VotingPage.tsx
│   │   │   └── SuccessPage.tsx
│   │   ├── components/       # Reusable components
│   │   ├── contexts/         # React contexts
│   │   ├── hooks/            # Custom hooks
│   │   ├── queries/          # React Query hooks
│   │   ├── utils/            # Utility functions
│   │   ├── App.tsx           # Main app component
│   │   └── apiConfig.ts      # Axios configuration
│   ├── package.json          # Frontend dependencies
│   └── vite.config.ts        # Vite configuration
├── manage.py                  # Django management script
├── requirements.txt           # Python dependencies
├── .env                       # Environment variables (local)
├── env.example               # Environment variables template
└── railway.toml              # Railway deployment config
```

## Database Models

### User Model
Extends Django's AbstractUser with role-based access control.

**Fields:**
- `username`: Username (inherited)
- `password`: Password (inherited)
- `role`: User role (choices: superuser, staff, activator)

**Roles:**
- **superuser**: Full system access, can manage users, elections, positions, candidates
- **staff**: Can manage students, candidates, view results
- **activator**: Can only activate/deactivate students for voting

### Election Model
Represents an election event.

**Fields:**
- `name`: Election name (max 100 chars)
- `year`: Election year
- `start_time`: Voting start datetime
- `end_time`: Voting end datetime
- `voting_enabled`: The administrator-controlled enable/pause switch. The old Election API field `is_active` is temporarily returned and accepted as a deprecated alias; it is not a second database field.

**Calculated lifecycle fields:**
- `status`: `scheduled` before `start_time`; `open` from `start_time` up to but not including `end_time` when voting is enabled; `paused` in that same window when voting is disabled; and `ended` at or after `end_time`.
- `voting_open`: True only when `voting_enabled` is true and `start_time <= now < end_time`.
- `candidate_changes_locked`: True at or after the scheduled start, or whenever votes already exist.
- `ballot_ready`: True when the election has at least one position and every position has at least one candidate. General election objects include this field for administration workflows.

The lifecycle is calculated by the backend using timezone-aware datetimes. It is not stored and does not require a scheduled job. `Student.is_active` remains a separate student eligibility switch. A student can vote only when the election is open, the student belongs to that election, is active, and has not voted.

Election creation and schedule validation require `end_time` to be later than `start_time`. Voting cannot be enabled or voters activated until the ballot is ready. Voter activation is allowed only while the election is open; scheduled, paused, and ended elections reject activation. Candidate and ballot configuration changes lock at the scheduled opening time, including while voting is paused. Existing votes also lock configuration. Once the stored start time has passed, it cannot be moved forward to reopen configuration.

Staff and superusers may extend `end_time` while an election is `open` or `paused`. Extensions must move the close time later and include a reason. The operation does not change `start_time`, `voting_enabled`, or ballot configuration; a paused election remains paused. Scheduled and ended elections cannot be extended. The actor, timestamp, previous and new close times, and reason are recorded in Django Admin history.

Both schedule times can be edited while an election remains `scheduled`, before its start time and before votes exist. Once an election is `ended`, its schedule and manual voting switch are read-only: the frontend hides management actions, API changes are rejected, and Django Admin does not allow changes.

**Constraints:**
- Multiple elections can have voting enabled simultaneously. If a student ID is eligible in more than one open election, voter login returns HTTP 409 rather than choosing one.
- Students are scoped by election_id to prevent vote mixing

### Student Model
Represents eligible voters.

**Fields:**
- `student_id`: Unique student identifier (max 30 chars)
- `full_name`: Student full name (max 100 chars)
- `class_name`: Class name (max 50 chars)
- `has_voted`: Boolean flag (default: False)
- `is_active`: Boolean flag for voting eligibility (default: False)
- `election`: Foreign key to Election

**Constraints:**
- Unique constraint on (election, student_id) combination
- Cannot be deleted if has_voted is True

### Position Model
Represents positions available in an election.

**Fields:**
- `name`: Position name (max 100 chars)
- `election`: Foreign key to Election
- `display_order`: Display order for UI

### Candidate Model
Represents students running for positions.

**Fields:**
- `student`: Foreign key to Student
- `position`: Foreign key to Position
- `photo_url`: URL to candidate photo (optional)
- `ballot_number`: Ballot number (default: 1)

**Constraints:**
- Unique constraint on (position, ballot_number)
- Unique constraint on student (one position per candidate)

### Vote Model
Represents cast votes.

**Fields:**
- `election`: Foreign key to Election
- `position`: Foreign key to Position
- `candidate`: Foreign key to Candidate
- `voter_hash`: HMAC hash of voter identity
- `created_at`: Timestamp of vote

**Constraints:**
- Unique constraint on (voter_hash, position) - one vote per position per voter

## API Endpoints

### Authentication Endpoints

#### Admin Login
- **POST** `/api/auth/login/`
- **Description**: Admin user authentication using JWT
- **Request**: `{ username, password }`
- **Response**: `{ access, refresh }` tokens

#### Token Refresh
- **POST** `/api/auth/refresh/`
- **Description**: Refresh access token
- **Request**: `{ refresh }`
- **Response**: `{ access }`

#### User Info
- **GET** `/api/auth/me/`
- **Description**: Get current authenticated user info
- **Authentication**: JWT required
- **Response**: `{ username, role }`

#### Voter Login
- **POST** `/api/voter/login/`
- **Description**: Student voter authentication using HMAC
- **Request**: `{ student_id }`
- **Response**: `{ token, student, election }`
- **Rate Limiting**: 5 requests per minute (production)

### Election Management

#### List Elections
- **GET** `/api/elections/`
- **Description**: List elections visible to the authenticated management account; lifecycle data includes `voting_enabled`, `status`, `voting_open`, `candidate_changes_locked`, and `ballot_ready`.
- **Query Params**: `voting_enabled` (optional); deprecated `is_active` alias is temporarily accepted.
- **Authentication**: Staff, activator, or superuser according to election scope

#### Create Election
- **POST** `/api/elections/create/`
- **Description**: Create new election
- **Authentication**: Superuser required
- **Request**: Election data
- **Enablement**: New elections are created with `voting_enabled: false`; configure positions and candidates before enabling voting.
- **Schedule rule**: `end_time` must be later than `start_time`.

- **PATCH** `/api/elections/{election_id}/schedule/`
- **Description**: Change both scheduled times while the election is still scheduled and has no recorded votes.
- **Authentication**: Staff or superuser required; staff are limited to their assigned election.
- **Request**: `{ "start_time": "2026-10-01T09:00:00Z", "end_time": "2026-10-01T17:00:00Z" }`
- **Validation**: The start must remain in the future and the end must be later than the start. Open, paused, and ended elections cannot use this endpoint.
- **Audit**: Django Admin history records the acting user, action time, and previous/new schedule.

#### Manage Elections
- **GET** `/api/elections/manage/`
- **Description**: Get all elections for management
- **Authentication**: Staff or Superuser required

- **PATCH** `/api/elections/manage/`
- **Description**: Enable or pause voting; this changes only the manual switch, not the calculated lifecycle status.
- **Authentication**: Staff or Superuser required
- **Request**: `{ election_id, voting_enabled }` (`is_active` is temporarily accepted as a deprecated alias)
- **Response**: Election data with `voting_enabled`, `status`, and `voting_open`, plus an enable/pause detail message
- **Rate Limiting**: 11 requests per minute (production)

- **POST** `/api/elections/{election_id}/extend/`
- **Description**: Extend an election's closing time without changing its manual voting switch or scheduled opening time.
- **Authentication**: Staff or superuser required; staff are limited to their assigned election.
- **Availability**: Only while the backend lifecycle status is `open` or `paused`. The new `end_time` must be later than the current close time. Scheduled and ended elections are rejected with HTTP 409.
- **Request**: `{ "end_time": "2026-10-01T18:00:00Z", "reason": "Late election opening" }`; both fields are required and the reason is limited to 500 characters.
- **Response**: Updated election lifecycle fields (`voting_enabled`, `status`, `voting_open`, `candidate_changes_locked`, plus the deprecated `is_active` alias) and `detail`.
- **Audit**: Django Admin history records the acting user, action time, previous and new closing times, and reason.

#### Election Stats
- **GET** `/api/elections/{election_id}/stats/`
- **Description**: Get election statistics
- **Authentication**: Staff or Superuser required
- **Response**: `{ election_id, total_voters, voters_voted, turnout_percentage }`

#### Election Results
- **GET** `/api/elections/{election_id}/results/`
- **Description**: Get comprehensive election results
- **Authentication**: Staff or Superuser required
- **Response**: Detailed results with candidate vote counts and percentages

### Student Management

#### List Students
- **GET** `/api/students/`
- **Description**: List students
- **Query Params**: `election_id` (optional)
- **Authentication**: Staff/Superuser (full), Activator (read-only)

#### Create Student
- **POST** `/api/students/`
- **Description**: Create single student
- **Authentication**: Staff or Superuser required
- **Request**: `{ student_id, full_name, class_name, election_id }`

#### Bulk Upload Students
- **POST** `/api/students/bulk-upload/`
- **Description**: Upload students via Excel file
- **Authentication**: Staff or Superuser required
- **Request**: `multipart/form-data` with file and election_id
- **File Format**: Excel with columns (student_id, full_name, class_name)

#### Activate Student
- **POST** `/api/students/activate/`
- **Description**: Toggle student activation status
- **Authentication**: Activator or Superuser required
- **Request**: `{ student_id, election_id, is_active }`
- **Rate Limiting**: 11 requests per minute (production)

### Position Management

#### List Positions
- **GET** `/api/positions/`
- **Description**: List positions (public)
- **Query Params**: `election_id` (optional)
- **Authentication**: None required for GET

#### Create Position
- **POST** `/api/positions/create/`
- **Description**: Create new position
- **Authentication**: Staff or Superuser required

#### Update Position
- **PUT/PATCH** `/api/positions/{pk}/`
- **Description**: Update position
- **Authentication**: Staff or Superuser required

#### Delete Position
- **DELETE** `/api/positions/{pk}/`
- **Description**: Delete position
- **Authentication**: Staff or Superuser required

### Candidate Management

#### List Candidates
- **GET** `/api/candidates/`
- **Description**: List candidates for a position (public)
- **Query Params**: `position_id` (required)
- **Authentication**: None required

#### Create Candidate
- **POST** `/api/candidates/create/`
- **Description**: Register candidate for position
- **Authentication**: Staff or Superuser required
- **Request**: `{ student, position, photo_url, ballot_number }`

#### Update Candidate
- **PUT/PATCH** `/api/candidates/{pk}/`
- **Description**: Update candidate
- **Authentication**: Staff or Superuser required

#### Delete Candidate
- **DELETE** `/api/candidates/{pk}/`
- **Description**: Delete candidate
- **Authentication**: Staff or Superuser required

#### Candidates for Position
- **GET** `/api/candidates-for-position/`
- **Description**: Get candidates with vote counts for a position
- **Query Params**: `position_id` (required)
- **Authentication**: Staff or Superuser required

### Voting

#### Cast Votes
- **POST** `/api/vote/`
- **Description**: Submit multiple votes
- **Authentication**: Custom VoterAuthentication (HMAC headers)
- **Headers**: `X-Student-Id`, `X-Election-Id`, `X-Voter-Token`
- **Request**: `{ votes: [{ election, position, candidate }] }`
- **Rate Limiting**: 10 requests per minute (production)
- **Validation**:
  - Student must be active
  - Student must not have voted
  - Election must be active
  - Must be within voting window
  - No duplicate positions in submission
  - Transactional locking prevents race conditions

### Statistics

#### Position Stats
- **GET** `/api/votes/position-stats/`
- **Description**: Get statistics for a specific position
- **Query Params**: `position_id` (required)
- **Authentication**: Staff or Superuser required
- **Response**: `{ position_id, unique_voters, votes_for_this_position, skipped_votes, skip_percentage }`

### Image Upload

#### Upload Image
- **POST** `/api/upload/image/`
- **Description**: Upload candidate photo
- **Authentication**: Staff or Superuser required
- **Request**: `multipart/form-data` with image file
- **Storage**: Cloudinary (production) or local (development)
- **Constraints**: Max 5MB, JPEG/PNG/WebP only

### Health Checks

#### Health Check
- **GET** `/health/` or `/healthz/`
- **Description**: Health check endpoint for deployment platforms
- **Response**: `"OK"`

## Authentication System

### Admin Authentication (JWT)
Admin users authenticate using JWT tokens provided by Django REST Framework SimpleJWT.

**Flow:**
1. Admin sends username/password to `/api/auth/login/`
2. Server returns access and refresh tokens
3. Access token is included in Authorization header: `Bearer {token}`
4. Access token expires after 1 day
5. Refresh token expires after 2 days
6. Frontend automatically refreshes tokens when they expire

**Token Storage:**
- Stored in localStorage
- Auto-refreshed every minute if expiring within 5 minutes
- Cleared on logout

### Voter Authentication (HMAC)
Students authenticate using HMAC-based tokens for voting.

**Flow:**
1. Student provides student_id to `/api/voter/login/`
2. Server validates:
   - Exactly one eligible student/election match exists among open elections
   - Election `voting_open` is true
   - Student belongs to that election and `Student.is_active=True`
   - Student hasn't voted (`has_voted=False`)
3. Server generates HMAC token: `HMAC(VOTER_HMAC_KEY, "{student_id}_{election_id}")`
4. Token, election lifecycle fields, and `can_vote_now` are returned to the client
5. Client includes headers in voting requests:
   - `X-Student-Id`: student_id
   - `X-Election-Id`: election_id
   - `X-Voter-Token`: HMAC token
6. Server verifies token and validates voting constraints

**Security Features:**
- Tokens are election-scoped (include election_id)
- HMAC prevents token forgery
- Voting window enforced at authentication and vote submission
- Transactional locking prevents double-voting
- Rate limiting prevents abuse

Multiple simultaneous elections remain supported as a product policy. If a student ID is eligible in multiple open elections, login returns HTTP 409. Automatically choosing an election is a separate future product decision.

Voter login reports the matching student's election lifecycle directly: scheduled elections return “Voting has not started yet,” paused elections return “Voting is currently paused,” and ended elections return “Voting has ended.” A ballot without at least one candidate for every position cannot be enabled, activated for, authenticated into, or voted in.

## Permission System

### Role-Based Access Control

**IsSuperUser:**
- Allowed roles: superuser
- Access: All endpoints

**IsStaffOrSuperUser:**
- Allowed roles: staff, superuser
- Access: Student management, candidate management, election management

**IsActivatorOrSuperUser:**
- Allowed roles: activator, superuser
- Access: Student activation only

**IsStaffOrSuperUserOrReadOnlyActivator:**
- Read access: activator, staff, superuser
- Write access: staff, superuser
- Used for: Student viewset (activators can view but not modify)

### Public Endpoints
Some endpoints are publicly accessible without authentication:
- Election listing
- Position listing
- Candidate listing
- Health checks

## Security Features

### Production Security Settings
When DEBUG=False:
- SSL redirect enabled
- HSTS with 1-year max age
- Content type sniffing protection
- XSS filter protection
- Frame options: DENY
- Allowed hosts restricted to configured domains

### Rate Limiting
Enabled in production with Redis:
- Voter login: 5 requests per minute
- Voting: 10 requests per minute
- Student activation: 11 requests per minute

### Security Logging
All security-related events are logged to `security.log`:
- Vote attempts (success/denied)
- Login attempts (success/denied)
- Activation attempts
- Election status changes
- Authentication failures

### CORS Configuration
Allowed origins configured for:
- Local development (localhost:5173, localhost:5175)
- Production domains (Render, Railway)
- Railway dynamic domains

### Input Validation
- Student ID uniqueness per election
- Ballot number uniqueness per position
- One position per candidate
- File type validation for uploads
- File size limits (5MB for images)

## Frontend Architecture

### Routing Structure

**Public Routes:**
- `/` - Student login page
- `/voter-login` - Student login page (alias)
- `/vote` - Voting page

**Admin Routes (under `/admin`):**
- `/admin/login` - Admin login
- `/admin/dashboard` - Dashboard (staff/superuser)
- `/admin/students` - Student management (staff/superuser)
- `/admin/elections` - Election management (superuser)
- `/admin/manage-elections` - Election activation (superuser)
- `/admin/positions` - Position management (superuser)
- `/admin/candidates` - Candidate management (staff/superuser)
- `/admin/activations` - Student activation (activator/superuser)
- `/admin/results` - Election results (superuser)
- `/admin/users` - User management (superuser)

### State Management

**React Query:**
- Server state management
- Automatic caching and refetching
- Optimistic updates
- Query invalidation on mutations
- 30-second stale time for admin data
- Auto-refresh on window focus, reconnect, and mount

**Context API:**
- AuthContext for authentication state
- User role and session management
- Token refresh logic

### Component Structure

**Pages:**
- **StudentLoginPage**: Student voter login with HMAC authentication
- **VotingPage**: Multi-position voting interface with candidate selection
- **SuccessPage**: Vote confirmation page
- **LoginPage**: Admin login with JWT authentication
- **Dashboard**: Overview statistics and quick actions
- **StudentsPage**: Student CRUD operations with bulk upload
- **ElectionsPage**: Election creation and management
- **ManageElectionsPage**: Election activation control
- **PositionsPage**: Position CRUD operations
- **CandidatesPage**: Candidate registration with photo upload
- **ActivationsPage**: Student activation interface for activators
- **ResultsPage**: Election results display with statistics
- **UsersPage**: Admin user management

**Components:**
- **AdminLayout**: Admin dashboard layout with navigation
- **ConfirmModal**: Reusable confirmation dialog
- **EditStudentModal**: Student edit modal
- **ImageUpload**: Image upload component with Cloudinary/local support
- **StudentRow**: Student table row component

### Custom Hooks

**useAuth:**
- Access authentication context
- Login/logout functions

**useConfirmModal:**
- Confirmation dialog state management

**useElectionResults:**
- Fetch and format election results

**useVotingData:**
- Fetch voting data (elections, positions, candidates)

### Query Hooks (React Query)

**useElections:**
- Fetch elections with optional filtering

**usePositions:**
- Fetch positions for an election

**useCandidates:**
- Fetch candidates for a position

**useStudents:**
- Fetch students with pagination and filtering

**useAllStudents:**
- Fetch all students without pagination

**useActivations:**
- Fetch student activation status

**useDashboard:**
- Fetch dashboard statistics

**useResults:**
- Fetch election results

**useManageElections:**
- Fetch election management data

### API Configuration

**Axios Instance:**
- Base URL from environment variable
- JSON content type
- Authorization header injection
- Automatic token refresh on 401 errors
- Redirect to login on refresh failure

## Deployment

### Environment Variables

**Required:**
- `DJANGO_SECRET_KEY`: Django secret key
- `VOTER_HMAC_KEY`: HMAC key for voter tokens
- `DATABASE_URL`: PostgreSQL connection string (Railway provides)

**Optional (Production):**
- `REDIS_URL`: Redis connection for rate limiting
- `CLOUDINARY_CLOUD_NAME`: Cloudinary cloud name
- `CLOUDINARY_API_KEY`: Cloudinary API key
- `CLOUDINARY_API_SECRET`: Cloudinary API secret

**Development:**
- `DEBUG`: True for development
- `ALLOWED_HOSTS`: Comma-separated hostnames

### Railway (Backend)
- Automatic PostgreSQL provisioning
- Environment variable injection
- Health checks at `/health/`
- Static files served via WhiteNoise
- Media files via Cloudinary (production)

### Render (Frontend)
- Vite build output
- Environment variable for API base URL
- Automatic deployments from Git

### Vercel (Alternative Frontend)
- Vite build output
- vercel.json configuration
- Automatic deployments

## Data Flow

### Voting Flow

1. **Setup Phase:**
   - Superuser creates election
   - Staff uploads students via Excel
   - Superuser creates positions
   - Staff registers candidates with photos

2. **Activation Phase:**
   - Activator activates students for voting
   - Students receive notification (manual process)

3. **Voting Phase:**
   - Student logs in with student_id
   - Server validates eligibility and returns HMAC token
   - Student views ballot with all positions
   - Student selects candidates for each position
   - Student submits votes with HMAC headers
   - Server validates and records votes transactionally
   - Student marked as voted and deactivated

4. **Results Phase:**
   - Superuser stops election
   - Staff/superuser view results
   - Results displayed with statistics

### Admin Flow

1. **Authentication:**
   - Admin logs in with username/password
   - JWT tokens issued and stored
   - Role-based routing applied

2. **Management:**
   - Staff manages students and candidates
   - Superuser manages elections and positions
   - Activator activates students
   - All actions logged to security.log

## Key Features

### Security
- HMAC-based voter authentication
- JWT-based admin authentication
- Role-based access control
- Rate limiting in production
- Security event logging
- SSL enforcement in production
- CORS protection

### Scalability
- Database connection pooling
- Redis caching for rate limiting
- Transactional voting to prevent race conditions
- Bulk operations for student upload

### User Experience
- Real-time data updates via React Query
- Responsive design with TailwindCSS
- Toast notifications for feedback
- Protected routes with role-based access
- Automatic token refresh

### Reliability
- Health check endpoints
- Comprehensive error handling
- Input validation
- Database constraints
- Transactional operations

## Development

### Backend Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Set up environment
cp env.example .env
# Edit .env with your settings

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Run development server
python manage.py runserver
```

### Frontend Setup
```bash
cd evoting-frontend

# Install dependencies
npm install

# Set environment variable
export VITE_API_BASE_URL=http://localhost:8000/

# Run development server
npm run dev

# Build for production
npm run build
```

### Testing
- Backend tests in `core/tests.py`
- Test coverage for voting logic
- Security validation tests

## Maintenance

### Database Migrations
```bash
python manage.py makemigrations
python manage.py migrate
```

### Static Files
```bash
python manage.py collectstatic
```

### Logs
- `django.log`: General application logs
- `security.log`: Security event logs

## Troubleshooting

### Common Issues

**CORS Errors:**
- Check CORS_ALLOWED_ORIGINS in settings.py
- Verify frontend URL matches allowed origins

**Authentication Failures:**
- Check JWT token expiration
- Verify HMAC key matches between environments
- Check security.log for authentication failures

**Database Connection:**
- Verify DATABASE_URL is set correctly
- Check PostgreSQL service status
- Verify database credentials

**Rate Limiting:**
- Check Redis connection in production
- Verify REDIS_URL environment variable
- Check rate limit settings in views.py

## Future Enhancements

Potential improvements:
- Email notifications for students
- Two-factor authentication for admins
- Real-time results updates via WebSockets
- Mobile app for voting
- Advanced analytics and reporting
- Audit trail for all admin actions
- Multi-language support
- Accessibility improvements
