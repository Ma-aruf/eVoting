import {FiInbox} from 'react-icons/fi';
import type {ReactNode} from 'react';
type EmptyStateProps = {title?: string; message?: string; action?: ReactNode; icon?: ReactNode; className?: string};
export default function EmptyState({title = 'Nothing here yet', message, action, icon, className = ''}: EmptyStateProps) {
    return <div className={'ui-state ui-empty-state' + (className ? ' ' + className : '')}><div className="ui-state-icon-wrap">{icon ?? <FiInbox aria-hidden="true"/>}</div><strong>{title}</strong>{message && <p>{message}</p>}{action && <div className="ui-state-action">{action}</div>}</div>;
}
