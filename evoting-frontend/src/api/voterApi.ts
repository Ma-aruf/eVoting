import api from '../apiConfig';
import type {VoterElection, VoterLoginResponse} from '../types/election';

export interface VoterSession {
    studentId: string;
    electionId: string;
    token: string;
    canVoteNow: boolean;
    election: VoterElection;
}

const VOTER_LIFECYCLE_KEY = 'voter_lifecycle_context';

export function saveVoterSession(response: VoterLoginResponse) {
    sessionStorage.setItem('voter_token', response.token);
    sessionStorage.setItem('student_id', response.student.student_id);
    sessionStorage.setItem('student_name', response.student.full_name);
    sessionStorage.setItem('election_id', String(response.election.id));
    sessionStorage.setItem('election_name', response.election.name);
    sessionStorage.setItem('election_year', String(response.election.year));
    sessionStorage.setItem(VOTER_LIFECYCLE_KEY, JSON.stringify({
        canVoteNow: response.can_vote_now,
        election: response.election,
    }));
}

export function getVoterSession(): VoterSession | null {
    const studentId = sessionStorage.getItem('student_id');
    const electionId = sessionStorage.getItem('election_id');
    const token = sessionStorage.getItem('voter_token');
    const lifecycleContext = sessionStorage.getItem(VOTER_LIFECYCLE_KEY);

    if (!studentId || !electionId || !token || !lifecycleContext) return null;
    try {
        const context = JSON.parse(lifecycleContext) as {canVoteNow?: boolean; election?: VoterElection};
        if (typeof context.canVoteNow !== 'boolean' || !context.election || String(context.election.id) !== electionId) return null;
        return {studentId, electionId, token, canVoteNow: context.canVoteNow, election: context.election};
    } catch {
        return null;
    }
}

export function markVoterSessionUnableToVote() {
    const session = getVoterSession();
    if (!session) return;
    sessionStorage.setItem(VOTER_LIFECYCLE_KEY, JSON.stringify({
        canVoteNow: false,
        election: session.election,
    }));
}

export function clearVoterSession() {
    sessionStorage.removeItem('voter_token');
    sessionStorage.removeItem('student_id');
    sessionStorage.removeItem('student_name');
    sessionStorage.removeItem('election_id');
    sessionStorage.removeItem('election_name');
    sessionStorage.removeItem('election_year');
    sessionStorage.removeItem(VOTER_LIFECYCLE_KEY);
}

export function voterHeaders(session: VoterSession) {
    return {
        'X-Student-Id': session.studentId,
        'X-Election-Id': session.electionId,
        'X-Voter-Token': session.token,
    };
}

export const voterApi = {
    getPositions: (session: VoterSession) => api.get('/api/positions/', {
        params: {election_id: session.electionId},
        headers: voterHeaders(session),
    }),
    getCandidates: (session: VoterSession, positionId: number) => api.get('/api/candidates/', {
        params: {position_id: positionId},
        headers: voterHeaders(session),
    }),
    submitVotes: (session: VoterSession, votes: unknown[]) => api.post<{detail: string; can_vote_now: boolean}>('/api/vote/', {votes}, {
        headers: voterHeaders(session),
    }),
};
