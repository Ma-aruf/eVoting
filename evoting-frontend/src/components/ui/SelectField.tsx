
import {
    forwardRef,
    type SelectHTMLAttributes,
} from 'react';

import {FiChevronDown} from 'react-icons/fi';

const SelectField = forwardRef<
    HTMLSelectElement,
    SelectHTMLAttributes<HTMLSelectElement>
>(
    function SelectField(
        {
            className = '',
            children,
            ...props
        },
        ref
    ) {
        return (
            <div className="ui-select-wrap">
                <select
                    ref={ref}
                    className={
                        'ui-control ui-select' +
                        (className ? ' ' + className : '')
                    }
                    {...props}
                >
                    {children}
                </select>

                <FiChevronDown
                    className="ui-select-icon"
                    aria-hidden="true"
                />
            </div>
        );
    }
);

export default SelectField;
