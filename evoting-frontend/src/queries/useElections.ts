import { useQuery } from '@tanstack/react-query';
import api from '../apiConfig';
import { queryKeys } from './queryKeys';
import {useAuth} from '../hooks/useAuth';

export interface Election {
  id: number;
  name: string;
  year: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export const useElections = () => {
  const {user} = useAuth();
  return useQuery({
    queryKey: [...queryKeys.elections, user?.username ?? null, user?.role, user?.assignedElection?.id ?? null],
    queryFn: async (): Promise<Election[]> => {
      const res = await api.get('api/elections/');
      const elections: Election[] = Array.isArray(res.data) ? res.data : (res.data.results || []);
      return user?.role === 'superuser'
        ? elections
        : elections.filter(election => election.id === user?.assignedElection?.id);
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};
