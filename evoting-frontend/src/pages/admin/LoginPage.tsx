import {type FormEvent, useState} from 'react';
import {FiLogIn} from 'react-icons/fi';
import AuthLayout from '../../components/AuthLayout';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import FormField from '../../components/ui/FormField';
import PasswordInput from '../../components/ui/PasswordInput';
import TextInput from '../../components/ui/TextInput';
import {useAuth} from '../../hooks/useAuth';

type ApiError = {response?: {data?: {detail?: string}}};

function getLoginError(error: unknown) {
    const detail = (error as ApiError).response?.data?.detail;
    return detail || 'Unable to sign in. Check your username and password and try again.';
}

export default function LoginPage() {
    const {login} = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await login(username, password);
        } catch (caughtError: unknown) {
            setError(getLoginError(caughtError));
        } finally {
            setLoading(false);
        }
    };

    return <AuthLayout title="Administrator Login">
        <form onSubmit={handleSubmit} className="auth-form">
            {error && <Alert variant="error" title="Sign-in unsuccessful">{error}</Alert>}
            <FormField id="admin-username" label="Username" required>
                <TextInput autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required/>
            </FormField>
            <FormField id="admin-password" label="Password" required>
                <PasswordInput autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/>
            </FormField>
            <Button type="submit" className="auth-submit" loading={loading} disabled={!username.trim() || !password} leadingIcon={<FiLogIn aria-hidden="true"/>}>
                Sign in
            </Button>
        </form>
    </AuthLayout>;
}
