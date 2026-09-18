import {forwardRef, type TextareaHTMLAttributes} from 'react';

const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({className = '', ...props}, ref) {
    return <textarea ref={ref} className={'ui-control ui-textarea' + (className ? ' ' + className : '')} {...props}/>;
});

export default TextArea;
