import api from '../apiConfig';

export interface VoterSession {
    studentId: string;
    electionId: string;
    token: string;
}

export function getVoterSession(): VoterSession | null {
    const studentId = sessionStorage.getItem('student_id');
    const electionId = sessionStorage.getItem('election_id');
    const token = sessionStorage.getItem('voter_token');

    if (!studentId || !electionId || !token) return null;
    return {studentId, electionId, token};
}

export function clearVoterSession() {
    sessionStorage.removeItem('voter_token');
    sessionStorage.removeItem('student_id');
    sessionStorage.removeItem('student_name');
    sessionStorage.removeItem('election_id');
    sessionStorage.removeItem('election_name');
    sessionStorage.removeItem('election_year');
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
    submitVotes: (session: VoterSession, votes: unknown[]) => api.post('/api/vote/', {votes}, {
        headers: voterHeaders(session),
    }),
};
