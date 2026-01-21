import { useState } from 'react';
import {useElectionResults} from "../../hooks/useElectionResults.ts";



export default function ResultsPage() {
    const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
    const [showPercentages, setShowPercentages] = useState(true);

    const {
    elections,
    selectedElectionId,
    setSelectedElectionId, exportToCSV,
    results,
    loading,
    error
  } = useElectionResults();



    if (loading && !results) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading election results...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-800">Election Results</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        View detailed voting results with percentages and statistics.
                    </p>
                </div>

                <div className="flex items-center space-x-3">
                    <button
                        onClick={exportToCSV}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg flex items-center"
                    >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export CSV
                    </button>
                </div>
            </header>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
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

            {/* Election Selector */}
            <section className="bg-white border rounded-lg p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="font-medium text-gray-800">Select Election</h2>
                        <p className="text-sm text-gray-500">Choose an election to view results</p>
                    </div>

                    <div className="flex items-center space-x-4">
                        <select
                            value={selectedElectionId || ''}
                            onChange={(e) => setSelectedElectionId(e.target.value ? Number(e.target.value) : null)}
                            className="border rounded-lg px-3 py-2 text-sm min-w-[250px]"
                            disabled={loading}
                        >
                            <option value="">Select an election...</option>
                            {elections.map((election) => (
                                <option key={election.id} value={election.id}>
                                    {election.name} ({election.year}) {election.is_active ? '🚀' : ''}
                                </option>
                            ))}
                        </select>

                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => setViewMode('table')}
                                className={`px-3 py-1 text-sm rounded-lg ${viewMode === 'table' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                            >
                                Table View
                            </button>
                            <button
                                onClick={() => setViewMode('cards')}
                                className={`px-3 py-1 text-sm rounded-lg ${viewMode === 'cards' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                            >
                                Card View
                            </button>
                        </div>
                    </div>
                </div>

                {/* Display Options */}
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                    <div className="flex items-center space-x-4">
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={showPercentages}
                                onChange={(e) => setShowPercentages(e.target.checked)}
                                className="h-4 w-4 text-blue-600 rounded"
                            />
                            <span className="ml-2 text-sm text-gray-700">Show Percentages</span>
                        </label>
                    </div>

                    {results && (
                        <div className="text-sm text-gray-600">
                            Last updated: {new Date().toLocaleString()}
                        </div>
                    )}
                </div>
            </section>

            {/* Results Content */}
            {results ? (
                <div className="space-y-6">
                    {/* Election Summary */}
                    <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white border rounded-lg p-4">
                            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Election</p>
                            <p className="text-lg font-semibold text-gray-800">{results.election_name}</p>
                            <p className="text-sm text-gray-600">{results.year}</p>
                        </div>

                        <div className="bg-white border rounded-lg p-4">
                            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Total Voters</p>
                            <p className="text-2xl font-bold text-blue-600">{results.total_voters.toLocaleString()}</p>
                        </div>

                        <div className="bg-white border rounded-lg p-4">
                            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Voters Voted</p>
                            <p className="text-2xl font-bold text-green-600">{results.voters_voted.toLocaleString()}</p>
                        </div>

                        <div className="bg-white border rounded-lg p-4">
                            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Turnout</p>
                            <p className="text-2xl font-bold text-purple-600">{results.voter_turnout.toFixed(1)}%</p>
                            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                                <div
                                    className="bg-purple-600 h-2 rounded-full"
                                    style={{ width: `${Math.min(results.voter_turnout, 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    </section>

                    {/* Positions Results */}
                    {results.positions.map((position) => (
                        <section key={position.position_id} className="bg-white border rounded-lg overflow-hidden">
                            <div className="bg-gray-50 px-6 py-4 border-b">
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800">{position.position_name}</h3>
                                        <p className="text-sm text-gray-500">
                                            Total Votes: {position.total_votes} •
                                            Skipped: {position.skipped_votes} ({position.skipped_percentage.toFixed(1)}%) •
                                            Valid Votes: {position.total_votes - position.skipped_votes}
                                        </p>
                                    </div>

                                    <div className="mt-2 md:mt-0">
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                                            Position #{position.display_order}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {viewMode === 'table' ? (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Candidate
                                                </th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Student ID
                                                </th>
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Votes
                                                </th>
                                                {showPercentages && (
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Percentage
                                                    </th>
                                                )}
                                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Progress Bar
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {position.candidates.map((candidate, index) => {
                                                const maxVotes = Math.max(...position.candidates.map(c => c.vote_count));
                                                const barWidth = maxVotes > 0 ? (candidate.vote_count / maxVotes) * 100 : 0;
                                                const isWinner = index === 0 && candidate.vote_count > 0;

                                                return (
                                                    <tr
                                                        key={candidate.id}
                                                        className={isWinner ? 'bg-green-50' : ''}
                                                    >
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex items-center">
                                                                <div className="flex-shrink-0 h-10 w-10">
                                                                    {candidate.photo_url ? (
                                                                        <img
                                                                            className="h-10 w-10 rounded-full object-cover"
                                                                            src={candidate.photo_url}
                                                                            alt={candidate.candidate_name}
                                                                        />
                                                                    ) : (
                                                                        <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                                                            <span className="text-gray-500 font-medium">
                                                                                {candidate.candidate_name.charAt(0)}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="ml-4">
                                                                    <div className="text-sm font-medium text-gray-900">
                                                                        {candidate.candidate_name}
                                                                        {isWinner && (
                                                                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                                                                🏆 Winner
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                            {candidate.student_id}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm font-semibold text-gray-900">
                                                                {candidate.vote_count.toLocaleString()}
                                                            </div>
                                                        </td>
                                                        {showPercentages && (
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="text-sm text-gray-900">
                                                                    {candidate.percentage.toFixed(2)}%
                                                                </div>
                                                            </td>
                                                        )}
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex items-center">
                                                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                                                    <div
                                                                        className={`h-2.5 rounded-full ${isWinner ? 'bg-green-600' : 'bg-blue-600'}`}
                                                                        style={{ width: `${barWidth}%` }}
                                                                    ></div>
                                                                </div>
                                                                <span className="ml-3 text-xs text-gray-500">
                                                                    {barWidth.toFixed(0)}%
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}

                                            {/* Skipped Votes Row */}
                                            {position.skipped_votes > 0 && (
                                                <tr className="bg-yellow-50">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center">
                                                            <div className="flex-shrink-0 h-10 w-10">
                                                                <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                                                                    <svg className="h-5 w-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                    </svg>
                                                                </div>
                                                            </div>
                                                            <div className="ml-4">
                                                                <div className="text-sm font-medium text-gray-900">
                                                                    Skipped / Abstained
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        —
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm font-semibold text-yellow-700">
                                                            {position.skipped_votes.toLocaleString()}
                                                        </div>
                                                    </td>
                                                    {showPercentages && (
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm text-yellow-700">
                                                                {position.skipped_percentage.toFixed(2)}%
                                                            </div>
                                                        </td>
                                                    )}
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center">
                                                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                                                                <div
                                                                    className="h-2.5 rounded-full bg-yellow-500"
                                                                    style={{
                                                                        width: `${position.skipped_percentage}%`
                                                                    }}
                                                                ></div>
                                                            </div>
                                                            <span className="ml-3 text-xs text-yellow-600">
                                                                {position.skipped_percentage.toFixed(0)}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                // Card View
                                <div className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {position.candidates.map((candidate, index) => {
                                            const maxVotes = Math.max(...position.candidates.map(c => c.vote_count));
                                            const barWidth = maxVotes > 0 ? (candidate.vote_count / maxVotes) * 100 : 0;
                                            const isWinner = index === 0 && candidate.vote_count > 0;
                                            const validVotes = position.total_votes - position.skipped_votes;
                                            const percentageOfTotal = position.total_votes > 0
                                                ? (candidate.vote_count / position.total_votes) * 100
                                                : 0;

                                            return (
                                                <div
                                                    key={candidate.id}
                                                    className={`border rounded-lg p-4 ${isWinner ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}
                                                >
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex items-center">
                                                            <div className="flex-shrink-0 h-12 w-12">
                                                                {candidate.photo_url ? (
                                                                    <img
                                                                        className="h-12 w-12 rounded-full object-cover"
                                                                        src={candidate.photo_url}
                                                                        alt={candidate.candidate_name}
                                                                    />
                                                                ) : (
                                                                    <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                                                                        <span className="text-gray-500 font-medium">
                                                                            {candidate.candidate_name.charAt(0)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="ml-4">
                                                                <h4 className="text-sm font-semibold text-gray-900">
                                                                    {candidate.candidate_name}
                                                                </h4>
                                                                <p className="text-xs text-gray-500">
                                                                    {candidate.student_id}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {isWinner && (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                                                Winner
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="mt-4 space-y-2">
                                                        <div className="flex justify-between text-sm">
                                                            <span className="text-gray-600">Votes:</span>
                                                            <span className="font-semibold">{candidate.vote_count}</span>
                                                        </div>

                                                        {showPercentages && (
                                                            <>
                                                                <div className="flex justify-between text-sm">
                                                                    <span className="text-gray-600">Of Valid Votes:</span>
                                                                    <span className="font-semibold">{candidate.percentage.toFixed(1)}%</span>
                                                                </div>
                                                                <div className="flex justify-between text-sm">
                                                                    <span className="text-gray-600">Of Total Votes:</span>
                                                                    <span className="font-semibold">{percentageOfTotal.toFixed(1)}%</span>
                                                                </div>
                                                            </>
                                                        )}

                                                        <div className="pt-2">
                                                            <div className="w-full bg-gray-200 rounded-full h-2">
                                                                <div
                                                                    className={`h-2 rounded-full ${isWinner ? 'bg-green-600' : 'bg-blue-600'}`}
                                                                    style={{ width: `${barWidth}%` }}
                                                                ></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Skipped Votes Card */}
                                        {position.skipped_votes > 0 && (
                                            <div className="border border-yellow-200 rounded-lg p-4 bg-yellow-50">
                                                <div className="flex items-center">
                                                    <div className="flex-shrink-0 h-12 w-12 bg-yellow-100 rounded-full flex items-center justify-center">
                                                        <svg className="h-6 w-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </div>
                                                    <div className="ml-4">
                                                        <h4 className="text-sm font-semibold text-gray-900">
                                                            Skipped / Abstained
                                                        </h4>
                                                        <p className="text-xs text-gray-500">
                                                            Voters who skipped this position
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="mt-4 space-y-2">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-gray-600">Skipped Votes:</span>
                                                        <span className="font-semibold text-yellow-700">{position.skipped_votes}</span>
                                                    </div>

                                                    {showPercentages && (
                                                        <div className="flex justify-between text-sm">
                                                            <span className="text-gray-600">Percentage:</span>
                                                            <span className="font-semibold text-yellow-700">{position.skipped_percentage.toFixed(1)}%</span>
                                                        </div>
                                                    )}

                                                    <div className="pt-2">
                                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                                            <div
                                                                className="h-2 rounded-full bg-yellow-500"
                                                                style={{ width: `${position.skipped_percentage}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </section>
                    ))}

                    {/* No Results Message */}
                    {results.positions.length === 0 && (
                        <div className="bg-white border rounded-lg p-8 text-center">
                            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <h3 className="mt-4 text-lg font-medium text-gray-900">No voting data available</h3>
                            <p className="mt-2 text-sm text-gray-500">
                                No votes have been recorded for this election yet, or there are no positions configured.
                            </p>
                        </div>
                    )}
                </div>
            ) : !loading && (
                <div className="bg-white border rounded-lg p-8 text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-gray-900">No election selected</h3>
                    <p className="mt-2 text-sm text-gray-500">
                        Select an election from the dropdown above to view results.
                    </p>
                </div>
            )}
        </div>
    );
}