import { toast } from 'react-toastify';

const baseOptions = {
    position: 'top-right' as const,
    autoClose: 4000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
};

const baseStyle = {
    borderRadius: '0.5rem',
    boxShadow: '0 3px 12px rgba(16, 45, 86, 0.12)',
    fontFamily: 'Roboto, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: '0.8rem',
    fontWeight: '500',
};

export const showSuccess = (message: string) => {
    toast.success(message, {
        ...baseOptions,
        style: {
            ...baseStyle,
            background: '#178a55',
            color: '#ffffff',
            border: '1px solid #146a43',
        },
    });
};

export const showError = (message: string) => {
    toast.error(message, {
        ...baseOptions,
        style: {
            ...baseStyle,
            background: '#c62828',
            color: '#ffffff',
            border: '1px solid #9e1f1f',
        },
    });
};

export const showInfo = (message: string) => {
    toast.info(message, {
        ...baseOptions,
        style: {
            ...baseStyle,
            background: '#1d4f91',
            color: '#ffffff',
            border: '1px solid #163d73',
        },
    });
};

export const showWarning = (message: string) => {
    toast.warning(message, {
        ...baseOptions,
        style: {
            ...baseStyle,
            background: '#a96700',
            color: '#ffffff',
            border: '1px solid #8a5500',
        },
    });
};
