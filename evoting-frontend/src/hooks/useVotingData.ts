import {useQuery} from '@tanstack/react-query';
import {getVoterSession, voterApi} from '../api/voterApi';
import type {VoterElection} from '../types/election';
import {voterLifecycleMessage} from '../utils/electionLifecycle';

type Election = VoterElection;

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
    can_vote_now: boolean;
    positions: Position[];
    candidatesByPosition: Record<number, Candidate[]>;
}

const fetchVotingData = async (): Promise<VotingData> => {
    const session = getVoterSession();
    if (!session) {
        throw new Error('Your voter session is no longer valid. Please sign in again.');
    }
    if (!session.canVoteNow || !session.election.voting_open || session.election.status !== 'open') {
        throw new Error(voterLifecycleMessage(session.election.status));
    }

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
        election: session.election,
        can_vote_now: session.canVoteNow,
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
        enabled: enabled && !!session && session.canVoteNow && session.election.voting_open && session.election.status === 'open',
    });
}

export type {Election, Position, Candidate, VotingData};
