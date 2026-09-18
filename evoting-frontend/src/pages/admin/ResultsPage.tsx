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
import {useNavigate} from 'react-router-dom';

export default function ResultsPage() {
    const navigate = useNavigate();
    const {user} = useAuth();
    const isScopedRole = user?.role === 'staff' || user?.role === 'activator';
    const [currentPositionIndex, setCurrentPositionIndex] = useState(0);
    const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);

    // Queries
    const {data: elections = [], isLoading: electionsLoading} = useElections();
    const effectiveElectionId = isScopedRole
        ? user?.assignedElection?.id ?? null
        : selectedElectionId;
    const {data: results, isLoading: resultsLoading, error: resultsError} = useResults(effectiveElectionId);

    // Combined loading state
    const loading = electionsLoading || resultsLoading;

    // Auto-select first election when data loads
    useEffect(() => {
        if (!isScopedRole && elections.length > 0 && !selectedElectionId) {
            const active = elections.find(e => e.is_active);
            if (active) {
                setSelectedElectionId(active.id);
            } else {
                setSelectedElectionId(elections[0].id);
            }
        }
    }, [elections, isScopedRole, selectedElectionId]);

    // Reset position index when results change
    useEffect(() => {
        setCurrentPositionIndex(0);
    }, [results]);

    // Show error as toast
    useEffect(() => {
        if (resultsError) {
            showError(resultsError.message || 'Failed to load election results.');
        }
    }, [resultsError]);

    // Function to export results as CSV
    const exportToCSV = () => {
        if (!results) return;

        const csvRows = [];

        // Header row
        csvRows.push(['Election', 'Position', 'Candidate', 'Voter ID', 'Votes', 'Percentage'].join(','));

        // Data rows
        results.positions.forEach(position => {
            position.candidates.forEach(candidate => {
                csvRows.push([
                    `"${results.election_name}"`,
                    `"${position.position_name}"`,
                    `"${candidate.candidate_name}"`,
                    `"${candidate.student_id}"`,
                    candidate.vote_count,
                    candidate.percentage.toFixed(2),
                ].join(','));
            });

            // Add a row for skipped votes
            csvRows.push([
                `"${results.election_name}"`,
                `"${position.position_name}"`,
                '"SKIPPED"',
                '""',
                0,
                0,
            ].join(','));
        });

        // Add summary statistics
        csvRows.push([]);
        csvRows.push(['Summary Statistics']);
        csvRows.push(['Total Voters', results.total_voters]);
        csvRows.push(['Voters Voted', results.voters_voted]);
        csvRows.push(['Voter Turnout (%)', results.voter_turnout.toFixed(2)]);

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], {type: 'text/csv'});
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `election-results-${results.election_name.replace(/\s+/g, '-')}-${results.year}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

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

    return (
        <div className="results-page">
            {/* Election Selector */}
            <div className="results-election-context__inner">
                {isScopedRole ? (
                    <span className="results-election-select" aria-label="Assigned election">
                        {elections.find(election => election.id === effectiveElectionId)?.name ?? 'Assigned election unavailable'}
                    </span>
                ) : <select
                    value={selectedElectionId || ''}
                    onChange={(e) => setSelectedElectionId(e.target.value ? Number(e.target.value) : null)}
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
                        onClick={exportToCSV}
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
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-900">{currentPosition.position_name}</h3>
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
                                    <div className="flex justify-center">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
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
                                                                <FiAward aria-hidden="true" />
                                                            </span>
                                                        )}
                                                        {isRunOff && (
                                                            <div className="mb-2">
                                                            <span
                                                                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-600 text-white">
                                                                <FiRefreshCw aria-hidden="true"/> Run Off
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
