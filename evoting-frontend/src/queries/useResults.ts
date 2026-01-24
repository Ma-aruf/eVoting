import { useQuery } from '@tanstack/react-query';
import api from '../apiConfig';
import { queryKeys } from './queryKeys';

export interface CandidateResult {
    id: number;
    student_id: string;
    candidate_name: string;
    photo_url?: string;
    vote_count: number;
    percentage: number;
}

export interface PositionResult {
    position_id: number;
    position_name: string;
    display_order: number;
    total_votes: number;
    skipped_votes: number;
    skipped_percentage: number;
    candidates: CandidateResult[];
}

export interface ElectionResult {
    election_id: number;
    election_name: string;
    year: number;
    total_voters: number;
    voters_voted: number;
    voter_turnout: number;
    positions: PositionResult[];
}

export const useResults = (electionId: number | null) => {
    return useQuery({
        queryKey: queryKeys.results(electionId),
        queryFn: async (): Promise<ElectionResult | null> => {
            if (!electionId) return null;
            
            const resultsRes = await api.get(`api/elections/${electionId}/results/`);
            const data = resultsRes.data;

            // Map backend response to frontend format
            const finalResult: ElectionResult = {
                election_id: data.election_id,
                election_name: data.election_name,
                year: data.year,
                total_voters: data.total_students,
                voters_voted: data.students_who_voted,
                voter_turnout: data.voter_turnout_percentage,
                positions: data.positions.map((pos: any) => ({
                    position_id: pos.position_id,
                    position_name: pos.position_name,
                    display_order: pos.display_order,
                    total_votes: pos.total_valid_votes + pos.skipped_votes,
                    skipped_votes: pos.skipped_votes,
                    skipped_percentage: pos.skip_percentage,
                    candidates: pos.candidates.map((cand: any) => ({
                        id: cand.id,
                        student_id: cand.student_id,
                        candidate_name: cand.candidate_name,
                        photo_url: cand.photo_url || undefined,
                        vote_count: cand.vote_count,
                        percentage: cand.percentage
                    }))
                }))
            };

            return finalResult;
        },
        enabled: !!electionId,
        staleTime: 30 * 1000, // 30 seconds
        refetchInterval: 60 * 1000, // Auto-refresh every minute
    });
};
