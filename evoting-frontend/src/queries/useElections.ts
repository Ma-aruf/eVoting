import { useQuery } from '@tanstack/react-query';
import type {AxiosResponse} from 'axios';
import api from '../apiClient';
import { useAuth } from '../hooks/useAuth';
import type { Election } from '../types/election';
import { queryKeys } from './queryKeys';

type ElectionsPage = { results?: Election[]; next?: string | null };

export type { Election } from '../types/election';

export const useElections = (options?: { refetchInterval?: number | false }) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...queryKeys.elections, user?.username ?? null, user?.role, user?.assignedElection?.id ?? null],
    queryFn: async (): Promise<Election[]> => {
      const elections: Election[] = [];
        let nextUrl: string | null = 'api/elections/';

      while (nextUrl) {
        const response: AxiosResponse<ElectionsPage | Election[]> = await api.get<ElectionsPage | Election[]>(nextUrl);
        if (Array.isArray(response.data)) {
          elections.push(...response.data);
          break;
        }
        elections.push(...(response.data.results ?? []));
        nextUrl = response.data.next ?? null;
      }

      return user?.role === 'superuser'
        ? elections
        : elections.filter(election => election.id === user?.assignedElection?.id);
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    refetchInterval: options?.refetchInterval ?? false,
  });
};
