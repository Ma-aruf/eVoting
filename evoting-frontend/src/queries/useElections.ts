import { useQuery } from '@tanstack/react-query';
import api from '../apiConfig';
import { queryKeys } from './queryKeys';

export interface Election {
  id: number;
  name: string;
  year: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export const useElections = () => {
  return useQuery({
    queryKey: queryKeys.elections,
    queryFn: async (): Promise<Election[]> => {
      const res = await api.get('api/elections/');
      return Array.isArray(res.data) ? res.data : (res.data.results || []);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};
