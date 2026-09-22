import {useEffect, useState} from 'react';
import api from '../apiConfig'; // adjust path as needed
import type {Election} from '../types/election';
import {mapElectionResults, type ElectionResult, type ElectionResultsResponse} from '../queries/useResults';

export type {CandidateResult, ElectionResult, PositionResult} from '../queries/useResults';

// ────────────────────────────────────────────────
// Interfaces (you can move them to a separate types file)
// ────────────────────────────────────────────────

export function useElectionResults() {
    const [elections, setElections] = useState<Election[]>([]);
    const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
    const [results, setResults] = useState<ElectionResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch elections and prefer the currently open one.
    useEffect(() => {
        let ignore = false;

        const fetchElections = async () => {
            try {
                setLoading(true);
                setError(null);

                const res = await api.get<Election[] | {results?: Election[]}>('api/elections/');
                const data = Array.isArray(res.data) ? res.data : res.data.results ?? [];

                if (ignore) return;

                setElections(data);

                // Auto-select logic
                const openElection = data.find(e => e.voting_open);
                if (openElection) {
                    setSelectedElectionId(openElection.id);
                } else if (data.length > 0) {
                    setSelectedElectionId(data[0].id);
                }
            } catch (err) {
                console.error('Failed to load elections', err);
                setError('Failed to load elections.');
            } finally {
                if (!ignore) setLoading(false);
            }
        };

        fetchElections();

        return () => {
            ignore = true;
        };
    }, []);

    // Fetch detailed results when election changes
    useEffect(() => {
        if (!selectedElectionId) {
            setResults(null);
            return;
        }

        let ignore = false;

        const fetchResults = async () => {
            try {
                setLoading(true);
                setError(null);

                // Use single comprehensive endpoint
                const resultsRes = await api.get<ElectionResultsResponse>(`api/elections/${selectedElectionId}/results/`);
                const finalResult = mapElectionResults(resultsRes.data);

                if (!ignore) setResults(finalResult);
            } catch (err) {
                console.error('Results fetch failed', err);
                setError('Failed to load election results.');
            } finally {
                if (!ignore) setLoading(false);
            }
        };

        fetchResults();

        return () => {
            ignore = true;
        };
    }, [selectedElectionId]);

    // Function to export results as CSV
    const exportToCSV = () => {
        if (!results) return;

        const csvRows = [];

        // Header row
        csvRows.push(['Election', 'Position', 'Voting mode', 'Candidate', 'Student ID', 'Votes', 'Percentage', 'Yes', 'No', 'Outcome'].join(','));

        // Data rows
        results.positions.forEach(position => {
            position.candidates.forEach(candidate => {
                csvRows.push([
                    `"${results.election_name}"`,
                    `"${position.position_name}"`,
                    position.voting_mode,
                    `"${candidate.candidate_name}"`,
                    `"${candidate.student_id}"`,
                    candidate.vote_count,
                    candidate.percentage.toFixed(2),
                    position.voting_mode === 'yes_no' ? position.yes_votes : '',
                    position.voting_mode === 'yes_no' ? position.no_votes : '',
                    position.voting_mode === 'yes_no'
                        ? position.approved === true ? 'Approved' : position.approved === false ? 'Rejected' : 'No decision yet'
                        : '',
                ].join(','));
            });

            // Add a row for skipped votes
            csvRows.push([
                `"${results.election_name}"`,
                `"${position.position_name}"`,
                position.voting_mode,
                '"SKIPPED"',
                '""',
                0,
                0,
                '',
                '',
                '',
            ].join(','));
        });

        // Add summary statistics
        csvRows.push([]);
        csvRows.push(['Summary Statistics']);
        csvRows.push(['Total Voters', results.total_voters]);
        csvRows.push(['Voters Voted', results.voters_voted]);
        csvRows.push(['Voter Turnout (%)', results.voter_turnout.toFixed(2)]);

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `election-results-${results.election_name.replace(/\s+/g, '-')}-${results.year}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };



    return {
        elections,
        selectedElectionId,
        setSelectedElectionId,
        exportToCSV,
        results,
        loading,
        error
    };
}
