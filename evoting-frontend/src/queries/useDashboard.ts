import {useQueries, useQuery} from '@tanstack/react-query';
import api from '../apiClient';
import {queryKeys} from './queryKeys';

export interface DashboardStats {
    total_students: number;
    active_students: number;
    voted_students: number;
    pending_activations: number;
    total_positions: number;
    total_candidates: number;
}

interface StudentSummary {
    is_active?: boolean;
    has_voted?: boolean;
}

type ApiListResponse<T> = T[] | {results?: T[]};

const EMPTY_STATS: DashboardStats = {
    total_students: 0,
    active_students: 0,
    voted_students: 0,
    pending_activations: 0,
    total_positions: 0,
    total_candidates: 0,
};

function getList<T>(data: ApiListResponse<T>): T[] {
    return Array.isArray(data) ? data : data.results ?? [];
}

async function fetchDashboardStats(electionId: number): Promise<DashboardStats> {
    const [studentsResponse, positionsResponse] = await Promise.all([
        api.get<ApiListResponse<StudentSummary>>(
            `api/students/?election_id=${electionId}`,
        ),
        api.get<ApiListResponse<unknown>>(
            `api/positions/?election_id=${electionId}`,
        ),
    ]);

    const students = getList(studentsResponse.data);
    const positions = getList(positionsResponse.data);
    const activeStudents = students.filter(student => student.is_active).length;

    return {
        total_students: students.length,
        active_students: activeStudents,
        voted_students: students.filter(student => student.has_voted).length,
        pending_activations: students.length - activeStudents,
        total_positions: positions.length,
        total_candidates: 0,
    };
}

export const useDashboardStats = (electionId: number | null) =>
    useQuery({
        queryKey: queryKeys.dashboard(electionId),
        queryFn: () => electionId ? fetchDashboardStats(electionId) : EMPTY_STATS,
        enabled: electionId !== null,
        staleTime: 15 * 1000,
        refetchInterval: 30 * 1000,
    });

export const useDashboardStatsForElections = (electionIds: number[]) => {
    const queries = useQueries({
        queries: electionIds.map(electionId => ({
            queryKey: queryKeys.dashboard(electionId),
            queryFn: () => fetchDashboardStats(electionId),
            enabled: true,
            staleTime: 15 * 1000,
            refetchInterval: 30 * 1000,
        })),
    });

    return {
        queries,
        statsByElectionId: new Map(
            electionIds.map((electionId, index) => [electionId, queries[index].data]),
        ),
        isLoading: queries.some(query => query.isLoading),
        hasError: queries.some(query => query.isError),
    };
};
