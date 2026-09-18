import {useQueries, useQuery} from '@tanstack/react-query';
import api from '../apiConfig';
import { queryKeys } from './queryKeys';

export interface DashboardStats {
  total_students: number;
  active_students: number;
  voted_students: number;
  pending_activations: number;
  total_positions: number;
  total_candidates: number;
}

export const useDashboardStats = (electionId: number | null) => {
  return useQuery({
    queryKey: queryKeys.dashboard(electionId),
    queryFn: async (): Promise<DashboardStats> => {
      if (!electionId) {
        // Return empty stats when no election is selected
        return {
          total_students: 0,
          active_students: 0,
          voted_students: 0,
          pending_activations: 0,
          total_positions: 0,
          total_candidates: 0,
        };
      }

      // Fetch stats for the selected election
      const [studentsRes, positionsRes] = await Promise.all([
        api.get(`api/students/?election_id=${electionId}`),
        api.get(`api/positions/?election_id=${electionId}`),
      ]);

      const students = Array.isArray(studentsRes.data) 
        ? studentsRes.data 
        : (studentsRes.data.results || []);
      
      const positions = Array.isArray(positionsRes.data)
        ? positionsRes.data
        : (positionsRes.data.results || []);

      // Calculate stats
      const total_students = students.length;
      const active_students = students.filter((student: {is_active?: boolean}) => student.is_active).length;
      const voted_students = students.filter((student: {has_voted?: boolean}) => student.has_voted).length;
      const pending_activations = total_students - active_students;
      const total_positions = positions.length;

      // For candidates, we'd need to fetch from all positions or create a dedicated endpoint
      // For now, we'll return 0 and can implement this later
      const total_candidates = 0;

      return {
        total_students,
        active_students,
        voted_students,
        pending_activations,
        total_positions,
        total_candidates,
      };
    },
    enabled: !!electionId,
    staleTime: 15 * 1000, // 15 seconds for dashboard stats
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });
};

export const useDashboardStatsForElections = (electionIds: number[]) => {
  const queries = useQueries({
    queries: electionIds.map((electionId) => ({
      queryKey: queryKeys.dashboard(electionId),
      queryFn: async (): Promise<DashboardStats> => {
        const [studentsRes, positionsRes] = await Promise.all([
          api.get(`api/students/?election_id=${electionId}`),
          api.get(`api/positions/?election_id=${electionId}`),
        ]);
        const students = Array.isArray(studentsRes.data) ? studentsRes.data : (studentsRes.data.results || []);
        const positions = Array.isArray(positionsRes.data) ? positionsRes.data : (positionsRes.data.results || []);
        const active_students = students.filter((student: {is_active?: boolean}) => student.is_active).length;
        return {
          total_students: students.length,
          active_students,
          voted_students: students.filter((student: {has_voted?: boolean}) => student.has_voted).length,
          pending_activations: students.length - active_students,
          total_positions: positions.length,
          total_candidates: 0,
        };
      },
      enabled: electionIds.length > 0,
      staleTime: 15 * 1000,
      refetchInterval: 30 * 1000,
    })),
  });

  return {
    queries,
    statsByElectionId: new Map(electionIds.map((electionId, index) => [electionId, queries[index].data])),
    isLoading: queries.some(query => query.isLoading),
    hasError: queries.some(query => query.isError),
  };
};
