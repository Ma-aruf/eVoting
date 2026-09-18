
import {
    type ButtonHTMLAttributes,
    forwardRef,
    type ReactNode,
} from 'react';

type IconButtonProps = Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'children'
> & {
    label: string;
    icon: ReactNode;
    size?: 'normal' | 'compact';
    variant?: 'quiet' | 'secondary' | 'danger' | 'success';
};

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    function IconButton(
        {
            label,
            icon,
            size = 'normal',
            variant = 'quiet',
            className = '',
            ...props
        },
        ref
    ) {
        return (
            <button
                ref={ref}
                type="button"
                className={
                    'ui-icon-button ui-icon-button--' +
                    size +
                    ' ui-icon-button--' +
                    variant +
                    (className ? ' ' + className : '')
                }
                aria-label={label}
                title={label}
                {...props}
            >
                {icon}
            </button>
        );
    }
);

export default IconButton;
