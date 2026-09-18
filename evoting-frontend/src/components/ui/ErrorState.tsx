import {FiAlertCircle} from 'react-icons/fi';
import type {ReactNode} from 'react';
type ErrorStateProps = {title?: string; message?: string; action?: ReactNode; className?: string};
export default function ErrorState({title = 'Something went wrong', message = 'We could not load this information.', action, className = ''}: ErrorStateProps) {
    return <div className={'ui-state ui-error-state' + (className ? ' ' + className : '')} role="alert"><div className="ui-state-icon-wrap"><FiAlertCircle aria-hidden="true"/></div><strong>{title}</strong><p>{message}</p>{action && <div className="ui-state-action">{action}</div>}</div>;
}
