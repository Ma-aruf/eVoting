// File: src/pages/voter/SuccessPage.tsx
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function SuccessPage() {
    // Clear any remaining session data
    useEffect(() => {
        sessionStorage.clear();
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                    <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>

                <h1 className="text-2xl font-bold text-gray-800 mb-2">Thank You for Voting!</h1>

                <p className="text-gray-600 mb-6">
                    Your votes have been successfully recorded. Thank you for participating in the election process.
                </p>

                <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <p className="text-sm text-green-700">
                            Your vote is anonymous and has been securely recorded.
                        </p>
                    </div>

                    <div className="text-sm text-gray-500 space-y-2">
                        <p>You can now close this window or return to the login page.</p>
                        <p className="text-xs">
                            For security reasons, you cannot vote again with the same student ID.
                        </p>
                    </div>

                    <div className="pt-4">
                        <Link
                            to="/"
                            className="inline-block px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                        >
                            Return to Login Page
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}