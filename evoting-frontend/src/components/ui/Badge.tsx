import type {ReactNode} from 'react';
type BadgeProps = {variant?: 'neutral' | 'primary' | 'success' | 'warning' | 'error'; children: ReactNode; className?: string};
export default function Badge({variant = 'neutral', children, className = ''}: BadgeProps) {
    return <span className={'ui-badge ui-badge--' + variant + (className ? ' ' + className : '')}>{children}</span>;
}
