import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../apiConfig';
import { queryKeys } from './queryKeys';
import { showError, showSuccess } from '../utils/toast';

export interface Candidate {
  id: number;
  student: number;
  student_name: string;
  position: number;
  photo_url: string;
  ballot_number: number;
}

export const useCandidates = (positionId: number | null) => {
  return useQuery({
    queryKey: queryKeys.candidates(positionId),
    queryFn: async (): Promise<Candidate[]> => {
      if (!positionId) return [];
      const res = await api.get('api/candidates/', {
        params: { position_id: positionId },
      });
      const data = res.data;
      if (Array.isArray(data)) {
        return data;
      } else if (Array.isArray(data.results)) {
        return data.results;
      }
      return [];
    },
    enabled: !!positionId,
    staleTime: 30 * 1000, // 30 seconds
    // Remove placeholderData to prevent stale data issues
  });
};

export const useCreateCandidate = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      student: number;
      position: number;
      photo_url?: string;
      ballot_number?: number;
    }) => {
      const res = await api.post('api/candidates/create/', data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      showSuccess('Candidate created successfully.');
      queryClient.invalidateQueries({ queryKey: queryKeys.candidates(variables.position) });
    },
    onError: (err: any) => {
      const detail = err.response?.data;
      
      // Handle DRF validation errors format (field-specific errors)
      if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        if (detail.ballot_number) {
          showError('Ballot number conflict: ' + detail.ballot_number[0]);
        } else if (detail.student) {
          showError('Candidate conflict: ' + detail.student[0]);
        } else if (detail.non_field_errors) {
          showError(detail.non_field_errors[0]);
        } else {
          // Fallback: show first available error
          const firstField = Object.keys(detail)[0];
          if (firstField && detail[firstField]) {
            showError(detail[firstField][0]);
          } else {
            showError('Validation failed. Please check your input.');
          }
        }
      } 
      // Handle string error messages
      else if (typeof detail === 'string') {
        if (detail.includes('ballot number')) {
          showError('Ballot number conflict: ' + detail);
        } else if (detail.includes('already') || detail.includes('candidate')) {
          showError('Candidate conflict: ' + detail);
        } else {
          showError(detail);
        }
      } 
      // Fallback error
      else {
        showError(detail || 'Failed to create candidate.');
      }
    },
  });
};

export const useUpdateCandidate = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: number;
      student: number;
      position: number;
      photo_url?: string;
      ballot_number?: number;
    }) => {
      const res = await api.put(`api/candidates/${id}/`, data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      showSuccess('Candidate updated successfully.');
      queryClient.invalidateQueries({ queryKey: queryKeys.candidates(variables.position) });
      // Also invalidate the old position in case position changed
      queryClient.invalidateQueries({ queryKey: queryKeys.candidates(null) });
    },
    onError: (err: any) => {
      const detail = err.response?.data;
      
      // Handle DRF validation errors format (field-specific errors)
      if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        if (detail.ballot_number) {
          showError('Ballot number conflict: ' + detail.ballot_number[0]);
        } else if (detail.student) {
          showError('Candidate conflict: ' + detail.student[0]);
        } else if (detail.non_field_errors) {
          showError(detail.non_field_errors[0]);
        } else {
          // Fallback: show first available error
          const firstField = Object.keys(detail)[0];
          if (firstField && detail[firstField]) {
            showError(detail[firstField][0]);
          } else {
            showError('Validation failed. Please check your input.');
          }
        }
      } 
      // Handle string error messages
      else if (typeof detail === 'string') {
        if (detail.includes('ballot number')) {
          showError('Ballot number conflict: ' + detail);
        } else if (detail.includes('already') || detail.includes('candidate')) {
          showError('Candidate conflict: ' + detail);
        } else {
          showError(detail);
        }
      } 
      // Fallback error
      else {
        showError(detail || 'Failed to update candidate.');
      }
    },
  });
};

export const useDeleteCandidate = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (candidate: Candidate) => {
      await api.delete(`api/candidates/${candidate.id}/`);
      return candidate;
    },
    onSuccess: (_, variables) => {
      showSuccess('Candidate deleted successfully.');
      queryClient.invalidateQueries({ queryKey: queryKeys.candidates(variables.position) });
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      showError(detail || 'Failed to delete candidate.');
    },
  });
};
