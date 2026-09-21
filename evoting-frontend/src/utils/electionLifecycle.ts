import type {ElectionStatus} from '../types/election';

export type StatusBadgeVariant = 'neutral' | 'primary' | 'success' | 'warning';

const STATUS_PRESENTATION: Record<ElectionStatus, {label: string; variant: StatusBadgeVariant}> = {
    scheduled: {label: 'Scheduled', variant: 'primary'},
    open: {label: 'Voting Open', variant: 'success'},
    paused: {label: 'Paused', variant: 'warning'},
    ended: {label: 'Ended', variant: 'neutral'},
};

export function electionStatusPresentation(status: unknown) {
    if (typeof status !== 'string' || !Object.prototype.hasOwnProperty.call(STATUS_PRESENTATION, status)) {
        return {label: 'Status unavailable', variant: 'neutral' as const};
    }

    return STATUS_PRESENTATION[status as ElectionStatus];
}

export function voterLifecycleMessage(status: unknown) {
    switch (status) {
        case 'scheduled':
            return 'Voting has not started yet.';
        case 'paused':
            return 'Voting is currently paused. Please try again later.';
        case 'ended':
            return 'Voting has ended.';
        default:
            return 'Voting is not currently available.';
    }
}

export function voterLifecycleMessageFromDetail(detail: unknown): string | null {
    if (typeof detail !== 'string') return null;
    const normalized = detail.toLowerCase();
    if (normalized.includes('not started yet')) return voterLifecycleMessage('scheduled');
    if (normalized.includes('paused')) return voterLifecycleMessage('paused');
    if (normalized.includes('voting has ended')) return voterLifecycleMessage('ended');
    return null;
}
