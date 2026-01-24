import { useQuery } from '@tanstack/react-query';
import api from '../apiConfig';

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
  return useQuery({
    queryKey: ['students', 'all'], // Separate key for all students
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
