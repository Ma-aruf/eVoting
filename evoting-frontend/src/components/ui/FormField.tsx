import {cloneElement, type ReactElement} from 'react';

type FormFieldProps = {
    id: string; label: string; required?: boolean; helperText?: string; error?: string; disabled?: boolean;
    children: ReactElement; className?: string;
};

export default function FormField({id, label, required = false, helperText, error, disabled, children, className = ''}: FormFieldProps) {
    const descriptionId = id + '-description';
    const errorId = id + '-error';
    const describedBy = [helperText ? descriptionId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
    const child = children as ReactElement<Record<string, unknown>>;
    const control = cloneElement(child, {
        id: (child.props.id as string | undefined) ?? id,
        disabled: (child.props.disabled as boolean | undefined) ?? disabled,
        required: (child.props.required as boolean | undefined) ?? required,
        'aria-invalid': error ? true : child.props['aria-invalid'],
        'aria-describedby': describedBy ?? child.props['aria-describedby'],
    });
    return <div className={'ui-field' + (className ? ' ' + className : '')}>
        <label className="ui-field-label" htmlFor={id}>{label}{required && <span className="ui-required" aria-hidden="true"> *</span>}</label>
        {control}
        {helperText && !error && <p className="ui-field-help" id={descriptionId}>{helperText}</p>}
        {error && <p className="ui-field-error" id={errorId} role="alert">{error}</p>}
    </div>;
}
