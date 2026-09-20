import {useMutation, useQueryClient} from '@tanstack/react-query';
import api from '../apiConfig';
import {queryKeys} from './queryKeys';
import {showError, showSuccess} from '../utils/toast';
import {useElections} from './useElections';

export interface Election {
    id: number;
    name: string;
    year: number;
    start_time: string;
    end_time: string;
    is_active: boolean;
}

export const useManageElections = () => {
    return useElections();
};

export const useToggleElection = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            election_id: number;
            is_active: boolean;
        }) => {
            const res = await api.patch('api/elections/manage/', data);
            return res.data;
        },
        onSuccess: (_, variables) => {
            const action = variables.is_active ? 'activated' : 'deactivated';
            showSuccess(`Election ${action} successfully.`);
            queryClient.invalidateQueries({queryKey: queryKeys.elections});
        },
        onError: (err: any) => {
            const detail = err.response?.data?.detail;
            showError(detail || 'Failed to update election status.');
        },
    });
};
