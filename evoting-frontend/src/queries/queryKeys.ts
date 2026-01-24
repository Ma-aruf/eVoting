// Centralized query keys for React Query
export const queryKeys = {
  // Elections
  elections: ['elections'] as const,
  election: (id: number) => ['elections', id] as const,
  
  // Students (scoped by election)
  students: (electionId: number | null) => ['students', electionId] as const,
  student: (id: number) => ['students', id] as const,
  
  // Dashboard stats (scoped by election)
  dashboard: (electionId: number | null) => ['dashboard', electionId] as const,
  
  // Positions (scoped by election)
  positions: (electionId: number | null) => ['positions', electionId] as const,
  position: (id: number) => ['positions', id] as const,
  
  // Candidates (scoped by position)
  candidates: (positionId: number | null) => ['candidates', positionId] as const,
  candidate: (id: number) => ['candidates', id] as const,
  
  // Results (scoped by election)
  results: (electionId: number | null) => ['results', electionId] as const,
  
  // Users (admin users, not students)
  users: ['users'] as const,
  user: (id: number) => ['users', id] as const,
  
  // Activation status (scoped by election)
  activations: (electionId: number | null) => ['activations', electionId] as const,
} as const;
