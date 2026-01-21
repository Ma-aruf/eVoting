import {useEffect, useState} from 'react';
import api from '../apiConfig'; // adjust path as needed

// ────────────────────────────────────────────────
// Interfaces (you can move them to a separate types file)
interface Election {
    id: number;
    name: string;
    year: number;
    is_active: boolean;
}

export interface CandidateResult {
    id: number;
    student_id: string;
    candidate_name: string;
    photo_url?: string;
    vote_count: number;
    percentage: number;
}

export interface PositionResult {
    position_id: number;
    position_name: string;
    display_order: number;
    total_votes: number;
    skipped_votes: number;
    skipped_percentage: number;
    candidates: CandidateResult[];
}

export interface ElectionResult {
    election_id: number;
    election_name: string;
    year: number;
    total_voters: number;
    voters_voted: number;
    voter_turnout: number;
    positions: PositionResult[];
}

// ────────────────────────────────────────────────

export function useElectionResults() {
    const [elections, setElections] = useState<Election[]>([]);
    const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
    const [results, setResults] = useState<ElectionResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch list of elections + auto-select active one
    useEffect(() => {
        let ignore = false;

        const fetchElections = async () => {
            try {
                setLoading(true);
                setError(null);

                const res = await api.get('api/elections/');
                let data = res.data?.results ?? res.data;

                if (!Array.isArray(data)) data = [];

                if (ignore) return;

                setElections(data);

                // Auto-select logic
                const active = data.find((e: Election) => e.is_active);
                if (active) {
                    setSelectedElectionId(active.id);
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
                const resultsRes = await api.get(`api/elections/${selectedElectionId}/results/`);
                const data = resultsRes.data;

                // Map backend response to frontend format
                const finalResult: ElectionResult = {
                    election_id: data.election_id,
                    election_name: data.election_name,
                    year: data.year,
                    total_voters: data.total_students,
                    voters_voted: data.students_who_voted,
                    voter_turnout: data.voter_turnout_percentage,
                    positions: data.positions.map((pos: any) => ({
                        position_id: pos.position_id,
                        position_name: pos.position_name,
                        display_order: pos.display_order,
                        total_votes: pos.total_valid_votes + pos.skipped_votes,
                        skipped_votes: pos.skipped_votes,
                        skipped_percentage: pos.skip_percentage,
                        candidates: pos.candidates.map((cand: any) => ({
                            id: cand.id,
                            student_id: cand.student_id,
                            candidate_name: cand.candidate_name,
                            photo_url: cand.photo_url || undefined,
                            vote_count: cand.vote_count,
                            percentage: cand.percentage
                        }))
                    }))
                };

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
        csvRows.push(['Election', 'Position', 'Candidate', 'Student ID', 'Votes', 'Percentage', 'Skipped Votes', 'Skipped %'].join(','));

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
                    position.skipped_votes,
                    position.skipped_percentage.toFixed(2)
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
                position.skipped_votes,
                position.skipped_percentage.toFixed(2)
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