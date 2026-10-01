import type {SmsVoterStatusRow, VoterRecoveryStatusRow} from '../../../queries/useSmsPins';

type ApiError = {
    response?: {
        data?: {
            detail?: string;
        };
    };
};

export function errorMessage(error: unknown) {
    return (
        (error as ApiError)?.response?.data?.detail ||
        'Activation failed. Please try again.'
    );
}

export const smsStatusLabels: Record<SmsVoterStatusRow['status'], string> = {
    not_sent: 'Not sent',
    sent: 'PIN active',
    generated: 'Generated manually',
    expired: 'PIN expired',
    failed: 'Failed',
    missing_phone: 'Missing phone',
    voted: 'Voted',
};

export function formatSmsDate(value: string | null) {
    if (!value) return '\u2014';
    return new Intl.DateTimeFormat('en-UK', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(value));
}

export function canSendSmsToVoter(row: SmsVoterStatusRow) {
    return row.can_resend || row.status === 'not_sent' || row.status === 'expired' || row.status === 'failed';
}

export function smsVoterActionLabel(row: SmsVoterStatusRow) {
    return row.status === 'not_sent' ? 'Send PIN' : 'Resend';
}

export function canGenerateSmsPinForVoter(row: SmsVoterStatusRow) {
    return row.status === 'not_sent' || row.status === 'expired' || row.status === 'failed' || row.status === 'missing_phone';
}

export function recoveryStateLabel(row: VoterRecoveryStatusRow) {
    return row.state.replaceAll('_', ' ').replace(/^\w/, value => value.toUpperCase());
}
