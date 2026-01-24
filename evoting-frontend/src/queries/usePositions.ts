import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../apiConfig';
import { queryKeys } from './queryKeys';
import { showError, showSuccess } from '../utils/toast';

export interface Position {
  id: number;
  name: string;
  display_order: number;
  election: number;
}

export const usePositions = (electionId: number | null) => {
  return useQuery({
    queryKey: queryKeys.positions(electionId),
    queryFn: async (): Promise<Position[]> => {
      if (!electionId) return [];
      const res = await api.get('api/positions/', {
        params: { election_id: electionId },
      });
      const data = res.data;
      if (Array.isArray(data)) {
        return data;
      } else if (Array.isArray(data.results)) {
        return data.results;
      }
      return [];
    },
    enabled: !!electionId,
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: (previousData) => previousData,
  });
};

export const useCreatePosition = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      name: string;
      display_order: number;
      election: number;
    }) => {
      const res = await api.post('api/positions/', data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      showSuccess('Position created successfully.');
      queryClient.invalidateQueries({ queryKey: queryKeys.positions(variables.election) });
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      showError(detail || 'Failed to create position.');
    },
  });
};

export const useUpdatePosition = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: number;
      name: string;
      display_order: number;
    }) => {
      const res = await api.patch(`api/positions/${id}/`, data);
      return res.data;
    },
    onSuccess: () => {
      showSuccess('Position updated successfully.');
      queryClient.invalidateQueries({ queryKey: queryKeys.positions(null) }); // Invalidate all since we don't know the election
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      showError(detail || 'Failed to update position.');
    },
  });
};

export const useDeletePosition = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (position: Position) => {
      await api.delete(`api/positions/${position.id}/`);
      return position;
    },
    onSuccess: () => {
      showSuccess('Position deleted successfully.');
      queryClient.invalidateQueries({ queryKey: queryKeys.positions(null) }); // Invalidate all since we don't know the election
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      showError(detail || 'Failed to delete position.');
    },
  });
};
