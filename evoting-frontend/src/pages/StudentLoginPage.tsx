// File: src/pages/voter/StudentLoginPage.tsx
import {type FormEvent, useState} from 'react';
import { useNavigate } from 'react-router-dom';
import api from "../apiConfig.ts";
import {showError} from '../utils/toast';

export default function StudentLoginPage() {
    const [studentId, setStudentId] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();


    const getElection = async () => {
        const res = await api.get('api/elections')

        return res.data

    }

    console.log("Ele: ", getElection())


    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
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
                showError('You are not activated to vote. Please contact the election committee.');
            } else if (err.response?.status === 409) {
                showError('You have already voted.');
            } else if (detail) {
                showError(detail);
            } else {
                showError('Failed to login. Please check your student ID and try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex">
            {/* Left Side - Background Image with Gradient Overlay */}
            <div className="hidden lg:flex lg:w-full relative">
                {/* Background Image from Cloudinary */}
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                        backgroundImage: `url('https://res.cloudinary.com/drfxlghwp/image/upload/v1769055293/login1_rktofr.jpg')`
                    }}
                />


                {/* Gradient Overlay - Blue to Transparent */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-700/90 via-blue-600/70 to-transparent" />
                
                {/* Content on overlay */}
                <div className="relative z-10 flex flex-col justify-center px-12 text-white">
                    <h2 className="text-4xl font-bold mb-4">Welcome to eVoting</h2>
                    <p className="text-lg text-blue-100 max-w-md">
                        Your voice matters. Cast your vote securely and make a difference The Great Kasec.
                    </p>
                    <div className="mt-8 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <span className="text-blue-100">Secure & Anonymous Voting</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <span className="text-blue-100">Quick & Easy Process</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <span className="text-blue-100">Every Vote Counts</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gradient-to-br from-white to-blue-200">
                <div className="w-full max-w-md">
                    {/* Mobile Header - Only visible on small screens */}
                    <div className="lg:hidden text-center mb-8">
                        <div className="mx-auto h-16 w-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-800">eVoting Portal</h1>
                    </div>

                    {/* Login Card - Subtle transparency */}
                    <div className="   p-1  ">
                        <div className="text-center mb-8">
                            <div className="hidden lg:flex mx-auto h-14 w-14 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl items-center justify-center mb-4 shadow-lg">
                                <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-800">Student Login</h1>
                            <p className="text-sm text-gray-500 mt-2">Enter your student ID to access the voting portal</p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label htmlFor="studentId" className="block text-sm font-medium text-gray-700 mb-2">
                                    Voter ID
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                                        </svg>
                                    </div>
                                    <input
                                        id="studentId"
                                        type="text"
                                        value={studentId}
                                        onChange={(e) => setStudentId(e.target.value.toUpperCase())}
                                        className="w-full pl-12 pr-4 py-4 bg-gray-50/50 border border-blue-400 rounded-xl focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all text-lg"
                                        placeholder="e.g., S12345"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-2 ml-1">
                                    Enter your voter ID
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !studentId.trim()}
                                className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center">
                                        <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Verifying...
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        Enter Voting Portal
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    </span>
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Footer */}
                    <p className="text-center text-xs text-gray-400 mt-16">
                        2026 eVoting System. Donated <strong className="text-black">Kasec Old Students' Association.</strong>
                    </p>
                </div>
            </div>
        </div>
    );
}