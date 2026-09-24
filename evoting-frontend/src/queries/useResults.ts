import { useQuery } from '@tanstack/react-query';
import api from '../apiClient';
import { queryKeys } from './queryKeys';
import type { ElectionResultsLifecycle } from '../types/election';

export interface CandidateResult {
    id: number;
    student_id: string;
    candidate_name: string;
    photo_url?: string;
    vote_count: number;
    percentage: number;
    ballot_number?: number;
}

export interface PositionResult {
    position_id: number;
    position_name: string;
    display_order: number;
    total_votes: number;
    total_valid_votes?: number;
    skipped_votes: number;
    skipped_percentage: number;
    voting_mode: 'candidate' | 'yes_no';
    yes_votes: number;
    no_votes: number;
    approved: boolean | null;
    candidates: CandidateResult[];
}

export interface ElectionResult extends ElectionResultsLifecycle {
    election_id: number;
    election_name: string;
    year: number;
    total_voters: number;
    voters_voted: number;
    voter_turnout: number;
    positions: PositionResult[];
}

export interface ElectionResultsResponse extends ElectionResultsLifecycle {
    election_id: number;
    election_name: string;
    year: number;
    total_students: number;
    students_who_voted: number;
    voter_turnout_percentage: number;
    positions: Array<{
        position_id: number;
        position_name: string;
        display_order: number;
        total_valid_votes: number;
        skipped_votes: number;
        skip_percentage: number;
        voting_mode: 'candidate' | 'yes_no';
        yes_votes: number;
        no_votes: number;
        approved: boolean | null;
        candidates: Array<{
            id: number;
            student_id: string;
            candidate_name: string;
            photo_url?: string | null;
            vote_count: number;
            percentage: number;
            ballot_number?: number;
        }>;
    }>;
}

export function mapElectionResults(data: ElectionResultsResponse): ElectionResult {
    return {
        election_id: data.election_id,
        election_name: data.election_name,
        year: data.year,
        voting_enabled: data.voting_enabled,
        status: data.status,
        voting_open: data.voting_open,
        candidate_changes_locked: data.candidate_changes_locked,
        total_voters: data.total_students,
        voters_voted: data.students_who_voted,
        voter_turnout: data.voter_turnout_percentage,
        positions: data.positions.map(position => ({
            position_id: position.position_id,
            position_name: position.position_name,
            display_order: position.display_order,
            total_votes: position.total_valid_votes + position.skipped_votes,
            total_valid_votes: position.total_valid_votes,
            skipped_votes: position.skipped_votes,
            skipped_percentage: position.skip_percentage,
            voting_mode: position.voting_mode,
            yes_votes: position.yes_votes,
            no_votes: position.no_votes,
            approved: position.approved,
            candidates: position.candidates.map(candidate => ({
                id: candidate.id,
                student_id: candidate.student_id,
                candidate_name: candidate.candidate_name,
                photo_url: candidate.photo_url || undefined,
                vote_count: candidate.vote_count,
                percentage: candidate.percentage,
                ballot_number: candidate.ballot_number,
            })),
        })),
    };
}

export const useResults = (electionId: number | null, options?: {live?: boolean; userId?: string | null}) => {
    const live = options?.live ?? false;
    return useQuery({
        queryKey: live
            ? queryKeys.liveResults(options?.userId ?? null, electionId)
            : queryKeys.results(electionId),
        queryFn: async (): Promise<ElectionResult | null> => {
            if (!electionId) return null;
            
            const resultsRes = await api.get<ElectionResultsResponse>(`api/elections/${electionId}/results/`);
            return mapElectionResults(resultsRes.data);
        },
        enabled: !!electionId,
        staleTime: live ? 0 : 30 * 1000,
        refetchInterval: live ? 3000 : 60 * 1000,
        refetchIntervalInBackground: live,
        refetchOnWindowFocus: true,
    });
};
