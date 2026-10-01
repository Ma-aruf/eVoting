// Centralized query keys for React Query
export const queryKeys = {
  // Elections
  elections: ['elections'] as const,
  election: (id: number) => ['elections', id] as const,
  
  // Students (scoped by election)
  students: (electionId: number | null) => ['students', electionId] as const,
  studentPage: (electionId: number | null, params: {page: number; search: string; active: string; voted: string; className: string}) =>
    ['students', electionId, 'page', params.page, params.search, params.active, params.voted, params.className] as const,
  activationOptions: (electionId: number | null, search: string) => ['students', electionId, 'activation-options', search] as const,
  student: (id: number) => ['students', id] as const,
  
  // Dashboard stats (scoped by election)
  dashboard: (electionId: number | null) => ['dashboard', electionId] as const,
  dashboardOperations: (username: string | undefined, role: string | null | undefined, assignedElectionId: number | undefined) =>
    ['dashboard-operations', username, role, assignedElectionId] as const,
  
  // Positions (scoped by election)
  positions: (electionId: number | null) => ['positions', electionId] as const,
  position: (id: number) => ['positions', id] as const,
  
  // Candidates (scoped by position)
  candidates: (positionId: number | null, electionId: number | null = null) => ['candidates', positionId, electionId] as const,
  candidate: (id: number) => ['candidates', id] as const,
  
  // Results (scoped by election)
  results: (electionId: number | null) => ['results', electionId] as const,
  liveResults: (userId: string | null, electionId: number | null) => ['live-results', userId, electionId] as const,
  
  // Users (admin users, not students)
  users: ['users'] as const,
  user: (id: number) => ['users', id] as const,
  
  // Activation status (scoped by election)
  activations: (electionId: number | null) => ['activations', electionId] as const,
  smsStatus: (electionId: number | null, page?: number, search?: string) => page === undefined ? ['sms-status', electionId] as const : ['sms-status', electionId, page, search ?? ''] as const,
  voterRecoveryStatus: (electionId: number | null, page?: number, search?: string) => page === undefined ? ['voter-recovery-status', electionId] as const : ['voter-recovery-status', electionId, page, search ?? ''] as const,
  voterData: ['votingData'] as const,
  voterDataForSession: (electionId: number | string | null, studentId: string | null) => ['votingData', electionId, studentId] as const,
  voterElectionEntry: (electionCode: string | undefined) => ['voter-election-entry', electionCode] as const,
  auditLogs: ['audit-logs'] as const,
} as const;
