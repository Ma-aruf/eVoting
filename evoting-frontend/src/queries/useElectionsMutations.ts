import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../apiClient';
import { queryKeys } from './queryKeys';
import { showError, showSuccess } from '../utils/toast';
import type {
  Election,
  ElectionCreatePayload,
  ElectionManagementResponse,
  ElectionScheduleUpdatePayload,
} from '../types/election';

export type { Election } from '../types/election';

export const useCreateElection = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: ElectionCreatePayload): Promise<Election> => {
      const res = await api.post('api/elections/create/', data);
      return res.data;
    },
    onSuccess: () => {
      showSuccess('Election created successfully.');
      queryClient.invalidateQueries({ queryKey: queryKeys.elections });
    },
    onError: (err: unknown) => {
      const detail = (err as {response?: {data?: {detail?: string}}}).response?.data?.detail;
      showError(detail || 'Failed to create election.');
    },
  });
};

export const useUpdateElectionSchedule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({electionId, ...payload}: ElectionScheduleUpdatePayload & {electionId: number}): Promise<ElectionManagementResponse> => {
      const response = await api.patch(`api/elections/${electionId}/schedule/`, payload);
      return response.data;
    },
    onSuccess: response => {
      showSuccess(response.detail || 'Election schedule updated.');
      queryClient.invalidateQueries({queryKey: queryKeys.elections});
    },
    onError: (error: unknown) => {
      const detail = (error as {response?: {data?: {detail?: string}}}).response?.data?.detail;
      showError(detail || 'Failed to update election schedule.');
    },
  });
};
