import {useMutation, useQueryClient} from '@tanstack/react-query';
import api from '../apiClient';
import {queryKeys} from './queryKeys';
import {showError, showSuccess} from '../utils/toast';
import {useElections} from './useElections';
import type {
    ElectionEndTimeExtensionPayload,
    ElectionManagementResponse,
} from '../types/election';

export type { Election } from '../types/election';

export const useManageElections = (options?: {refetchInterval?: number | false}) => {
    return useElections(options);
};

export const useToggleElection = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            election_id: number;
            voting_enabled: boolean;
        }): Promise<ElectionManagementResponse> => {
            const res = await api.patch('api/elections/manage/', data);
            return res.data;
        },
        onSuccess: (response) => {
            showSuccess(response.detail);
            queryClient.invalidateQueries({queryKey: queryKeys.elections});
        },
        onError: (err: unknown) => {
            const detail = (err as {response?: {data?: {detail?: string}}}).response?.data?.detail;
            showError(detail || 'Failed to update election status.');
        },
    });
};

export const useExtendElection = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {electionId: number} & ElectionEndTimeExtensionPayload): Promise<ElectionManagementResponse> => {
            const {electionId, ...payload} = data;
            const response = await api.post(`api/elections/${electionId}/extend/`, payload);
            return response.data;
        },
        onSuccess: response => {
            showSuccess(response.detail);
            queryClient.invalidateQueries({queryKey: queryKeys.elections});
        },
        onError: error => {
            const detail = (error as {response?: {data?: {detail?: string}}}).response?.data?.detail;
            showError(detail || 'The election closing time could not be extended.');
        },
    });
};
