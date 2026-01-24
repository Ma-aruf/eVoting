import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../apiConfig';
import { queryKeys } from './queryKeys';
import { showError, showSuccess } from '../utils/toast';

export interface Student {
  id: number;
  student_id: string;
  full_name: string;
  class_name: string;
  has_voted: boolean;
  is_active: boolean;
  election?: {
    id: number;
    name: string;
    year: number;
  };
}

export const useToggleStudentActivation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      student_id: string;
      is_active: boolean;
    }) => {
      const res = await api.post('api/students/activate/', data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      const action = variables.is_active ? 'activated' : 'deactivated';
      showSuccess(`Student ${action} successfully`);
      
      // Invalidate all student queries to refresh lists
      queryClient.invalidateQueries({ queryKey: queryKeys.students(null) });
      
      // Also invalidate activation queries
      queryClient.invalidateQueries({ queryKey: queryKeys.activations(null) });
    },
    onError: (err: any, variables) => {
      const action = variables.is_active ? 'Activation' : 'Deactivation';
      const detail = err.response?.data?.detail;
      showError(detail || `${action} failed. Please try again.`);
    },
  });
};
