import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import api from '../apiClient';
import {queryKeys} from './queryKeys';
import {getApiErrorData, getFirstFieldError, isRecord} from '../utils/apiErrors';
import {showError, showSuccess} from '../utils/toast';

export interface Candidate {
    id: number;
    student: number;
    student_name: string;
    position: number;
    photo_url: string;
    ballot_number: number;
}

function showCandidateError(error: unknown, fallback: string) {
    const data = getApiErrorData(error);

    if (typeof data === 'string') {
        if (data.includes('ballot number')) {
            showError(`Ballot number conflict: ${data}`);
        } else if (data.includes('already') || data.includes('candidate')) {
            showError(`Candidate conflict: ${data}`);
        } else {
            showError(data);
        }
        return;
    }

    if (isRecord(data)) {
        const message = getFirstFieldError(data);

        if (data.ballot_number) {
            showError(`Ballot number conflict: ${message ?? 'This ballot number is already in use.'}`);
        } else if (data.student) {
            showError(`Candidate conflict: ${message ?? 'This student is already a candidate.'}`);
        } else {
            showError(message ?? 'Validation failed. Please check your input.');
        }
        return;
    }

    showError(fallback);
}

export const useCandidates = (positionId: number | null, electionId: number | null = null) =>
    useQuery({
        queryKey: queryKeys.candidates(positionId, electionId),
        queryFn: async (): Promise<Candidate[]> => {
            if (!positionId) return [];

            const response = await api.get('api/candidates/', {
                params: {position_id: positionId},
            });
            const data = response.data;

            if (Array.isArray(data)) {
                return data;
            }

            return Array.isArray(data.results) ? data.results : [];
        },
        enabled: positionId !== null,
        staleTime: 30 * 1000,
    });

export const useCreateCandidate = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            student: number;
            position: number;
            photo_url?: string;
            ballot_number?: number;
            election_id?: number;
        }) => {
            const response = await api.post('api/candidates/create/', data);
            return response.data;
        },
        onSuccess: (_, variables) => {
            showSuccess('Candidate created successfully.');
            queryClient.invalidateQueries({
                queryKey: queryKeys.candidates(
                    variables.position,
                    variables.election_id ?? null,
                ),
            });
        },
        onError: (error: unknown) => {
            showCandidateError(error, 'Failed to create candidate.');
        },
    });
};

export const useUpdateCandidate = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: {
            id: number;
            student: number;
            position: number;
            photo_url?: string;
            ballot_number?: number;
            election_id?: number;
        }) => {
            const {id, ...data} = input;
            delete data.election_id;
            const response = await api.put(`api/candidates/${id}/`, data);
            return response.data;
        },
        onSuccess: (_, variables) => {
            showSuccess('Candidate updated successfully.');
            queryClient.invalidateQueries({
                queryKey: queryKeys.candidates(
                    variables.position,
                    variables.election_id ?? null,
                ),
            });
            queryClient.invalidateQueries({queryKey: queryKeys.candidates(null)});
        },
        onError: (error: unknown) => {
            showCandidateError(error, 'Failed to update candidate.');
        },
    });
};

export const useDeleteCandidate = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (candidate: Candidate & {election_id?: number}) => {
            await api.delete(`api/candidates/${candidate.id}/`);
            return candidate;
        },
        onSuccess: (_, variables) => {
            showSuccess('Candidate deleted successfully.');
            queryClient.invalidateQueries({
                queryKey: queryKeys.candidates(
                    variables.position,
                    variables.election_id ?? null,
                ),
            });
        },
        onError: (error: unknown) => {
            showError(
                (getApiErrorData(error) as {detail?: string} | null)?.detail ??
                    'Failed to delete candidate.',
            );
        },
    });
};
