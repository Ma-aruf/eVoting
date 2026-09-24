export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getApiErrorData(error: unknown): unknown {
    if (!isRecord(error) || !isRecord(error.response)) {
        return null;
    }

    return error.response.data ?? null;
}

export function getApiErrorDetail(error: unknown): string | null {
    const data = getApiErrorData(error);

    if (typeof data === 'string') {
        return data;
    }

    if (isRecord(data) && typeof data.detail === 'string') {
        return data.detail;
    }

    if (isRecord(data) && Array.isArray(data.non_field_errors)) {
        const message = data.non_field_errors[0];
        return typeof message === 'string' ? message : null;
    }

    return null;
}

export function getFirstFieldError(data: Record<string, unknown>): string | null {
    for (const value of Object.values(data)) {
        if (Array.isArray(value) && typeof value[0] === 'string') {
            return value[0];
        }

        if (typeof value === 'string') {
            return value;
        }
    }

    return null;
}
