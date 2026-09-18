import ConfirmationDialog from './ui/ConfirmationDialog';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'danger'}: ConfirmModalProps) {
    return <ConfirmationDialog open={isOpen} onClose={onClose} onConfirm={onConfirm} title={title} message={message}
        confirmText={confirmText} cancelText={cancelText} variant={type}/>;
}
