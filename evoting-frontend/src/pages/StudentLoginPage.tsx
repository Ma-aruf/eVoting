// File: src/pages/voter/StudentLoginPage.tsx
import {type FormEvent, useState} from 'react';
import { useNavigate } from 'react-router-dom';
import api from "../apiConfig.ts";

export default function StudentLoginPage() {
    const [studentId, setStudentId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();


    const getElection = async () => {
        const res = await api.get('api/elections')

        return res.data

    }

    console.log("Ele: ", getElection())



    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            // First, check if student is active and get token
            const response = await api.post('api/voter/login/', {
                student_id: studentId.trim()
            });

            const { token, student } = response.data;


            // Store token and student info in sessionStorage (cleared when tab closes)
            sessionStorage.setItem('voter_token', token);
            sessionStorage.setItem('student_id', studentId);
            sessionStorage.setItem('student_name', student.full_name);

            // Redirect to voting page
            navigate('/vote');

        } catch (err: any) {
            console.error('Login error:', err);
            const detail = err.response?.data?.detail;

            if (err.response?.status === 403) {
                console.log("Error for not logging it: ", err)
                setError('You are not activated to vote. Please contact the election committee.');
            } else if (err.response?.status === 409) {
                setError('You have already voted.');
            } else if (detail) {
                setError(detail);
            } else {
                setError('Failed to login. Please check your student ID and try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 space-y-6">
                <div className="text-center">
                    <div className="mx-auto h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800">Student Voting Portal</h1>
                    <p className="text-sm text-gray-500 mt-2">Enter your student ID to begin voting</p>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="studentId" className="block text-sm font-medium text-gray-700 mb-1">
                            Student ID
                        </label>
                        <input
                            id="studentId"
                            type="text"
                            value={studentId}
                            onChange={(e) => setStudentId(e.target.value.toUpperCase())}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                            placeholder="e.g., S12345"
                            required
                            autoFocus
                        />
                        <p className="text-xs text-gray-500 mt-2">
                            Enter your index number exactly as registered
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !studentId.trim()}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center">
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Verifying...
                            </span>
                        ) : (
                            'Enter Voting Portal'
                        )}
                    </button>
                </form>

                <div className="border-t border-gray-200 pt-4">
                    <div className="text-center text-sm text-gray-500">
                        <p className="mb-2">Need help?</p>
                        <button
                            type="button"
                            onClick={() => alert('Contact the election committee at election@school.edu')}
                            className="text-blue-600 hover:text-blue-700 font-medium"
                        >
                            Contact Election Committee
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}