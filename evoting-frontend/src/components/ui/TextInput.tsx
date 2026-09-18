import {forwardRef, type InputHTMLAttributes} from 'react';

const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({className = '', ...props}, ref) {
    return <input ref={ref} className={'ui-control' + (className ? ' ' + className : '')} {...props}/>;
});

export default TextInput;
