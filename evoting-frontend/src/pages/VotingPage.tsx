import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../apiConfig';

interface Election {
    id: number;
    name: string;
    year: number;
    start_time: string;
    end_time: string;
    is_active: boolean;
}

interface Position {
    id: number;
    name: string;
    display_order: number;
    election: number;
}

interface Candidate {
    id: number;
    student: number;
    student_name: string;
    position: number;
    photo_url?: string;
}

interface SelectedVote {
    position_id: number;
    position_name: string;
    candidate_id: number | null;
    candidate_name: string;
}

export default function VotingPage() {
    const navigate = useNavigate();
    const [activeElection, setActiveElection] = useState<Election | null>(null);
    const [positions, setPositions] = useState<Position[]>([]);
    const [candidatesByPosition, setCandidatesByPosition] = useState<Record<number, Candidate[]>>({});
    const [selectedVotes, setSelectedVotes] = useState<SelectedVote[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Get student info from session
    const studentId = sessionStorage.getItem('student_id');
    const studentName = sessionStorage.getItem('student_name');
    const voterToken = sessionStorage.getItem('voter_token');

    // Redirect if not authenticated
    useEffect(() => {
        if (!studentId || !voterToken) {
            navigate('/');
        }
    }, [studentId, voterToken, navigate]);

    // Fetch active election, positions, and candidates
    useEffect(() => {
        if (!studentId || !voterToken) return;

        const fetchVotingData = async () => {
            try {
                setLoading(true);
                setError(null);

                // 1. Get active election
                const electionRes = await api.get('/api/elections/', {
                    params: { is_active: true }
                });

                console.log("Election Data:", electionRes)

                let elections = electionRes.data;
                if (elections.results) {
                    elections = elections.results;
                }

                if (!Array.isArray(elections) || elections.length === 0) {
                    setError('No active election found.');
                    return;
                }

                const activeElection = elections[0];
                setActiveElection(activeElection);

                // 2. Get positions for this election
                const positionsRes = await api.get('/api/positions/', {
                    params: { election_id: activeElection.id }
                });

                let positions = positionsRes.data;
                if (positions.results) {
                    positions = positions.results;
                }

                if (!Array.isArray(positions)) {
                    positions = [];
                }

                // Sort by display_order
                positions.sort((a: { display_order: number; }, b: { display_order: number; }) => a.display_order - b.display_order);
                setPositions(positions);

                // 3. Get candidates for each position
                const candidatesMap: Record<number, Candidate[]> = {};
                const candidatePromises = positions.map(async (position: Position) => {
                    try {
                        const candidatesRes = await api.get('/api/candidates/', {
                            params: { position_id: position.id }
                        });

                        let candidates = candidatesRes.data;
                        if (candidates.results) {
                            candidates = candidates.results;
                        }

                        if (Array.isArray(candidates)) {
                            // Shuffle candidates for random order (optional)
                            candidates = [...candidates].sort(() => Math.random() - 0.5);
                            candidatesMap[position.id] = candidates;
                        }
                    } catch (err) {
                        console.error(`Failed to fetch candidates for position ${position.id}:`, err);
                        candidatesMap[position.id] = [];
                    }
                });

                await Promise.all(candidatePromises);
                setCandidatesByPosition(candidatesMap);

                // 4. Initialize selected votes (empty for each position)
                const initialVotes = positions.map((position: { id: any; name: any; }) => ({
                    position_id: position.id,
                    position_name: position.name,
                    candidate_id: null,
                    candidate_name: ''
                }));
                setSelectedVotes(initialVotes);

            } catch (err) {
                console.error('Failed to fetch voting data:', err);
                setError('Failed to load voting data. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchVotingData();
    }, [studentId, voterToken]);

    const handleSelectCandidate = (positionId: number, candidate: Candidate) => {
        setSelectedVotes(prev =>
            prev.map(vote =>
                vote.position_id === positionId
                    ? {
                        ...vote,
                        candidate_id: candidate.id,
                        candidate_name: candidate.student_name
                    }
                    : vote
            )
        );
    };

    const handleSkipPosition = (positionId: number) => {
        setSelectedVotes(prev =>
            prev.map(vote =>
                vote.position_id === positionId
                    ? {
                        ...vote,
                        candidate_id: null,
                        candidate_name: 'Skipped'
                    }
                    : vote
            )
        );
    };

    const handleSubmitVotes = async () => {
        if (!studentId || !voterToken) {
            navigate('/');
            return;
        }

        // Filter votes where candidate was selected (not skipped)
        const votesToSubmit = selectedVotes
            .filter(vote => vote.candidate_id !== null)
            .map(vote => ({
                election: activeElection?.id,
                position: vote.position_id,
                candidate: vote.candidate_id
            }));

        // Show confirmation if some positions were skipped
        const skippedCount = selectedVotes.filter(v => v.candidate_id === null).length;
        if (skippedCount > 0) {
            const confirmSkip = window.confirm(
                `You have skipped ${skippedCount} position(s). Are you sure you want to submit your votes?`
            );
            if (!confirmSkip) return;
        }

        // Show final confirmation
        const finalConfirm = window.confirm(
            `You are about to submit votes for ${votesToSubmit.length} position(s). This action cannot be undone. Confirm submission?`
        );
        if (!finalConfirm) return;

        setSubmitting(true);
        setError(null);

        try {
            // Submit votes using MultiVoteView
            const response = await api.post('/api/vote/', {
                votes: votesToSubmit
            }, {
                headers: {
                    'X-Student-Id': studentId,
                    'X-Voter-Token': voterToken
                }
            });

            console.log("voted: ", response.data)

            // Success - clear session and show success message
            setSuccess(true);
            setTimeout(() => {
                sessionStorage.clear();
                navigate('/');
            }, 3000);

        } catch (err: any) {
            console.error('Vote submission error:', err);

            if (err.response?.status === 403) {
                if (err.response?.data?.detail === 'Student has already voted.') {
                    setError('You have already voted. You cannot vote again.');
                    setTimeout(() => {
                        sessionStorage.clear();
                        navigate('/');
                    }, 3000);
                } else if (err.response?.data?.detail === 'Student is not activated to vote.') {
                    setError('Your voting access has been deactivated.');
                    setTimeout(() => {
                        sessionStorage.clear();
                        navigate('/');
                    }, 3000);
                } else {
                    setError(err.response?.data?.detail || 'Voting is not allowed at this time.');
                }
            } else if (err.response?.status === 400) {
                setError(err.response?.data?.detail || 'Invalid vote submission. Please check your selections.');
            } else {
                setError('Failed to submit votes. Please try again.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleLogout = () => {
        const confirmLogout = window.confirm('Are you sure you want to logout? Your votes will not be saved.');
        if (confirmLogout) {
            sessionStorage.clear();
            navigate('/');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading voting data...</p>
                </div>
            </div>
        );
    }

    if (error && !success) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
                    <div className="text-red-500 text-center mb-4">
                        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Error</h2>
                    <p className="text-gray-600 text-center mb-6">{error}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Return to Login
                    </button>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
                    <div className="text-green-500 text-center mb-4">
                        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Votes Submitted Successfully!</h2>
                    <p className="text-gray-600 text-center mb-6">
                        Thank you for participating in the election. You will be redirected shortly.
                    </p>
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600 mx-auto"></div>
                    </div>
                </div>
            </div>
        );
    }

    const progressPercentage = positions.length > 0
        ? (selectedVotes.filter(v => v.candidate_id !== null).length / positions.length) * 100
        : 0;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white shadow">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">Student Voting Portal</h1>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                                <span>Welcome, <strong>{studentName}</strong></span>
                                <span className="hidden sm:inline">•</span>
                                <span>ID: {studentId}</span>
                                {activeElection && (
                                    <>
                                        <span className="hidden sm:inline">•</span>
                                        <span>{activeElection.name} ({activeElection.year})</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* Progress Bar */}
            <div className="bg-white border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">
                            Voting Progress
                        </span>
                        <span className="text-sm text-gray-600">
                            {selectedVotes.filter(v => v.candidate_id !== null).length} of {positions.length} positions
                        </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progressPercentage}%` }}
                        ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        Select a candidate for each position or skip. You can change your selections before submitting.
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-blue-800">How to Vote</h3>
                            <div className="mt-2 text-sm text-blue-700">
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>For each position below, select one candidate or skip</li>
                                    <li>You can change your selection before submitting</li>
                                    <li>Once submitted, you cannot vote again</li>
                                    <li>Your vote is anonymous and secure</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Positions Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {positions.map((position) => {
                        const candidates = candidatesByPosition[position.id] || [];
                        const selectedVote = selectedVotes.find(v => v.position_id === position.id);
                        const isSkipped = selectedVote?.candidate_id === null;

                        return (
                            <div key={position.id} className="bg-white rounded-lg shadow border p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800">{position.name}</h3>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Select one candidate or skip this position
                                        </p>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        {selectedVote?.candidate_id && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                Selected
                                            </span>
                                        )}
                                        {isSkipped && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                Skipped
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Candidates List */}
                                <div className="space-y-3 mb-4">
                                    {candidates.length > 0 ? (
                                        candidates.map((candidate) => {
                                            const isSelected = selectedVote?.candidate_id === candidate.id;

                                            return (
                                                <div
                                                    key={candidate.id}
                                                    onClick={() => handleSelectCandidate(position.id, candidate)}
                                                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                                                        isSelected
                                                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                                                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <div className="flex items-center">
                                                        <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                                                            {candidate.photo_url ? (
                                                                <img
                                                                    src={candidate.photo_url}
                                                                    alt={candidate.student_name}
                                                                    className="h-10 w-10 rounded-full object-cover"
                                                                />
                                                            ) : (
                                                                <span className="text-gray-400 font-medium">
                                                                    {candidate.student_name.charAt(0)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="ml-4 flex-1">
                                                            <h4 className="text-sm font-medium text-gray-900">
                                                                {candidate.student_name}
                                                            </h4>
                                                            <p className="text-xs text-gray-500">
                                                                Candidate
                                                            </p>
                                                        </div>
                                                        <div className="flex-shrink-0">
                                                            <div className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                                                                isSelected 
                                                                    ? 'bg-blue-500 border-blue-500'
                                                                    : 'border-gray-300'
                                                            }`}>
                                                                {isSelected && (
                                                                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-center py-8 text-gray-500">
                                            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                            </svg>
                                            <p className="mt-2">No candidates for this position</p>
                                        </div>
                                    )}
                                </div>

                                {/* Skip Button */}
                                <button
                                    onClick={() => handleSkipPosition(position.id)}
                                    className={`w-full py-2 px-4 border rounded-lg text-sm font-medium transition ${
                                        isSkipped
                                            ? 'border-yellow-300 bg-yellow-50 text-yellow-700'
                                            : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    {isSkipped ? (
                                        <span className="flex items-center justify-center">
                                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            Position Skipped
                                        </span>
                                    ) : (
                                        'Skip this Position'
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Selected Votes Summary */}
                <div className="mt-8 bg-white rounded-lg shadow border p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Your Selections</h3>
                    {selectedVotes.some(v => v.candidate_id !== null) ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {selectedVotes
                                .filter(vote => vote.candidate_id !== null)
                                .map((vote) => (
                                    <div key={vote.position_id} className="bg-gray-50 p-3 rounded-lg">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">{vote.position_name}</p>
                                                <p className="text-sm text-gray-600">{vote.candidate_name}</p>
                                            </div>
                                            <button
                                                onClick={() => handleSelectCandidate(vote.position_id, {
                                                    id: -1,
                                                    student: -1,
                                                    student_name: '',
                                                    position: vote.position_id
                                                })}
                                                className="text-gray-400 hover:text-gray-600"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    ) : (
                        <p className="text-gray-500 text-center py-4">No selections made yet</p>
                    )}

                    {/* Submit Button */}
                    <div className="mt-6 pt-6 border-t border-gray-200">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div>
                                <p className="text-sm text-gray-600">
                                    <strong>Important:</strong> Once submitted, you cannot change your votes.
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Positions skipped: {selectedVotes.filter(v => v.candidate_id === null).length}
                                </p>
                            </div>
                            <button
                                onClick={handleSubmitVotes}
                                disabled={submitting || selectedVotes.every(v => v.candidate_id === null)}
                                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition"
                            >
                                {submitting ? (
                                    <span className="flex items-center justify-center">
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Submitting...
                                    </span>
                                ) : (
                                    'Submit All Votes'
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-red-800">Error</h3>
                                <div className="mt-2 text-sm text-red-700">
                                    <p>{error}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}