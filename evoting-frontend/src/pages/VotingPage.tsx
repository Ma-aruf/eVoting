import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import api from '../apiConfig';
import {useVotingData, type Candidate} from '../hooks/useVotingData';
import ConfirmModal from '../components/ConfirmModal';
import {useConfirmModal} from '../hooks/useConfirmModal';

interface SelectedVote {
    position_id: number;
    position_name: string;
    candidate_id: number | null;
    candidate_name: string;
    candidate_photo?: string;
}

export default function VotingPage() {
    const navigate = useNavigate();
    const [selectedVotes, setSelectedVotes] = useState<SelectedVote[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [currentPositionIndex, setCurrentPositionIndex] = useState(0);
    
    // Confirm Modal
    const confirmModal = useConfirmModal();

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

    // Fetch voting data using React Query (cached for entire session)
    const {data: votingData, isLoading: loading, error: queryError} = useVotingData(
        !!(studentId && voterToken)
    );

    // Extract data from React Query result
    const activeElection = votingData?.election ?? null;
    const positions = votingData?.positions ?? [];
    const candidatesByPosition = votingData?.candidatesByPosition ?? {};

    // Initialize selected votes when positions are loaded
    useEffect(() => {
        if (positions.length > 0 && selectedVotes.length === 0) {
            const initialVotes = positions.map((position) => ({
                position_id: position.id,
                position_name: position.name,
                candidate_id: null,
                candidate_name: '',
                candidate_photo: undefined
            }));
            setSelectedVotes(initialVotes);
        }
    }, [positions, selectedVotes.length]);

    // Handle query error
    useEffect(() => {
        if (queryError) {
            setError(queryError instanceof Error ? queryError.message : 'Failed to load voting data.');
        }
    }, [queryError]);

    const handleSelectCandidate = (positionId: number, candidate: Candidate) => {
        setSelectedVotes(prev =>
            prev.map(vote =>
                vote.position_id === positionId
                    ? {
                        ...vote,
                        candidate_id: candidate.id,
                        candidate_name: candidate.student_name,
                        candidate_photo: candidate.photo_url
                    }
                    : vote
            )
        );
        // Auto-advance to next position after voting
        if (currentPositionIndex < positions.length - 1) {
            setTimeout(() => setCurrentPositionIndex(prev => prev + 1), 300);
        }
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

        if (votesToSubmit.length !== positions.length) {
            setError('Please vote for every position before submitting.');
            return;
        }


        setSubmitting(true);
        setError(null);

        try {
            await api.post('/api/vote/', {
                votes: votesToSubmit
            }, {
                headers: {
                    'X-Student-Id': studentId,
                    'X-Voter-Token': voterToken
                }
            });

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

    const handleLogout = async () => {
        const confirmed = await confirmModal.confirm({
            title: 'Logout',
            message: 'Are you sure you want to logout? Your votes will not be saved.',
            confirmText: 'Logout',
            cancelText: 'Cancel',
            type: 'warning'
        });
        
        if (confirmed) {
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
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

    const selectedCount = selectedVotes.filter(v => v.candidate_id !== null).length;

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            {/* Header */}
            <header className="bg-blue-900 shadow-sm flex-shrink-0">
                <div className="px-4 sm:px-6 py-2">
                    <div className="flex  flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <h1 className=" text-xl md:text-3xl font-bold text-amber-400">Student Voting Portal</h1>
                            <div className="flex flex-wrap items-center gap-3 text-md text-white/80 mt-2">
                                <span>Welcome, <strong>{studentName}</strong></span>
                                <span>•</span>
                                <span className="text-white">ID: {studentId}</span>
                                {activeElection && (
                                    <>
                                        <span>•</span>
                                        <span
                                            className="text-rose-300 font-medium">{activeElection.name} ({activeElection.year})</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="w-20  sm:w-auto px-3 py-1 bg-red-400 text-sm rounded-lg hover:bg-red-500 transition-all"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>


            {/* Main Content - Centered Single Position */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center">
                {positions.length > 0 && (() => {
                    const position = positions[currentPositionIndex];
                    const candidates = candidatesByPosition[position.id] || [];
                    const selectedVote = selectedVotes.find(v => v.position_id === position.id);
                    const isLastPosition = currentPositionIndex === positions.length - 1;

                    return (
                        <div className="w-full   max-w-6xl">
                            {/* Position Indicator */}
                            <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                                {positions.map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentPositionIndex(idx)}
                                        className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-all cursor-pointer ${
                                            idx === currentPositionIndex
                                                ? 'bg-blue-600 scale-125'
                                                : idx < currentPositionIndex
                                                    ? 'bg-green-500'
                                                    : 'bg-gray-300'
                                        }`}
                                    />
                                ))}
                            </div>

                            {/* Position Card */}
                            <div className=" rounded border border-gray-200 flex flex-col max-w-[100%] max-h-[calc(100vh-50px)]">
                                {/* Position Header */}
                                <div
                                    className="px-4 sm:px-6 py-2  bg-blue-300 rounded-t">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                        <div className="flex justify-center">
                                            <h3 className="text-2xl  font-bold text-black/70">{position.name}</h3>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {selectedVote?.candidate_id && (
                                                <span
                                                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                                                    <svg className="w-4 h-4 mr-1" fill="currentColor"
                                                         viewBox="0 0 20 20">
                                                        <path fillRule="evenodd"
                                                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                              clipRule="evenodd"/>
                                                    </svg>
                                                    Voted
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Candidates - Centered with fit width */}
                                <div className="p-3 sm:p-1 flex-1 overflow-y-auto">
                                    {candidates.length > 0 ? (
                                        <div className="flex  justify-center">
                                            <div className="inline-flex h-75  flex-wrap justify-center gap-4">
                                                {candidates.map((candidate) => {
                                                    const isSelected = selectedVote?.candidate_id === candidate.id;

                                                    return (
                                                        <div
                                                            key={candidate.id}
                                                            className={`flex flex-col items-center p-4 sm:p-3 rounded-xl border-2 transition-all w-[155px] sm:w-[190px] h-[260px] sm:h-[290px] cursor-pointer ${
                                                                isSelected
                                                                    ? 'border-green-500 bg-green-50 ring-1 ring-green-200 shadow-md'
                                                                    : 'border-blue-200 hover:border-blue-300 hover:bg-blue-50 hover:shadow-md'
                                                            }`}
                                                            onClick={() => handleSelectCandidate(position.id, candidate)}
                                                        >
                                                            {/* Ballot Number Badge */}
                                                            <div className="absolute -top-2 -right-2 w-8 h-8 bg-amber-400 text-black font-bold rounded-full flex items-center justify-center text-sm shadow-md border-2 border-white">
                                                                {candidate.ballot_number}
                                                            </div>
                                                            {/* Candidate Photo */}
                                                            <div
                                                                className="w-28 h-28 md:w-35 md:h-35 rounded-full overflow-hidden bg-gray-100 mb-3 flex items-center justify-center border-2 border-white shadow relative">
                                                                {candidate.photo_url ? (
                                                                    <img
                                                                        src={candidate.photo_url}
                                                                        alt={candidate.student_name}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <span className="text-3xl font-bold text-gray-400">
                                                                        {candidate.student_name.charAt(0)}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Candidate Name */}
                                                            <h4 className="text-sm font-semibold text-gray-800 text-center mb-3 line-clamp-2 h-10">
                                                                {candidate.student_name}
                                                            </h4>

                                                            {/* Vote Indicator */}
                                                            <div
                                                                className={`w-full py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${
                                                                    isSelected
                                                                        ? 'bg-green-600 text-white'
                                                                        : 'bg-blue-600 text-white'
                                                                }`}>
                                                                {isSelected ? (
                                                                    <>
                                                                        <svg className="w-4 h-4" fill="currentColor"
                                                                             viewBox="0 0 20 20">
                                                                            <path fillRule="evenodd"
                                                                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                                                  clipRule="evenodd"/>
                                                                        </svg>
                                                                        Selected
                                                                    </>
                                                                ) : (
                                                                    'Vote'
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-gray-500">
                                            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none"
                                                 viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                                                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                                            </svg>
                                            <p className="mt-2">No candidates for this position</p>
                                        </div>
                                    )}

                                </div>

                                {/* Navigation Footer */}
                                <div className="px-4 sm:px-6 py-4 bg-gray-50 border-t rounded-b-xl">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                        <div className="text-sm text-gray-500">
                                            {selectedCount} of {positions.length} completed
                                        </div>

                                        {isLastPosition ? (
                                            <button
                                                onClick={handleSubmitVotes}
                                                disabled={submitting || selectedCount !== positions.length}
                                                className="w-full sm:w-auto px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                                            >
                                                {submitting ? (
                                                    <>
                                                        <svg className="animate-spin h-4 w-4 text-white" fill="none"
                                                             viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10"
                                                                    stroke="currentColor" strokeWidth="4"/>
                                                            <path className="opacity-75" fill="currentColor"
                                                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                                        </svg>
                                                        Submitting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor"
                                                             viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round"
                                                                  strokeWidth={2}
                                                                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                                        </svg>
                                                        Submit Votes
                                                    </>
                                                )}
                                            </button>
                                        ) : (
                                            <p></p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Summary below card */}

                            {error && (
                                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <p className="text-sm text-red-700">{error}</p>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>
            
            {/* Confirm Modal */}
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={confirmModal.handleClose}
                onConfirm={confirmModal.handleConfirm}
                title={confirmModal.options.title}
                message={confirmModal.options.message}
                confirmText={confirmModal.options.confirmText}
                cancelText={confirmModal.options.cancelText}
                type={confirmModal.options.type}
            />
        </div>
    );
}
