
import {
    type ReactNode,
    type RefObject,
    useEffect,
    useId,
    useRef,
} from 'react';

import {FiX} from 'react-icons/fi';
import IconButton from './IconButton';

type ModalProps = {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: ReactNode;
    closeOnBackdrop?: boolean;
    initialFocusRef?: RefObject<HTMLElement | null>;
    className?: string;
};

export default function Modal({
    open,
    onClose,
    title,
    description,
    children,
    closeOnBackdrop = true,
    initialFocusRef,
    className = '',
}: ModalProps) {
    const titleId = useId();
    const descriptionId = useId();

    const dialogRef = useRef<HTMLDivElement>(null);
    const restoreRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) return;

        restoreRef.current = document.activeElement as HTMLElement | null;

        const dialog = dialogRef.current;

        initialFocusRef?.current?.focus();

        if (!initialFocusRef?.current) {
            dialog
                ?.querySelector<HTMLElement>(
                    'button, input, select, textarea, [tabindex="0"]'
                )
                ?.focus();
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }

            if (event.key !== 'Tab' || !dialog) return;

            const elements = Array.from(
                dialog.querySelectorAll<HTMLElement>(
                    'button, input, select, textarea, [tabindex="0"]'
                )
            ).filter(element => !element.hasAttribute('disabled'));

            if (!elements.length) return;

            const first = elements[0];
            const last = elements[elements.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }

            if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;

            document.removeEventListener('keydown', handleKeyDown);

            requestAnimationFrame(() => restoreRef.current?.focus());
        };
    }, [initialFocusRef, onClose, open]);

    if (!open) return null;

    return (
        <div
            className="ui-modal-layer"
            role="presentation"
            onMouseDown={event => {
                if (
                    closeOnBackdrop &&
                    event.target === event.currentTarget
                ) {
                    onClose();
                }
            }}
        >
            <div
                ref={dialogRef}
                className={'ui-modal' + (className ? ' ' + className : '')}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descriptionId : undefined}
            >
                <div className="ui-modal-header">
                    <div>
                        <h2 id={titleId}>
                            {title}
                        </h2>

                        {description && (
                            <p id={descriptionId}>
                                {description}
                            </p>
                        )}
                    </div>

                    <IconButton
                        label="Close dialog"
                        icon={<FiX aria-hidden="true" />}
                        onClick={onClose}
                    />
                </div>

                <div className="ui-modal-body">
                    {children}
                </div>
            </div>
        </div>
    );
}
