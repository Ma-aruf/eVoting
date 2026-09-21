export type ElectionStatus = 'scheduled' | 'open' | 'paused' | 'ended';

export interface ElectionLifecycleFields {
    voting_enabled: boolean;
    status: ElectionStatus;
    voting_open: boolean;
    candidate_changes_locked: boolean;
}

export interface Election extends ElectionLifecycleFields {
    id: number;
    name: string;
    year: number;
    start_time: string;
    end_time: string;
    ballot_ready: boolean;
}

export interface AssignedElectionLifecycle {
    id: number;
    name: string;
    year: number;
    voting_enabled: boolean;
    status: ElectionStatus;
    voting_open: boolean;
    candidate_changes_locked?: boolean;
}

export interface VoterElection {
    id: number;
    name: string;
    year: number;
    voting_enabled: boolean;
    status: ElectionStatus;
    voting_open: boolean;
}

export interface ElectionCreatePayload {
    name: string;
    year: number;
    start_time: string;
    end_time: string;
    voting_enabled: boolean;
}

export interface ElectionManagementResponse extends Election {
    detail: string;
}

export interface ElectionEndTimeExtensionPayload {
    end_time: string;
    reason: string;
}

export interface ElectionScheduleUpdatePayload {
    start_time: string;
    end_time: string;
}

export interface VoterLoginResponse {
    token: string;
    can_vote_now: boolean;
    student: {
        id: number;
        student_id: string;
        full_name: string;
        class_name: string;
    };
    election: VoterElection;
}

export interface ElectionResultsLifecycle {
    voting_enabled: boolean;
    status: ElectionStatus;
    voting_open: boolean;
    candidate_changes_locked: boolean;
}

export function isElectionStatus(value: unknown): value is ElectionStatus {
    return value === 'scheduled' || value === 'open' || value === 'paused' || value === 'ended';
}
