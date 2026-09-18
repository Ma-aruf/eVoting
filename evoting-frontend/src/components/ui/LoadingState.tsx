import {FiLoader} from 'react-icons/fi';
type LoadingStateProps = {title?: string; message?: string; inline?: boolean; className?: string};
export default function LoadingState({title = 'Loading', message = 'Please wait...', inline = false, className = ''}: LoadingStateProps) {
    return <div className={'ui-state ui-loading-state' + (inline ? ' ui-state--inline' : '') + (className ? ' ' + className : '')} role="status" aria-live="polite">
        <FiLoader className="ui-state-icon ui-spin" aria-hidden="true"/><div><strong>{title}</strong>{message && <p>{message}</p>}</div>
    </div>;
}

export {LoadingState};
