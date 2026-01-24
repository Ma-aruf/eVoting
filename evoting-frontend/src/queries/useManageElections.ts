import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import api from '../apiConfig';
import {queryKeys} from './queryKeys';
import {showError, showSuccess} from '../utils/toast';

export interface Election {
    id: number;
    name: string;
    year: number;
    start_time: string;
    end_time: string;
    is_active: boolean;
}

export const useManageElections = () => {
    return useQuery({
        queryKey: queryKeys.elections,
        queryFn: async (): Promise<Election[]> => {
            const res = await api.get('api/elections/manage/');
            const data = res.data;
            return Array.isArray(data) ? data : (data.results || []);
        },
        staleTime: 30 * 1000, // 30 seconds
    });
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
