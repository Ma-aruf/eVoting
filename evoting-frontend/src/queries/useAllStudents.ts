import { useQuery } from '@tanstack/react-query';
import api from '../apiConfig';
import {useAuth} from '../hooks/useAuth';

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

export const useAllStudents = () => {
  const {user} = useAuth();
  return useQuery({
    queryKey: ['students', 'all', user?.username ?? null],
    queryFn: async (): Promise<Student[]> => {
      const res = await api.get('api/students/');
      const data = res.data;

      if (Array.isArray(data)) {
        return data;
      } else if (Array.isArray(data.results)) {
        return data.results;
      }
      return [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - students don't change often
  });
};
