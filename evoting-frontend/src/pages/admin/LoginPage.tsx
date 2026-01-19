import {type FormEvent, useState} from 'react';
import {useAuth} from '../../hooks/useAuth';


export default function LoginPage() {
    const {login} = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await login(username, password);
        } catch (error) {
            const err = error as any;
            setError(err?.response?.data?.detail || err.message || 'Login failed');
        }
        finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="w-full max-w-md bg-white shadow rounded-lg p-6 space-y-4">
                <h1 className="text-xl font-semibold text-gray-800 text-center">Admin Login</h1>
                {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Username</label>
                        <input
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Password</label>
                        <input
                            type="password"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md disabled:opacity-60"
                    >
                        {loading ? 'Signing in...' : 'Sign in'}
                    </button>
                </form>
                <p className="text-xs text-gray-500 text-center">
                    Dev note: login is currently mocked. Use usernames like <code>superuser</code>, <code>staff1</code>,
                    or <code>activator1</code> with password <code>admin123</code>.
                </p>
            </div>
        </div>
    );
}

