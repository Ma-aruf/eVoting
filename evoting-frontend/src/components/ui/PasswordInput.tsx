import {forwardRef, useState, type InputHTMLAttributes} from 'react';
import {FiEye, FiEyeOff} from 'react-icons/fi';
import IconButton from './IconButton';

const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function PasswordInput({className = '', ...props}, ref) {
    const [visible, setVisible] = useState(false);
    return <div className="ui-password-control">
        <input ref={ref} type={visible ? 'text' : 'password'} className={'ui-control ui-password-input' + (className ? ' ' + className : '')} {...props}/>
        <IconButton label={visible ? 'Hide password' : 'Show password'} icon={visible ? <FiEyeOff aria-hidden="true"/> : <FiEye aria-hidden="true"/>}
            size="compact" onClick={() => setVisible(value => !value)} className="ui-password-toggle"/>
    </div>;
});

export default PasswordInput;
