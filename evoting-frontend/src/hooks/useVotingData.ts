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
}

interface VotingData {
    election: Election;
    positions: Position[];
    candidatesByPosition: Record<number, Candidate[]>;
}

const fetchVotingData = async (): Promise<VotingData> => {
    // 1. Get active election
    const electionRes = await api.get('/api/elections/', {
        params: {is_active: true}
    });

    let elections = electionRes.data;
    if (elections.results) {
        elections = elections.results;
    }

    if (!Array.isArray(elections) || elections.length === 0) {
        throw new Error('No active election found.');
    }

    const activeElection = elections[0];

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
                // Shuffle candidates for random order (only on first load)
                candidates = [...candidates].sort(() => Math.random() - 0.5);
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
    return useQuery({
        queryKey: ['votingData'],
        queryFn: fetchVotingData,
        enabled,
    });
}

export type {Election, Position, Candidate, VotingData};
