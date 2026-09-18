import {useQuery} from '@tanstack/react-query';
import {getVoterSession, voterApi} from '../api/voterApi';

interface Election {
    id: number;
    name: string;
    year: number;
    start_time: string;
    end_time: string;
    is_active: boolean;
}

interface Position {
    id: number;
    name: string;
    display_order: number;
    election: number;
}

interface Candidate {
    id: number;
    student: number;
    student_name: string;
    position: number;
    photo_url?: string;
    ballot_number: number;
}

interface VotingData {
    election: Election;
    positions: Position[];
    candidatesByPosition: Record<number, Candidate[]>;
}

const fetchVotingData = async (): Promise<VotingData> => {
    const session = getVoterSession();
    const electionName = sessionStorage.getItem('election_name');
    const electionYear = sessionStorage.getItem('election_year');

    if (!session) {
        throw new Error('No election context found. Please login again.');
    }

    const electionId = session.electionId;

    // Build election object from session data
    const activeElection: Election = {
        id: parseInt(electionId, 10),
        name: electionName || '',
        year: parseInt(electionYear || '0', 10),
        start_time: '',
        end_time: '',
        is_active: true
    };

    // 2. Get positions for this election
    const positionsRes = await voterApi.getPositions(session);

    let positions = positionsRes.data;
    if (positions.results) {
        positions = positions.results;
    }

    if (!Array.isArray(positions)) {
        positions = [];
    }

    // Sort by display_order
    positions.sort((a: Position, b: Position) => a.display_order - b.display_order);

    // 3. Get candidates for each position
    const candidatesMap: Record<number, Candidate[]> = {};
    const candidatePromises = positions.map(async (position: Position) => {
        try {
            const candidatesRes = await voterApi.getCandidates(session, position.id);

            let candidates = candidatesRes.data;
            if (candidates.results) {
                candidates = candidates.results;
            }

            if (Array.isArray(candidates)) {
                candidatesMap[position.id] = candidates;
            }
        } catch (err) {
            if ((err as {response?: {status?: number}}).response?.status === 401 ||
                (err as {response?: {status?: number}}).response?.status === 403) {
                throw new Error('Your voter session is no longer valid. Please sign in again.');
            }
            candidatesMap[position.id] = [];
        }
    });

    await Promise.all(candidatePromises);

    return {
        election: activeElection,
        positions,
        candidatesByPosition: candidatesMap
    };
};

export function useVotingData(enabled: boolean = true) {
    const session = getVoterSession();
    const electionId = session?.electionId ?? null;
    const studentId = session?.studentId ?? null;
    return useQuery({
        queryKey: ['votingData', electionId, studentId],
        queryFn: fetchVotingData,
        enabled: enabled && !!session,
    });
}

export type {Election, Position, Candidate, VotingData};
