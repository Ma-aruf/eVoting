import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../apiConfig';
import { queryKeys } from './queryKeys';
import { showError, showSuccess } from '../utils/toast';

export interface Election {
  id: number;
  name: string;
  year: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export const useCreateElection = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      name: string;
      year: number;
      start_time: string;
      end_time: string;
      is_active: boolean;
    }) => {
      const res = await api.post('api/elections/create/', data);
      return res.data;
    },
    onSuccess: () => {
      showSuccess('Election created successfully.');
      queryClient.invalidateQueries({ queryKey: queryKeys.elections });
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      showError(detail || 'Failed to create election.');
    },
  });
};
