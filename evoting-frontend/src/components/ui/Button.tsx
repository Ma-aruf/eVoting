import {forwardRef, type ButtonHTMLAttributes, type ReactNode} from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
    size?: 'normal' | 'compact';
    loading?: boolean;
    leadingIcon?: ReactNode;
    trailingIcon?: ReactNode;
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
    variant = 'primary', size = 'normal', loading = false, leadingIcon, trailingIcon, className = '', children, disabled, ...props
}, ref) {
    return <button ref={ref} className={'ui-button ui-button--' + variant + ' ui-button--' + size + (className ? ' ' + className : '')}
        disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
        {loading && <span className="ui-spinner ui-spinner--button" aria-hidden="true"/>}
        {!loading && leadingIcon}<span>{loading ? 'Loading...' : children}</span>{!loading && trailingIcon}
    </button>;
});

export default Button;
