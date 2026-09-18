import {useState} from 'react';
import Button from './Button';
import Modal from './Modal';
import Alert from './Alert';

type ConfirmationDialogProps = {open: boolean; onClose: () => void; onConfirm: () => void | Promise<void>; title: string; message: string; confirmText?: string; cancelText?: string; variant?: 'danger' | 'warning' | 'info'};

export default function ConfirmationDialog({open, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', variant = 'danger'}: ConfirmationDialogProps) {
    const [pending, setPending] = useState(false);
    const handleConfirm = async () => { setPending(true); try { await onConfirm(); onClose(); } finally { setPending(false); } };
    return <Modal open={open} onClose={pending ? () => undefined : onClose} title={title} closeOnBackdrop={!pending}>
        <Alert variant={variant === 'danger' ? 'error' : variant} title="Please confirm">{message}</Alert>
        <div className="ui-modal-actions"><Button variant="quiet" onClick={onClose} disabled={pending}>{cancelText}</Button><Button variant={variant === 'danger' ? 'danger' : 'primary'} loading={pending} onClick={() => void handleConfirm()}>{confirmText}</Button></div>
    </Modal>;
}
