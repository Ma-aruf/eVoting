import {useEffect, useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useNavigate} from 'react-router-dom';
import {FiAlertCircle, FiCheck, FiCheckCircle, FiLoader, FiUserPlus} from 'react-icons/fi';
import {clearVoterSession, getVoterSession, voterApi} from '../api/voterApi';
import {type Candidate, useVotingData} from '../hooks/useVotingData';
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
    const queryClient = useQueryClient();
    const [selectedVotes, setSelectedVotes] = useState<SelectedVote[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [currentPositionIndex, setCurrentPositionIndex] = useState(0);

    // Confirm Modal
    const confirmModal = useConfirmModal();

    // Get student info and election context from session
    const studentId = sessionStorage.getItem('student_id');
    const studentName = sessionStorage.getItem('student_name');
    const voterToken = sessionStorage.getItem('voter_token');
    const electionId = sessionStorage.getItem('election_id');

    // Redirect if not authenticated or missing election context
    useEffect(() => {
        if (!studentId || !voterToken || !electionId) {
            navigate('/');
        }
    }, [studentId, voterToken, electionId, navigate]);

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
            const status = (queryError as {response?: {status?: number}}).response?.status;
            if (status === 401 || status === 403 || status === 404 || queryError.message.includes('session')) {
                clearVoterSession();
                queryClient.removeQueries({queryKey: ['votingData']});
                navigate('/voter-login', {
                    replace: true,
                    state: {message: 'Your voter session is no longer valid. Please sign in again.'},
                });
                return;
            }
            setError(queryError instanceof Error ? queryError.message : 'Failed to load voting data.');
        }
    }, [navigate, queryClient, queryError]);

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
        if (!studentId || !voterToken || !electionId) {
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
            const session = getVoterSession();
            if (!session) {
                throw new Error('Your voter session is no longer valid. Please sign in again.');
            }
            await voterApi.submitVotes(session, votesToSubmit);

            // Success - clear session and show success message
            setSuccess(true);
            setTimeout(() => {
                clearVoterSession();
                queryClient.removeQueries({queryKey: ['votingData']});
                navigate('/');
            }, 3000);

        } catch (err: unknown) {
            const apiError = err as {response?: {status?: number; data?: {detail?: string}}};
            if (apiError.response?.status === 401 || apiError.response?.status === 404) {
                clearVoterSession();
                queryClient.removeQueries({queryKey: ['votingData']});
                navigate('/voter-login', {
                    replace: true,
                    state: {message: 'Your voter session is no longer valid. Please sign in again.'},
                });
            } else if (apiError.response?.status === 403) {
                if (apiError.response?.data?.detail === 'Student has already voted.') {
                    setError('You have already voted. You cannot vote again.');
                    setTimeout(() => {
                        clearVoterSession();
                        queryClient.removeQueries({queryKey: ['votingData']});
                        navigate('/');
                    }, 3000);
                } else if (apiError.response?.data?.detail === 'Student is not activated to vote.') {
                    setError('Your voting access has been deactivated.');
                    setTimeout(() => {
                        clearVoterSession();
                        queryClient.removeQueries({queryKey: ['votingData']});
                        navigate('/');
                    }, 3000);
                } else {
                    setError(apiError.response?.data?.detail || 'Voting is not allowed at this time.');
                }
            } else if (apiError.response?.status === 400) {
                setError(apiError.response?.data?.detail || 'Invalid vote submission. Please check your selections.');
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
            clearVoterSession();
            queryClient.removeQueries({queryKey: ['votingData']});
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
                        <FiAlertCircle className="w-12 h-12 mx-auto" aria-hidden="true" />
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
                        <FiCheckCircle className="w-12 h-12 mx-auto" aria-hidden="true" />
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
                            <h1 className=" text-xl md:text-3xl font-bold text-amber-400">Voter Voting Portal</h1>
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
                            <div
                                className=" rounded border border-gray-200 flex flex-col max-w-[100%] max-h-[calc(100vh-50px)]">
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
                                                    <FiCheck className="w-4 h-4 mr-1" aria-hidden="true" />
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
                                                            className={`flex relative flex-col items-center p-4 sm:p-3 rounded-xl border-2 transition-all w-[155px] sm:w-[190px] h-[260px] sm:h-[290px] cursor-pointer ${
                                                                isSelected
                                                                    ? 'border-green-500 bg-green-50 ring-1 ring-green-200 shadow-md'
                                                                    : 'border-blue-200 hover:border-blue-300 hover:bg-blue-50 hover:shadow-md'
                                                            }`}
                                                            onClick={() => handleSelectCandidate(position.id, candidate)}
                                                        >

                                                            {/* Candidate Photo */}
                                                            <div
                                                                className="w-28 h-28 md:w-35 md:h-35 mt-5 rounded-full overflow-hidden bg-gray-100 mb-3 flex items-center justify-center border-2 border-white shadow relative">
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
                                                            <div className="flex absolute top-0 right-1 ">
                                                                <div className=" text-cyan-700 font-bold text-5xl">{candidate.ballot_number}</div>
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
                                                                        <FiCheck className="w-4 h-4" aria-hidden="true" />
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
                                            <FiUserPlus className="mx-auto h-12 w-12 text-gray-400" aria-hidden="true" />
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
                                                className="w-full sm:w-auto gentle-attention  px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                                            >
                                                {submitting ? (
                                                    <>
                                                        <FiLoader className="animate-spin h-4 w-4 text-white" aria-hidden="true" />
                                                        Submitting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <FiCheckCircle className="w-4 h-4" aria-hidden="true" />
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
