import {useQuery} from '@tanstack/react-query';
import api from '../apiConfig';

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
    // 1. Get election from sessionStorage (set during login)
    const electionId = sessionStorage.getItem('election_id');
    const electionName = sessionStorage.getItem('election_name');
    const electionYear = sessionStorage.getItem('election_year');

    if (!electionId) {
        throw new Error('No election context found. Please login again.');
    }

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
    const positionsRes = await api.get('/api/positions/', {
        params: {election_id: activeElection.id}
    });

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
            const candidatesRes = await api.get('/api/candidates/', {
                params: {position_id: position.id}
            });

            let candidates = candidatesRes.data;
            if (candidates.results) {
                candidates = candidates.results;
            }

            if (Array.isArray(candidates)) {
                candidatesMap[position.id] = candidates;
            }
        } catch (err) {
            console.error(`Failed to fetch candidates for position ${position.id}:`, err);
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
    const electionId = sessionStorage.getItem('election_id');
    return useQuery({
        queryKey: ['votingData', electionId],
        queryFn: fetchVotingData,
        enabled: enabled && !!electionId,
    });
}

export type {Election, Position, Candidate, VotingData};
