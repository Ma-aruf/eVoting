import {useEffect, useState} from 'react';
import {
    FiAward,
    FiBarChart2,
    FiChevronLeft,
    FiChevronRight,
    FiClipboard,
    FiDownload,
    FiMonitor,
    FiRefreshCw,
    FiUsers
} from 'react-icons/fi';
import StatisticCard from '../../components/StatisticCard';
import {useElections} from '../../queries/useElections';
import {useAuth} from '../../hooks/useAuth';
import {useResults} from '../../queries/useResults';
import {showError} from '../../utils/toast';
import {downloadElectionResultsCsv} from '../../utils/exportElectionResults';
import {useNavigate} from 'react-router-dom';

export default function ResultsPage() {
    const navigate = useNavigate();
    const {user} = useAuth();
    const isScopedRole = user?.role === 'staff' || user?.role === 'activator';
    const [currentPositionIndex, setCurrentPositionIndex] = useState(0);
    const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);

    // Queries
    const {data: elections = [], isLoading: electionsLoading} = useElections({refetchInterval: 45_000});
    const defaultElectionId = elections.find(election => election.voting_open)?.id ?? elections[0]?.id ?? null;
    const effectiveElectionId = isScopedRole
        ? user?.assignedElection?.id ?? null
        : selectedElectionId ?? defaultElectionId;
    const {data: results, isLoading: resultsLoading, error: resultsError} = useResults(effectiveElectionId);

    // Combined loading state
    const loading = electionsLoading || resultsLoading;

    // Show error as toast
    useEffect(() => {
        if (resultsError) {
            showError(resultsError.message || 'Failed to load election results.');
        }
    }, [resultsError]);

    if (loading && !results) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="bg-white/20 px-6 py-4 rounded-lg shadow-md flex items-center gap-3 mx-auto">
                        <div
                            className="w-6 h-6 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin"></div>
                        <span className="text-sm text-gray-700">Loading results…</span>
                    </div>
                </div>
            </div>
        );
    }

    const currentPosition = results?.positions?.[currentPositionIndex];
    // const selectedElection = elections.find(election => election.id === effectiveElectionId);

    return (
        <div className="results-page">
            {/* Election Selector */}
            <div className="results-election-context__inner">
                {isScopedRole ? (
                    <span className="results-election-select" aria-label="Assigned election">
                        {elections.find(election => election.id === effectiveElectionId)?.name ?? 'Assigned election unavailable'}
                    </span>
                ) : <select
                    value={effectiveElectionId ?? ''}
                    onChange={(e) => {
                        setCurrentPositionIndex(0);
                        setSelectedElectionId(e.target.value ? Number(e.target.value) : null);
                    }}
                    className="results-election-select"
                    disabled={loading}
                >
                    <option value="">Select an election...</option>
                    {elections.map((election) => (
                        <option key={election.id} value={election.id}>
                            {election.name} ({election.year})
                        </option>
                    ))}
                </select>}
                <div className="results-actions">
                    {effectiveElectionId && (
                        <button
                            type="button"
                            onClick={() => navigate(`/admin/live-results?election=${effectiveElectionId}`)}
                            className="ui-button ui-button--primary"
                        >
                            <FiMonitor className="w-4 h-4 mr-2" aria-hidden="true"/>
                            Live Results
                        </button>
                    )}
                    <button
                        onClick={() => results && downloadElectionResultsCsv(results)}
                        className="ui-button ui-button--success"
                    >
                        <FiDownload className="w-4 h-4 mr-2" aria-hidden="true"/>
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Results Content */}
            <div className="relative">
                {resultsLoading && results && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl">
                        <div className="bg-white/20 px-6 py-4 rounded-lg shadow-md flex items-center gap-3">
                            <div
                                className="w-6 h-6 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin"></div>
                            <span className="text-sm text-gray-700">Loading results…</span>
                        </div>
                    </div>
                )}
                {results ? (
                    <div className="space-y-6">
                        {/* Election Summary */}
                        <section className="results-summary-grid">
                            <StatisticCard
                                label="Total voters"
                                value={results.total_voters.toLocaleString()}
                                icon={<FiUsers/>}
                                status="primary"
                                layout="split"
                            />
                            <StatisticCard
                                label="Voters voted"
                                value={results.voters_voted.toLocaleString()}
                                icon={<FiBarChart2/>}
                                status="strong"
                                layout="split"
                            />
                            <StatisticCard
                                label="Turnout"
                                value={`${results.voter_turnout.toFixed(1)}%`}
                                icon={<FiBarChart2/>}
                                status="success"
                                layout="split"
                            />
                        </section>


                        {/* Current Position Results */}
                        {currentPosition && (
                            <section className="results-position-section">
                                {/* Position Header */}
                                <div className="results-position-header">
                                    <div className="results-position-header__inner">
                                        <div
                                            className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                            <h3 className="shrink-0 text-sm font-semibold text-gray-900">{currentPosition.position_name}</h3>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1  bg-cyan-50 border border-cyan-200">
                                                    <span className="text-xs font-medium ">Total</span>
                                                    <span
                                                        className="text-lg font-bold text-blue-900">{currentPosition.total_votes}</span>
                                                </span>
                                                <span
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200">
                                                    <span className="text-xs font-medium">Voted</span>
                                                    <span
                                                        className="font-bold text-lg text-emerald-900">{currentPosition.total_valid_votes}</span>
                                                </span>
                                                <span
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200">
                                                    <span className="text-xs font-medium ">Skipped</span>
                                                    <span
                                                        className="text-lg font-bold text-amber-900">{currentPosition.skipped_votes}</span>
                                                    <span
                                                        className="text-md font-semibold text-amber-600">({currentPosition.skipped_percentage.toFixed(1)}%)</span>
                                                </span>
                                            </div>
                                        </div>
                                        {results.positions.length > 0 && (
                                            <div
                                                className="results-position-actions">
                                                <button
                                                    onClick={() => setCurrentPositionIndex(prev => Math.max(0, prev - 1))}
                                                    disabled={currentPositionIndex === 0}
                                                    className="ui-button ui-button--secondary"
                                                >
                                                    <FiChevronLeft className="w-5 h-3" aria-hidden="true"/>
                                                    Prev
                                                </button>


                                                <button
                                                    onClick={() => setCurrentPositionIndex(prev => Math.min(results.positions.length - 1, prev + 1))}
                                                    disabled={currentPositionIndex === results.positions.length - 1}
                                                    className="ui-button ui-button--primary"
                                                >
                                                    Next
                                                    <FiChevronRight className="w-5 h-3" aria-hidden="true"/>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                </div>

                                {/* Candidate Cards */}
                                <div className="results-candidate-area">
                                    {currentPosition.voting_mode === 'yes_no' ? (
                                        <div className="flex justify-center">
                                            <div
                                                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                                                {currentPosition.candidates.map((candidate) => {
                                                    const isApproved = currentPosition.approved === true;
                                                    const isRejected = currentPosition.approved === false;

                                                    return (
                                                        <div
                                                            key={candidate.id}
                                                            className={`relative flex flex-col items-center p-2 rounded-none transition-all ${
                                                                isApproved
                                                                    ? 'bg-[#fffaf0] border border-[#d4af37] shadow-sm'
                                                                    : isRejected
                                                                        ? 'bg-red-50 border border-red-200 shadow-sm'
                                                                        : 'bg-white border border-gray-200 shadow-sm'
                                                            }`}
                                                        >
                                                            {/* Status Badge */}
                                                            {isApproved && (
                                                                <span
                                                                    className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#d4af37] text-white shadow-sm"
                                                                    title="Approved"
                                                                    aria-label="Approved"
                                                                >
                                                                    <FiAward aria-hidden="true"/>
                                                                </span>
                                                            )}
                                                            {isRejected && (
                                                                <div className="mb-2">
                                                            <span
                                                                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-600 text-white">
                                                                Rejected
                                                            </span>
                                                                </div>
                                                            )}

                                                            {/* Candidate Photo */}
                                                            <div
                                                                className={`w-28 h-28 rounded-full overflow-hidden mb-4 flex items-center justify-center shadow-lg ${
                                                                    isApproved ? 'ring-4 ring-[#d4af37]' : isRejected ? 'ring-4 ring-red-400' : 'ring-4 ring-[#b8cbea]'
                                                                }`}>
                                                                {candidate.photo_url ? (
                                                                    <img
                                                                        src={candidate.photo_url}
                                                                        alt={candidate.candidate_name}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div
                                                                        className="w-full h-full bg-cyan-700/80 flex items-center justify-center">
                                                                    <span className="text-2xl font-bold text-white">
                                                                    {candidate.candidate_name.charAt(0)}
                                                                </span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Candidate Name */}
                                                            <h4 className="text-sm font-semibold text-gray-800 text-center mb-1">
                                                                {candidate.candidate_name}
                                                            </h4>

                                                            {/* Stats */}
                                                            <div className="w-full space-y-3">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-xs text-gray-600">Yes</span>
                                                                    <span
                                                                        className={`text-lg font-bold text-emerald-900`}>
                                                                        {currentPosition.yes_votes.toLocaleString()}
                                                                    </span>
                                                                    <span
                                                                        className={`text-sm font-semibold text-emerald-700`}>
                                                                        ({((currentPosition.yes_votes / (currentPosition.yes_votes + currentPosition.no_votes)) * 100).toFixed(1)}%)
                                                                    </span>
                                                                </div>

                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-xs text-gray-600">No</span>
                                                                    <span
                                                                        className={`text-lg font-bold text-red-900`}>
                                                                        {currentPosition.no_votes.toLocaleString()}
                                                                    </span>
                                                                    <span
                                                                        className={`text-sm font-semibold text-red-700`}>
                                                                        ({((currentPosition.no_votes / (currentPosition.yes_votes + currentPosition.no_votes)) * 100).toFixed(1)}%)
                                                                    </span>
                                                                </div>

                                                                {/* Progress Bar */}
                                                                <div className="pt-2">
                                                                    <div
                                                                        className="relative w-full bg-gray-200 rounded-full h-3">
                                                                        <span
                                                                            className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-medium text-emerald-700">Yes</span>
                                                                        <div
                                                                            className={`h-3 rounded-full transition-all bg-emerald-500`}
                                                                            style={{width: `${(currentPosition.yes_votes / (currentPosition.yes_votes + currentPosition.no_votes)) * 100}%`}}
                                                                        ></div>
                                                                        <span
                                                                            className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-medium text-red-700">No</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex justify-center">
                                            <div
                                                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                                                {currentPosition.candidates.map((candidate) => {
                                                    const barWidth = candidate.percentage; // Use the actual percentage from data

                                                    // Find highest percentage and check for ties
                                                    const percentages = currentPosition.candidates.map(c => c.percentage);
                                                    const highestPercentage = Math.max(...percentages);
                                                    const candidatesWithHighest = currentPosition.candidates.filter(c => c.percentage === highestPercentage);
                                                    const isRunOff = candidatesWithHighest.length > 1 && candidate.percentage === highestPercentage && highestPercentage > 0;
                                                    const isWinner = candidatesWithHighest.length === 1 && candidate.percentage === highestPercentage && candidate.vote_count > 0;

                                                    return (
                                                        <div
                                                            key={candidate.id}
                                                            className={`relative flex flex-col items-center p-2 rounded-none transition-all ${
                                                                isWinner
                                                                    ? 'bg-[#fffaf0] border border-[#d4af37] shadow-sm'
                                                                    : isRunOff
                                                                        ? 'bg-green-50 border border-green-200 shadow-sm'
                                                                        : 'bg-white border border-gray-200 shadow-sm'
                                                            }`}
                                                        >
                                                            {/* Winner/Run-off Badge */}
                                                            {isWinner && (
                                                                <span
                                                                    className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#d4af37] text-white shadow-sm"
                                                                    title="Winner"
                                                                    aria-label="Winner"
                                                                >
                                                                <FiAward aria-hidden="true"/>
                                                            </span>
                                                            )}
                                                            {isRunOff && (
                                                                <div className="mb-2">
                                                            <span
                                                                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-600 text-white">
                                                                <FiRefreshCw aria-hidden="true"/> Rerun
                                                            </span>
                                                                </div>
                                                            )}

                                                            {/* Candidate Photo */}
                                                            <div
                                                                className={`w-28 h-28 rounded-full overflow-hidden mb-4 flex items-center justify-center shadow-lg ${
                                                                    isWinner ? 'ring-4 ring-[#d4af37]' : isRunOff ? 'ring-4 ring-green-400' : 'ring-4 ring-[#b8cbea]'
                                                                }`}>
                                                                {candidate.photo_url ? (
                                                                    <img
                                                                        src={candidate.photo_url}
                                                                        alt={candidate.candidate_name}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div
                                                                        className="w-full h-full bg-cyan-700/80 flex items-center justify-center">
                                                                    <span className="text-2xl font-bold text-white">
                                                                    {candidate.candidate_name.charAt(0)}
                                                                </span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Candidate Name */}
                                                            <h4 className="text-sm font-semibold text-gray-800 text-center mb-1">
                                                                {candidate.candidate_name}
                                                            </h4>

                                                            {/* Stats */}
                                                            <div className="w-full space-y-3">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-xs text-gray-600">Votes</span>
                                                                    <span
                                                                        className={`text-lg font-bold ${
                                                                            isWinner ? 'text-[#b38728]' : isRunOff ? 'text-green-600' : 'text-[#1d4f91]'
                                                                        }`}>
                                                                {candidate.vote_count.toLocaleString()}
                                                            </span>
                                                                </div>

                                                                <div className="flex justify-between items-center">
                                                                <span
                                                                    className="text-xs text-gray-600">Percentage</span>
                                                                    <span
                                                                        className={`text-sm font-semibold ${
                                                                            isWinner ? 'text-[#b38728]' : isRunOff ? 'text-green-600' : 'text-[#1d4f91]'
                                                                        }`}>
                                                                {candidate.percentage.toFixed(1)}%
                                                            </span>
                                                                </div>

                                                                {/* Progress Bar */}
                                                                <div className="pt-2">
                                                                    <div
                                                                        className={`w-full ${isWinner ? 'bg-[#f5e7b2]' : 'bg-gray-200'} rounded-full h-3`}>
                                                                        <div
                                                                            className={`h-3 rounded-full transition-all ${
                                                                                isWinner ? 'bg-[#d4af37]' : isRunOff ? 'bg-green-500' : 'bg-[#1d4f91]'
                                                                            }`}
                                                                            style={{width: `${barWidth}%`}}
                                                                        ></div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {/* No positions message */}
                        {results.positions.length === 0 && (
                            <div className="results-empty-state">
                                <FiClipboard className="mx-auto h-12 w-12 text-gray-400" aria-hidden="true"/>
                                <h3 className="mt-2 text-sm font-medium text-gray-900">No positions found</h3>
                                <p className="mt-1 text-sm text-gray-500">
                                    This election has no positions with results yet.
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="results-empty-state">
                        <FiClipboard className="mx-auto h-12 w-12 text-gray-400" aria-hidden="true"/>
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No election selected</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            Select an election from the dropdown above to view its results.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
