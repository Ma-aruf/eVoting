import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useNavigate} from 'react-router-dom';
import {FiAlertCircle, FiCheck, FiCheckCircle, FiLoader, FiThumbsDown, FiThumbsUp, FiUserPlus} from 'react-icons/fi';
import {clearVoterSession, getVoterSession, markVoterSessionUnableToVote, voterApi} from '../api/voterApi';
import {type Candidate, useVotingData} from '../hooks/useVotingData';
import {voterLifecycleMessage, voterLifecycleMessageFromDetail} from '../utils/electionLifecycle';
import ElectionStatusBadge from '../components/ElectionStatusBadge';

interface SelectedVote {
    position_id: number;
    position_name: string;
    candidate_id: number | null;
    candidate_name: string;
    candidate_photo?: string;
    choice: 'candidate' | 'yes' | 'no';
}

export default function VotingPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [selectedVotes, setSelectedVotes] = useState<SelectedVote[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [currentPositionIndex, setCurrentPositionIndex] = useState(0);
    const [timeLeft, setTimeLeft] = useState(15);
    const [isChangingVote, setIsChangingVote] = useState(false);
    const submissionInFlight = useRef(false);
    const autoSubmitAttempted = useRef(false);
    const redirectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (redirectTimeout.current) clearTimeout(redirectTimeout.current);
    }, []);

    // Get student info and election context from session
    const studentId = sessionStorage.getItem('student_id');
    const studentName = sessionStorage.getItem('student_name');
    const voterToken = sessionStorage.getItem('voter_token');
    const electionId = sessionStorage.getItem('election_id');
    const voterSession = getVoterSession();
    const hasVoterSession = Boolean(voterSession);
    const sessionCanVote = Boolean(voterSession?.canVoteNow && voterSession.election.voting_open && voterSession.election.status === 'open');

    // Redirect if not authenticated or missing election context
    useEffect(() => {
        if (!studentId || !voterToken || !electionId || !hasVoterSession) {
            navigate('/');
        }
    }, [studentId, voterToken, electionId, hasVoterSession, navigate]);

    // Fetch voting data using React Query (cached for entire session)
    const {data: votingData, isLoading: loading, error: queryError} = useVotingData(
        !!(studentId && voterToken)
    );

    // Extract data from React Query result
    const election = votingData?.election ?? voterSession?.election ?? null;
    const canPresentBallot = Boolean(sessionCanVote && votingData?.can_vote_now && election?.voting_open && election.status === 'open');
    const positions = useMemo(() => votingData?.positions ?? [], [votingData?.positions]);
    const candidatesByPosition = useMemo(
        () => votingData?.candidatesByPosition ?? {},
        [votingData?.candidatesByPosition]
    );

    // Initialize selected votes when positions are loaded
    useEffect(() => {
        if (positions.length > 0 && selectedVotes.length === 0) {
            const initialVotes = positions.map((position) => ({
                position_id: position.id,
                position_name: position.name,
                candidate_id: null,
                candidate_name: '',
                candidate_photo: undefined,
                choice: 'candidate' as const,
            }));
            setSelectedVotes(initialVotes);
        }
    }, [positions, selectedVotes.length]);

    // Handle query error
    useEffect(() => {
        if (queryError) {
            const apiError = queryError as { response?: { status?: number; data?: { detail?: string } } };
            const status = apiError.response?.status;
            if (status === 401 || status === 403 || status === 404 || queryError.message.includes('session')) {
                const lifecycleMessage = voterLifecycleMessageFromDetail(apiError.response?.data?.detail);
                if (lifecycleMessage) {
                    setError(lifecycleMessage);
                    return;
                }
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
                        candidate_photo: candidate.photo_url,
                        choice: 'candidate',
                    }
                    : vote
            )
        );
        // Auto-advance to next position after voting
        if (isChangingVote) {
            // If changing a vote, return to submit card after selection
            setTimeout(() => {
                setCurrentPositionIndex(positions.length);
                setIsChangingVote(false);
                setTimeLeft(15);
            }, 300);
        } else if (currentPositionIndex < positions.length - 1) {
            setTimeout(() => setCurrentPositionIndex(prev => prev + 1), 300);
        } else if (currentPositionIndex === positions.length - 1) {
            // Advance to submit card when last position is voted
            setTimeout(() => {
                setCurrentPositionIndex(prev => prev + 1);
                setTimeLeft(45);
            }, 300);
        }
    };

    const handleSelectApproval = (positionId: number, choice: 'yes' | 'no') => {
        const candidate = candidatesByPosition[positionId]?.[0];
        if (!candidate) return;

        setSelectedVotes(prev =>
            prev.map(vote =>
                vote.position_id === positionId
                    ? {
                        ...vote,
                        candidate_id: candidate.id,
                        candidate_name: candidate.student_name,
                        candidate_photo: candidate.photo_url,
                        choice,
                    }
                    : vote
            )
        );

        if (isChangingVote) {
            setTimeout(() => {
                setCurrentPositionIndex(positions.length);
                setIsChangingVote(false);
                setTimeLeft(15);
            }, 300);
        } else if (currentPositionIndex < positions.length - 1) {
            setTimeout(() => setCurrentPositionIndex(prev => prev + 1), 300);
        } else if (currentPositionIndex === positions.length - 1) {
            setTimeout(() => {
                setCurrentPositionIndex(prev => prev + 1);
                setTimeLeft(45);
            }, 300);
        }
    };

    const handleSubmitVotes = useCallback(async () => {
        if (!studentId || !voterToken || !electionId || !canPresentBallot || submissionInFlight.current) {
            navigate('/');
            return;
        }

        // Filter votes where candidate was selected (not skipped)
        const votesToSubmit = selectedVotes
            .filter(vote => vote.candidate_id !== null)
            .map(vote => ({
                election: election?.id,
                position: vote.position_id,
                candidate: vote.candidate_id,
                choice: vote.choice,
            }));

        if (votesToSubmit.length !== positions.length || selectedVotes.some(vote => vote.candidate_id === null)) {
            setError('Please vote for every position before submitting.');
            return;
        }


        submissionInFlight.current = true;
        setSubmitting(true);
        setError(null);

        try {
            const session = getVoterSession();
            if (!session) {
                throw new Error('Your voter session is no longer valid. Please sign in again.');
            }
            const response = await voterApi.submitVotes(session, votesToSubmit);
            if (response.data.can_vote_now !== false) {
                setError('Your ballot could not be submitted. Please try again.');
                return;
            }

            // Success - clear session and show success message
            markVoterSessionUnableToVote();
            setSelectedVotes([]);
            setSuccess(true);
            redirectTimeout.current = setTimeout(() => {
                clearVoterSession();
                queryClient.removeQueries({queryKey: ['votingData']});
                navigate('/');
            }, 3000);

        } catch (err: unknown) {
            const apiError = err as { response?: { status?: number; data?: { detail?: string } } };
            const lifecycleMessage = voterLifecycleMessageFromDetail(apiError.response?.data?.detail);
            if (lifecycleMessage) {
                setError(lifecycleMessage);
            } else if (apiError.response?.status === 401 || apiError.response?.status === 404) {
                clearVoterSession();
                queryClient.removeQueries({queryKey: ['votingData']});
                navigate('/voter-login', {
                    replace: true,
                    state: {message: 'Your voter session is no longer valid. Please sign in again.'},
                });
            } else if (apiError.response?.status === 403) {
                if (apiError.response?.data?.detail?.includes('ballot is not ready')) {
                    setError('Voting is not available yet. Please contact an election administrator.');
                } else if (apiError.response?.data?.detail === 'Student has already voted.') {
                    setError('You have already voted in this election.');
                    setTimeout(() => {
                        clearVoterSession();
                        queryClient.removeQueries({queryKey: ['votingData']});
                        navigate('/');
                    }, 3000);
                } else if (apiError.response?.data?.detail === 'Student is not activated to vote.') {
                    setError('You have not been activated for this election.');
                    setTimeout(() => {
                        clearVoterSession();
                        queryClient.removeQueries({queryKey: ['votingData']});
                        navigate('/');
                    }, 3000);
                } else {
                    setError('Voting is not currently available. Please try again later.');
                }
            } else if (apiError.response?.status === 400) {
                setError(
                    apiError.response?.data?.detail
                    || 'Your ballot could not be submitted. Please review your selections and try again.'
                );
            } else if (apiError.response?.status === 409) {
                setError('Your voter session cannot submit a ballot right now. Please sign in again.');
            } else {
                setError('Failed to submit votes. Please try again.');
            }
        } finally {
            setSubmitting(false);
            submissionInFlight.current = false;
        }
    }, [canPresentBallot, election?.id, electionId, navigate, positions.length, queryClient, selectedVotes, studentId, voterToken]);

    // Keep the existing timed auto-submit behavior for the final review card.
    useEffect(() => {
        if (!canPresentBallot || positions.length === 0 || success) return;
        if (currentPositionIndex === positions.length && timeLeft > 0 && !submitting) {
            const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
            return () => clearInterval(timer);
        }

        if (currentPositionIndex === positions.length && timeLeft === 0 && !submitting) {
            if (!autoSubmitAttempted.current) {
                autoSubmitAttempted.current = true;
                void handleSubmitVotes();
            }
        }
    }, [canPresentBallot, currentPositionIndex, handleSubmitVotes, positions.length, submitting, success, timeLeft]);

    useEffect(() => {
        if (currentPositionIndex === positions.length) {
            setTimeLeft(15);
            autoSubmitAttempted.current = false;
        }
    }, [currentPositionIndex, positions.length]);


    if (!sessionCanVote && !success) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">Voting unavailable</h2>
                    <p className="text-sm text-gray-600 mb-4">{voterSession ? voterLifecycleMessage(voterSession.election.status) : 'Your voter session is no longer valid. Please sign in again.'}</p>
                    <button type="button" onClick={() => navigate('/voter-login')}
                            className="w-full py-2 bg-blue-600 text-white rounded-sm hover:bg-blue-700">Return to Login
                    </button>
                </div>
            </div>
        );
    }

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
                        <FiAlertCircle className="w-12 h-12 mx-auto" aria-hidden="true"/>
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
                        <FiCheckCircle className="w-12 h-12 mx-auto" aria-hidden="true"/>
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

    return (
        <div className="h-[100vh] bg-gray-100 flex flex-col p-0">
            {/* Header */}
            <header className="bg-cyan-800 shadow-sm flex-shrink-0">
                <div className="px-4 sm:px-6 py-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <div className="flex flex-wrap items-center gap-3 text-md text-white/80 mt-2">
                                <span>Welcome, <strong>{studentName}</strong></span>
                                <span>•</span>
                                <span className="text-white">ID: {studentId}</span>
                            </div>
                        </div>
                        {election && (
                            <>
                                <span className="text-white font-medium">{election.name} ({election.year})</span>
                                <ElectionStatusBadge status={election.status}/>
                            </>
                        )}
                    </div>
                </div>
            </header>


            {/* Main Content - Centered Single Position */}
            <div className="min-h-0 flex-1 w-full p-0 flex flex-col items-center">
                {positions.length > 0 && (() => {
                    const isSubmitCard = currentPositionIndex === positions.length;
                    const position = isSubmitCard ? null : positions[currentPositionIndex];
                    const candidates = position ? (candidatesByPosition[position.id] || []) : [];
                    const selectedVote = position
                        ? selectedVotes.find(v => v.position_id === position.id)
                        : null;

                    return (
                        <div className="flex min-h-0 w-full flex-1 flex-col m-0">
                            {/* Position Card or Submit Card */}
                            {isSubmitCard ? (
                                // Submit Card
                                <div className="flex flex-col lg:flex-row gap-6 max-w-[100%] max-h-[calc(100vh-50px)]">
                                    {/* Left Side - Submit Container (60%) */}
                                    <div className="w-full lg:w-3/5 p-6">
                                        <div className="text-center flex items-center justify-center flex-col">
                                            <p className="text-gray-800 text-base mb-4">Review your selections and
                                                submit when ready.</p>

                                            <div className="mb-4">
                                                <div className="inline-block bg-gray-100 rounded-full px-8 py-4">
                                                    <span className="text-cyan-800 text-7xl font-bold">{timeLeft}</span>
                                                </div>
                                            </div>

                                            <p className="text-gray-600 text-sm mb-6">Votes will be submitted
                                                automatically when time runs out</p>

                                            <button
                                                onClick={handleSubmitVotes}
                                                disabled={submitting}
                                                className="w-full sm:w-auto px-12 py-4 bg-emerald-600 text-white text-xl font-bold rounded-lg hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg submit-button-glow gentle-attention"
                                            >
                                                {submitting ? (
                                                    <>
                                                        <FiLoader className="animate-spin h-6 w-6 inline mr-2"
                                                                  aria-hidden="true"/>
                                                        Submitting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <FiCheckCircle className="w-6 h-6 inline mr-2"
                                                                       aria-hidden="true"/>
                                                        Submit Now
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Right Side - Vote Summary (40%) */}
                                    <div
                                        className="w-full lg:w-2/5 flex flex-wrap justify-center gap-3 overflow-y-auto p-4 bg-gray-50 rounded-xl">
                                        {selectedVotes.map((vote) => {
                                            const positionIndex = positions.findIndex(p => p.id === vote.position_id);
                                            return (
                                                <div key={vote.position_id} className="flex flex-col items-center">
                                                    <h4 className="font-bold text-gray-800 text-center mb-2 text-xs">{vote.position_name}</h4>
                                                    {vote.choice !== 'candidate' && (
                                                        <span className="mb-2 text-xs font-semibold text-cyan-800">
                                                            {vote.choice === 'yes' ? 'Yes' : 'No'}
                                                        </span>
                                                    )}
                                                    {vote.candidate_photo ? (
                                                        <img
                                                            src={vote.candidate_photo}
                                                            alt={vote.candidate_name}
                                                            className="w-23 h-23 rounded-full object-cover mb-2 border-2 border-green-500"
                                                        />
                                                    ) : (
                                                        <div
                                                            className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center mb-2 border-2 border-green-500">
                                                            <span className="text-lg font-bold text-gray-500">
                                                                {vote.candidate_name.charAt(0)}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            setIsChangingVote(true);
                                                            setCurrentPositionIndex(positionIndex);
                                                        }}
                                                        className="px-3 py-1 bg-cyan-700 text-white text-xs rounded-sm hover:bg-cyan-800 transition"
                                                    >
                                                        Change
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                // Position Card
                                <div
                                    className="flex w-full min-h-0 flex-1 flex-col">
                                    {/* Position Header */}
                                    <div className="px-2 sm:px-6 mt-2">
                                        <div
                                            className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-3">
                                            <div className="flex justify-center">
                                                <h3 className="text-2xl  font-bold">{position?.name}</h3>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Candidates - Centered with fit width */}
                                    <div className="p-3 sm:p-1 flex flex-1 items-center justify-center min-h-0">
                                        {candidates.length > 0 ? (
                                            <div className="flex w-full items-center justify-center">
                                                <div
                                                    className="inline-flex flex-wrap items-start justify-center gap-4">
                                                    {position?.voting_mode === 'yes_no' ? (
                                                        // One candidate remains one card; the two choices live in its vote control.
                                                        (() => {
                                                            const candidate = candidates[0];
                                                            const selectedChoice = selectedVote?.choice === 'yes' || selectedVote?.choice === 'no'
                                                                ? selectedVote.choice
                                                                : null;

                                                            return (
                                                                <div
                                                                    role="group"
                                                                    aria-label={`Approval choice for ${candidate.student_name}`}
                                                                    className={`flex-none flex relative flex-col items-center p-4 sm:p-3 rounded-sm shadow-lg transition-all w-[165px] sm:w-[190px] h-[250px] ${
                                                                        selectedChoice
                                                                            ? 'bg-emerald-50 ring-1 ring-emerald-500 shadow-md'
                                                                            : 'border border-cyan-600 hover:border-blue-300 hover:bg-cyan-100 hover:shadow-md'
                                                                    }`}
                                                                >
                                                                    {/* Candidate Photo */}
                                                                    <div
                                                                        className="w-23 h-23 md:w-35 md:h-35 mt-0 rounded-full overflow-hidden bg-gray-100 mb-3 flex items-center justify-center border-2 border-white shadow relative">
                                                                        {candidate.photo_url ? (
                                                                            <img
                                                                                src={candidate.photo_url}
                                                                                alt={candidate.student_name}
                                                                                className="w-full h-full object-cover"
                                                                            />
                                                                        ) : (
                                                                            <span
                                                                                className="text-3xl font-bold text-gray-400">
                                                                                {candidate.student_name.charAt(0)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex absolute top-0 right-1">
                                                                        <div
                                                                            className="text-cyan-700 font-bold text-5xl">{candidate.ballot_number}</div>
                                                                    </div>

                                                                    {/* Candidate Name */}
                                                                    <h4 className="text-sm font-semibold text-gray-800 text-center line-clamp-2 h-10">
                                                                        {candidate.student_name}
                                                                    </h4>

                                                                    {/* Approval choices use the same vote-indicator treatment as candidate cards. */}
                                                                    <div role="radiogroup" aria-label="Approval choices"
                                                                         className="flex gap-2 w-full">
                                                                        {(['yes', 'no'] as const).map(choice => {
                                                                            const isSelected = selectedChoice === choice;
                                                                            const ChoiceIcon = choice === 'yes' ? FiThumbsUp : FiThumbsDown;
                                                                            const label = choice === 'yes' ? 'Yes' : 'No';

                                                                            return (
                                                                                <button
                                                                                    key={choice}
                                                                                    type="button"
                                                                                    role="radio"
                                                                                    aria-checked={isSelected}
                                                                                    disabled={submitting}
                                                                                    aria-label={`${label}, ${candidate.student_name}`}
                                                                                    onClick={() => position && handleSelectApproval(position.id, choice)}
                                                                                    className={`flex-1 py-2 px-2 rounded-sm text-sm font-medium flex items-center justify-center gap-1 transition-colors duration-200 ${
                                                                                        isSelected
                                                                                            ? 'bg-emerald-600 text-white'
                                                                                            : 'bg-cyan-700 hover:bg-emerald-600 text-white'
                                                                                    }`}
                                                                                >
                                                                                    {isSelected ? (
                                                                                        <>
                                                                                            <FiCheck className="w-4 h-4"
                                                                                                     aria-hidden="true"/>
                                                                                            {label}
                                                                                        </>
                                                                                    ) : (
                                                                                        <>
                                                                                            <ChoiceIcon
                                                                                                className="w-4 h-4"
                                                                                                aria-hidden="true"/>
                                                                                            {label}
                                                                                        </>
                                                                                    )}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()
                                                    ) : (
                                                        // Normal multi-candidate voting mode
                                                        candidates.map((candidate) => {
                                                            const isSelected = selectedVote?.candidate_id === candidate.id;

                                                            return (
                                                                <div
                                                                    role="radio"
                                                                    tabIndex={submitting ? -1 : 0}
                                                                    aria-disabled={submitting}
                                                                    aria-checked={isSelected}
                                                                    aria-label={`${candidate.ballot_number}: ${candidate.student_name}`}
                                                                    key={candidate.id}
                                                                    className={`flex-none flex relative flex-col items-center p-2 sm:p-3 rounded-sm shadow-lg transition-all w-[175px] sm:w-[190px] h-[250px] cursor-pointer ${
                                                                        isSelected
                                                                            ? 'bg-emerald-50 ring-1 ring-emerald-500 shadow-md'
                                                                            : 'border border-cyan-600 hover:border-blue-300 hover:bg-cyan-100 hover:shadow-md'
                                                                    }`}
                                                                    onClick={() => position && handleSelectCandidate(position.id, candidate)}
                                                                    onKeyDown={event => {
                                                                        if (!submitting && (event.key === 'Enter' || event.key === ' ')) {
                                                                            event.preventDefault();
                                                                            if (position) handleSelectCandidate(position.id, candidate);
                                                                        }
                                                                    }}
                                                                >

                                                                    {/* Candidate Photo */}
                                                                    <div
                                                                        className="w-28 h-28 md:w-32 md:h-32 mt-0 rounded-full overflow-hidden bg-gray-100 mb-3 flex items-center justify-center border-2 border-white shadow relative">
                                                                        {candidate.photo_url ? (
                                                                            <img
                                                                                src={candidate.photo_url}
                                                                                alt={candidate.student_name}
                                                                                className="w-full h-full object-cover"
                                                                            />
                                                                        ) : (
                                                                            <span
                                                                                className="text-3xl font-bold text-gray-400">
                                                                                {candidate.student_name.charAt(0)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex absolute top-0 right-1">
                                                                        <div
                                                                            className="text-cyan-700 font-bold text-5xl">{candidate.ballot_number}</div>
                                                                    </div>

                                                                    {/* Candidate Name */}
                                                                    <h4 className="text-sm font-semibold text-gray-800 text-center mb-3 line-clamp-2 h-10">
                                                                        {candidate.student_name}
                                                                    </h4>

                                                                    {/* Vote Indicator */}
                                                                    <div
                                                                        className={`w-full py-2 px-4 rounded-sm text-sm font-medium flex items-center justify-center gap-2 transition-colors duration-200 ${
                                                                            isSelected
                                                                                ? 'bg-emerald-600 text-white'
                                                                                : 'bg-cyan-700 hover:bg-emerald-600 text-white'
                                                                        }`}>
                                                                        {isSelected ? (
                                                                            <>
                                                                                <FiCheck className="w-4 h-4"
                                                                                         aria-hidden="true"/>
                                                                                Selected
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <FiThumbsUp className="w-4 h-4"
                                                                                            aria-hidden="true"/>
                                                                                Vote
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 text-gray-500">
                                                <FiUserPlus className="mx-auto h-12 w-12 text-gray-400"
                                                            aria-hidden="true"/>
                                                <p className="mt-2">No candidates for this position</p>
                                            </div>
                                        )}

                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <p className="text-sm text-red-700">{error}</p>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
