import {getApiErrorData, getApiErrorDetail, getFirstFieldError, isRecord} from './apiErrors';

export function formatElectionDateTime(value: string): string {
    return new Date(value).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function toDateTimeLocalValue(value: string): string {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16);
}

export function getElectionMutationMessage(error: unknown, fallback: string): string {
    const detail = getApiErrorDetail(error);
    if (detail) {
        return detail;
    }

    const data = getApiErrorData(error);
    return isRecord(data) ? getFirstFieldError(data) ?? fallback : fallback;
}
