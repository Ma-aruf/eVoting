import {useEffect, useState} from 'react';
import {useElectionResults} from "../../hooks/useElectionResults.ts";
import {showError} from '../../utils/toast';

export default function ResultsPage() {
    const [currentPositionIndex, setCurrentPositionIndex] = useState(0);

    const {
        elections,
        selectedElectionId,
        setSelectedElectionId,
        exportToCSV,
        results,
        loading,
        error
    } = useElectionResults();

    // Reset position index when results change
    useEffect(() => {
        setCurrentPositionIndex(0);
    }, [results]);

    // Show error as toast
    useEffect(() => {
        if (error) {
            showError(error);
        }
    }, [error]);

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

    const currentPosition = results?.positions?.[currentPositionIndex];

    return (
        <div className="space-y-6">
            <header className="flex mt-0 flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold text-gray-900">Election Results</h1>
                </div>

                <div className="flex w-full md:w-auto items-center">
                    <button
                        onClick={exportToCSV}
                        className="w-full md:w-auto px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg flex items-center justify-center transition"
                    >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                        Export CSV
                    </button>
                </div>
            </header>

            {/* Election Selector */}
            <section className="bg-white p-1 rounded ">
                <div className="flex flex-col  md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="font-medium text-gray-800">Select Election</h2>
                        <p className="text-sm text-gray-500">Choose an election to view results</p>
                    </div>

                    <select
                        value={selectedElectionId || ''}
                        onChange={(e) => setSelectedElectionId(e.target.value ? Number(e.target.value) : null)}
                        className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm w-full md:min-w-[280px] md:w-auto focus:ring-1 focus:ring-blue-100 focus:border-blue-500"
                        disabled={loading}
                    >
                        <option value="">Select an election...</option>
                        {elections.map((election) => (
                            <option key={election.id} value={election.id}>
                                {election.name} ({election.year})
                            </option>
                        ))}
                    </select>
                </div>
            </section>

            {/* Results Content */}
            {results ? (
                <div className="space-y-6">
                    {/* Election Summary - Colorful Cards */}
                    <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div
                            className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-2 h-20 text-white shadow-sm">
                            <p className="text-xs uppercase tracking-wide text-blue-200 mb-1">Election</p>
                            <p className="text-lg font-semibold">{results.election_name}</p>
                            <p className="text-sm text-blue-200">{results.year}</p>
                        </div>

                        <div
                            className="bg-gradient-to-br from-cyan-600 to-cyan-700 rounded-xl p-2 h-20  text-white shadow-sm">
                            <p className="text-xs uppercase tracking-wide text-cyan-200 mb-1">Total Voters</p>
                            <p className="text-3xl font-bold">{results.total_voters.toLocaleString()}</p>
                        </div>

                        <div
                            className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl p-2 h-20  text-white shadow-sm">
                            <p className="text-xs uppercase tracking-wide text-emerald-200 mb-1">Voters Voted</p>
                            <p className="text-3xl font-bold">{results.voters_voted.toLocaleString()}</p>
                        </div>

                        <div
                            className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-2 h-20  text-white shadow-sm">
                            <p className="text-xs uppercase tracking-wide text-purple-200 mb-1">Turnout</p>
                            <p className="text-3xl font-bold">{results.voter_turnout.toFixed(1)}%</p>
                            <div className="w-full bg-white/20 rounded-full h-2 mt-2">
                                <div
                                    className="bg-white h-2 rounded-full"
                                    style={{width: `${Math.min(results.voter_turnout, 100)}%`}}
                                ></div>
                            </div>
                        </div>
                    </section>


                    {/* Current Position Results */}
                    {currentPosition && (
                        <section className="bg-white rounded-xl shadow-lg overflow-hidden">
                            {/* Position Header */}
                            <div className="px-3 py-1 bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-xl">
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="text-blue-200 text-sm">Position {currentPositionIndex + 1} of {results.positions.length}</p>
                                        <h3 className="text-2xl font-bold text-white">{currentPosition.position_name}</h3>
                                    </div>
                                    {results.positions.length > 0 && (
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1 gap-3 rounded-xl p-0">
                                            <button
                                                onClick={() => setCurrentPositionIndex(prev => Math.max(0, prev - 1))}
                                                disabled={currentPositionIndex === 0}
                                                className="flex w-full sm:w-auto justify-center items-center gap-2 px-2 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor"
                                                     viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                          d="M15 19l-7-7 7-7"/>
                                                </svg>
                                                Previous
                                            </button>


                                            <button
                                                onClick={() => setCurrentPositionIndex(prev => Math.min(results.positions.length - 1, prev + 1))}
                                                disabled={currentPositionIndex === results.positions.length - 1}
                                                className="flex w-full sm:w-auto justify-center items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                                            >
                                                Next
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor"
                                                     viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                          d="M9 5l7 7-7 7"/>
                                                </svg>
                                            </button>
                                        </div>
                                    )}
                                </div>

                            </div>

                            {/* Candidate Cards */}
                            <div className="p-5">
                                <div className="flex justify-center">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6  w-full">
                                        {currentPosition.candidates.map((candidate, index) => {
                                            const maxVotes = Math.max(...currentPosition.candidates.map(c => c.vote_count));
                                            const barWidth = maxVotes > 0 ? (candidate.vote_count / maxVotes) * 100 : 0;
                                            const isWinner = index === 0 && candidate.vote_count > 0;

                                            return (
                                                <div
                                                    key={candidate.id}
                                                    className={`flex flex-col items-center p-2 rounded-lg transition-all ${
                                                        isWinner
                                                            ? 'bg-gradient-to-br from-emerald-50 to-green-100 ring-2 ring-green-400 shadow-lg'
                                                            : 'bg-gradient-to-br from-gray-50 to-blue-50 shadow-md hover:shadow-lg'
                                                    }`}
                                                >
                                                    {/* Winner Badge */}
                                                    {isWinner && (
                                                        <div className="mb-2">
                                                            <span
                                                                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-600 text-white">
                                                                🏆 Winner
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Candidate Photo */}
                                                    <div
                                                        className={`w-28 h-28 rounded-full overflow-hidden mb-4 flex items-center justify-center shadow-lg ${
                                                            isWinner ? 'ring-4 ring-green-400' : 'ring-4 ring-blue-200'
                                                        }`}>
                                                        {candidate.photo_url ? (
                                                            <img
                                                                src={candidate.photo_url}
                                                                alt={candidate.candidate_name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div
                                                                className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                                                                <span className="text-4xl font-bold text-white">
                                                                    {candidate.candidate_name.charAt(0)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Candidate Name */}
                                                    <h4 className="text-lg font-semibold text-gray-800 text-center mb-1">
                                                        {candidate.candidate_name}
                                                    </h4>
                                                    <p className="text-sm text-gray-500 mb-4">{candidate.student_id}</p>

                                                    {/* Stats */}
                                                    <div className="w-full space-y-3">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm text-gray-600">Votes</span>
                                                            <span
                                                                className={`text-2xl font-bold ${isWinner ? 'text-green-600' : 'text-blue-600'}`}>
                                                                {candidate.vote_count.toLocaleString()}
                                                            </span>
                                                        </div>

                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm text-gray-600">Percentage</span>
                                                            <span
                                                                className={`text-lg font-semibold ${isWinner ? 'text-green-600' : 'text-blue-600'}`}>
                                                                {candidate.percentage.toFixed(1)}%
                                                            </span>
                                                        </div>

                                                        {/* Progress Bar */}
                                                        <div className="pt-2">
                                                            <div className="w-full bg-gray-200 rounded-full h-3">
                                                                <div
                                                                    className={`h-3 rounded-full transition-all ${isWinner ? 'bg-green-500' : 'bg-blue-500'}`}
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
                        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor"
                                 viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                            </svg>
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No positions found</h3>
                            <p className="mt-1 text-sm text-gray-500">
                                This election has no positions with results yet.
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor"
                         viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No election selected</h3>
                    <p className="mt-1 text-sm text-gray-500">
                        Select an election from the dropdown above to view its results.
                    </p>
                </div>
            )}
        </div>
    );
}
