import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import api from '../apiClient';
import {getApiErrorDetail} from '../utils/apiErrors';
import {queryKeys} from './queryKeys';
import {showError} from '../utils/toast';

export interface SmsPinSendResponse {
    detail: string;
    total: number;
    eligible: number;
    sent: number;
    failed: number;
    missing_phone: number;
    skipped_valid_pin: number;
    already_voted: number;
}

export type SmsVoterStatus = 'not_sent' | 'sent' | 'generated' | 'expired' | 'failed' | 'missing_phone' | 'voted';

export interface VoterRecoveryStatusRow {
    id: number;
    student_id: string;
    full_name: string;
    phone_number: string;
    has_voted: boolean;
    is_active: boolean;
    state: string;
    reason: string;
    can_invalidate: boolean;
    last_attempt_at: string | null;
    last_error_category: string;
}

export const useVoterRecoveryStatus = (electionId: number | null, enabled = true) => useQuery({
    queryKey: ['voter-recovery-status', electionId],
    queryFn: async (): Promise<VoterRecoveryStatusRow[]> => {
        const response = await api.get('api/students/recovery-status/', {
            params: {election_id: electionId},
        });
        return response.data.students ?? [];
    },
    enabled: enabled && electionId !== null,
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000,
});

export interface SmsVoterStatusRow {
    id: number;
    student_id: string;
    full_name: string;
    phone_number: string;
    has_voted: boolean;
    status: SmsVoterStatus;
    can_resend: boolean;
    last_attempt_status: string | null;
    last_error_category: string;
    last_attempt_at: string | null;
    pin_created_at: string | null;
    pin_expires_at: string | null;
}

export const useSmsVoterStatus = (electionId: number | null, enabled = true) =>
    useQuery({
        queryKey: queryKeys.smsStatus(electionId),
        queryFn: async (): Promise<SmsVoterStatusRow[]> => {
            const response = await api.get('api/students/sms-status/', {
                params: {election_id: electionId},
            });
            return response.data.students ?? [];
        },
        enabled: enabled && electionId !== null,
        staleTime: 5 * 1000,
        refetchInterval: 10 * 1000,
    });

export const useSendSmsPins = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (electionId: number): Promise<SmsPinSendResponse> => {
            const response = await api.post('api/students/send-sms-pins/', {
                election_id: electionId,
            });
            return response.data;
        },
        onSuccess: (_data, electionId) => {
            queryClient.invalidateQueries({queryKey: queryKeys.students(electionId)});
            queryClient.invalidateQueries({queryKey: queryKeys.smsStatus(electionId)});
        },
        onError: (error: unknown) => {
            showError(getApiErrorDetail(error) ?? 'SMS PIN delivery failed.');
        },
    });
};

export interface SmsPinGenerateResponse {
    detail: string;
    status: string;
    voting_pin?: string | null;
}

export const useGenerateSmsPin = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {electionId: number; studentId: number}): Promise<SmsPinGenerateResponse> => {
            const response = await api.post('api/students/generate-sms-pin/', {
                election_id: data.electionId,
                student_id: data.studentId,
            });
            return response.data;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({queryKey: queryKeys.smsStatus(variables.electionId)});
            queryClient.invalidateQueries({queryKey: queryKeys.students(variables.electionId)});
        },
        onError: (error: unknown) => {
            showError(getApiErrorDetail(error) ?? 'Manual PIN generation failed.');
        },
    });
};
export const useResendSmsPin = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {electionId: number; studentId: number}) => {
            const response = await api.post('api/students/resend-sms-pin/', {
                election_id: data.electionId,
                student_id: data.studentId,
            });
            return response.data;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({queryKey: queryKeys.smsStatus(variables.electionId)});
            queryClient.invalidateQueries({queryKey: queryKeys.students(variables.electionId)});
        },
        onError: (error: unknown) => {
            showError(getApiErrorDetail(error) ?? 'SMS PIN resend failed.');
        },
    });
};

