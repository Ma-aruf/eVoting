import {useQuery} from '@tanstack/react-query';
import api from '../apiClient';
import {useAuth} from '../hooks/useAuth';
import type {ElectionStatus, VoterLoginMode} from '../types/election';
import {queryKeys} from './queryKeys';

export interface OperationsMetrics {
    total_voters: number;
    active_voters: number;
    logged_in_voters: number;
    voters_voted: number;
    yet_to_activate: number;
    failed_logins: number;
    expired_sessions: number;
    sms_sent: number;
    sms_failed: number;
    sms_generated: number;
    turnout_percentage: number;
}

export interface ElectionOperations extends OperationsMetrics {
    id: number;
    name: string;
    year: number;
    status: ElectionStatus;
    voter_login_mode: VoterLoginMode;
    start_time: string;
    end_time: string;
}

export interface OperationsDashboard {
    totals: OperationsMetrics;
    elections: ElectionOperations[];
}

export function useOperationsDashboard() {
    const {user} = useAuth();
    return useQuery({
        queryKey: queryKeys.dashboardOperations(user?.username, user?.role, user?.assignedElection?.id),
        queryFn: async () => {
            const response = await api.get<OperationsDashboard>('api/dashboard/operations/');
            return response.data;
        },
        enabled: Boolean(user),
        staleTime: 15_000,
        refetchInterval: 30_000,
    });
}
