import {FiAlertCircle, FiCheckCircle, FiInfo, FiAlertTriangle, FiX} from 'react-icons/fi';
import type {ReactNode} from 'react';
import IconButton from './IconButton';

type AlertProps = {variant?: 'info' | 'success' | 'warning' | 'error'; title?: string; children?: ReactNode; onDismiss?: () => void; className?: string};
const icons = {info: FiInfo, success: FiCheckCircle, warning: FiAlertTriangle, error: FiAlertCircle};

export default function Alert({variant = 'info', title, children, onDismiss, className = ''}: AlertProps) {
    const Icon = icons[variant];
    return <div className={'ui-alert ui-alert--' + variant + (className ? ' ' + className : '')} role={variant === 'error' ? 'alert' : 'status'}>
        <Icon className="ui-alert-icon" aria-hidden="true"/><div className="ui-alert-content">{title && <strong>{title}</strong>}{children && <div>{children}</div>}</div>
        {onDismiss && <IconButton label="Dismiss message" icon={<FiX aria-hidden="true"/>} size="compact" onClick={onDismiss} className="ui-alert-dismiss"/>}
    </div>;
}
