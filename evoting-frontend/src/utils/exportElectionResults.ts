import type {ElectionResult} from '../queries/useResults';

const csvValue = (value: string | number): string => {
    const text = String(value);
    return `"${text.replace(/"/g, '""')}"`;
};

export function downloadElectionResultsCsv(results: ElectionResult): void {
    const rows: string[][] = [
        ['Election', 'Position', 'Voting mode', 'Candidate', 'Voter ID', 'Votes', 'Percentage', 'Yes', 'No', 'Outcome'],
    ];

    results.positions.forEach(position => {
        position.candidates.forEach(candidate => {
            rows.push([
                results.election_name,
                position.position_name,
                position.voting_mode,
                candidate.candidate_name,
                candidate.student_id,
                String(candidate.vote_count),
                candidate.percentage.toFixed(2),
                position.voting_mode === 'yes_no' ? String(position.yes_votes) : '',
                position.voting_mode === 'yes_no' ? String(position.no_votes) : '',
                position.voting_mode === 'yes_no'
                    ? position.approved === true
                        ? 'Approved'
                        : position.approved === false
                            ? 'Rejected'
                            : 'No decision yet'
                    : '',
            ]);
        });

        rows.push([
            results.election_name,
            position.position_name,
            position.voting_mode,
            'SKIPPED',
            '',
            '0',
            '0',
            '',
            '',
            '',
        ]);
    });

    rows.push(
        [],
        ['Summary Statistics'],
        ['Total Voters', String(results.total_voters)],
        ['Voters Voted', String(results.voters_voted)],
        ['Voter Turnout (%)', results.voter_turnout.toFixed(2)],
    );

    const csvContent = rows.map(row => row.map(csvValue).join(',')).join('\n');
    const blob = new Blob([csvContent], {type: 'text/csv'});
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `election-results-${results.election_name.replace(/\s+/g, '-')}-${results.year}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
}
