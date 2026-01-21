import {type FormEvent, useState } from 'react';
import api from '../../apiConfig';

export default function ActivationsPage() {
    const [studentId, setStudentId] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleActivate = async (e: FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setError(null);
        setLoading(true);

        try {
            const res = await api.post('api/students/activate/', {
                student_id: studentId,
                is_active: true, // Always set to true for activation
            });
            setMessage(res.data.detail || 'Student activated successfully');
            setStudentId(''); // Clear input after success
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Activation failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleDeactivate = async (e: FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setError(null);
        setLoading(true);

        try {
            const res = await api.post('api/students/activate/', {
                student_id: studentId,
                is_active: false, // Always set to false for deactivation
            });
            setMessage(res.data.detail || 'Student deactivated successfully');
            setStudentId(''); // Clear input after success
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Deactivation failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold text-gray-800">Activate/Deactivate Students</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Enter a Student ID to activate or deactivate their voting access.
                </p>
            </header>

            <section className="border rounded-lg p-4 space-y-3">
                <form className="space-y-3 max-w-md">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Student ID</label>
                        <input
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                            value={studentId}
                            onChange={(e) => setStudentId(e.target.value)}
                            placeholder="Enter student ID (e.g., S12345)"
                            required
                        />
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={handleActivate}
                            disabled={loading || !studentId.trim()}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md disabled:opacity-60 disabled:cursor-not-allowed flex-1"
                        >
                            {loading ? 'Processing...' : 'Activate Student'}
                        </button>

                        <button
                            type="button"
                            onClick={handleDeactivate}
                            disabled={loading || !studentId.trim()}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md disabled:opacity-60 disabled:cursor-not-allowed flex-1"
                        >
                            {loading ? 'Processing...' : 'Deactivate Student'}
                        </button>
                    </div>
                </form>

                {message && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-sm text-green-700">{message}</p>
                    </div>
                )}
                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                )}
            </section>
        </div>
    );
}