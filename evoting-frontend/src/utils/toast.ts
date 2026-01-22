import { toast } from 'react-toastify';

const baseOptions = {
    position: 'top-right' as const,
    autoClose: 4000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
};

export const showSuccess = (message: string) => {
    toast.success(message, {
        ...baseOptions,
        style: {
            background: '#0891b2',
            color: '#ffffff',
        },
    });
};

export const showError = (message: string) => {
    toast.error(message, {
        ...baseOptions,
        style: {
            background: '#1e3a5f',
            color: '#ffffff',
        },
    });
};

export const showInfo = (message: string) => {
    toast.info(message, {
        ...baseOptions,
        style: {
            background: '#1e3a5f',
            color: '#ffffff',
        },
    });
};

export const showWarning = (message: string) => {
    toast.warning(message, {
        ...baseOptions,
        style: {
            background: '#ca8a04',
            color: '#ffffff',
        },
    });
};
