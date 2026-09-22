import {useEffect, useMemo, useState, type CSSProperties} from 'react';
import {FiAlertCircle, FiClock, FiUsers, FiX} from 'react-icons/fi';
import {useLocation, useNavigate} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';
import {useElections} from '../../queries/useElections';
import {useResults, type CandidateResult} from '../../queries/useResults';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';


function percentage(value: number) {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function candidateOrder(candidate: CandidateResult) {
    return candidate.ballot_number ?? Number.MAX_SAFE_INTEGER;
}

const GOLDEN_ANGLE = 137.508;
const POSITION_HUE_OFFSET = 205;

function positionAccentColor(positionIndex: number) {
    const hue = (POSITION_HUE_OFFSET + positionIndex * GOLDEN_ANGLE) % 360;
    return `hsl(${hue} 68% 48%)`;
}

type CandidateDisplay = {
    candidate: CandidateResult;
    positionName: string;
    accentColor: string;

    approval?: { yesVotes: number; noVotes: number; approved: boolean | null };
};

function CandidateResultBox({candidate, positionName, accentColor, approval}: {
    candidate: CandidateResult;
    positionName: string;
    accentColor: string;
    approval?: { yesVotes: number; noVotes: number; approved: boolean | null };
}) {
    const percent = percentage(candidate.percentage);
    const cardStyle = {
        '--live-result-accent': accentColor,
        '--live-result-angle': `${percent * 3.6}deg`,
    } as CSSProperties;

    return (
        <article className={'live-result-candidate live-result-candidate--emphasis'} style={cardStyle}>
            <p className="live-result-candidate-position">{positionName}</p>
            <div className="live-result-photo-ring"
                 aria-label={`${percent.toFixed(1)} percent of valid votes`}>
                <div className="live-result-photo">
                    {candidate.photo_url ? (
                        <img src={candidate.photo_url} alt={`${candidate.candidate_name} photograph`}/>
                    ) : (
                        <span aria-hidden="true">{candidate.candidate_name.charAt(0).toUpperCase()}</span>
                    )}
                </div>
            </div>
            <h3 className="live-result-candidate-name">{candidate.candidate_name}</h3>
            <div className="live-result-candidate-footer">
                {approval ? (
                    <>
                        <span className="live-result-vote-value">Yes {approval.yesVotes.toLocaleString()}</span>
                        <span className="live-result-percent-value">No {approval.noVotes.toLocaleString()}</span>
                    </>
                ) : (
                    <>
                        <span className="live-result-vote-value">{candidate.vote_count.toLocaleString()}</span>
                        <span className="live-result-percent-value">{percent.toFixed(1)}%</span>
                    </>
                )}
            </div>
        </article>
    );
}

export default function LiveResultsPage() {
    const {user} = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const {
        data: elections = [],
        isLoading: electionsLoading,
        isError: electionsError
    } = useElections({refetchInterval: 45_000});
    const isStaff = user?.role === 'staff';
    const requestedElectionId = new URLSearchParams(location.search).get('election');
    const requestedId = requestedElectionId ? Number(requestedElectionId) : null;
    const effectiveElectionId = isStaff ? user?.assignedElection?.id ?? null : requestedId;
    const election = elections.find(item => item.id === effectiveElectionId);
    const resultsQuery = useResults(effectiveElectionId, {live: true, userId: user?.username ?? null});
    const results = resultsQuery.data;
    const initialLoading = electionsLoading || (resultsQuery.isLoading && !results);
    const lifecycleStatus = results?.status ?? election?.status;
    const electionClosed = lifecycleStatus === 'ended';
    const positions = useMemo(
        () => [...(results?.positions ?? [])].sort((a, b) => a.display_order - b.display_order),
        [results?.positions]
    );
    const candidates = useMemo<CandidateDisplay[]>(() => positions.flatMap((position, positionIndex) => {
        const accentColor = positionAccentColor(positionIndex);
        const ordered = [...position.candidates].sort((a, b) => candidateOrder(a) - candidateOrder(b));
        if (position.voting_mode === 'yes_no') {
            const candidate = ordered[0];
            return candidate ? [{
                candidate,
                positionName: position.position_name,
                accentColor,
                tied: false,
                winner: false,
                approval: {
                    yesVotes: position.yes_votes,
                    noVotes: position.no_votes,
                    approved: position.approved,
                },
            }] : [];
        }
        const highestVotes = Math.max(0, ...ordered.map(candidate => candidate.vote_count));
        const leaders = ordered.filter(candidate => candidate.vote_count === highestVotes && highestVotes > 0);
        const tied = leaders.length > 1;

        return ordered.map(candidate => ({
            candidate,
            positionName: position.position_name,
            accentColor,
            tied: tied && leaders.some(leader => leader.id === candidate.id),
            winner: electionClosed && !tied && leaders[0]?.id === candidate.id,
        }));
    }), [electionClosed, positions]);

    const closePage = () => navigate('/admin/dashboard');
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const formatCurrentTime = () => {
        return currentTime.toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit', second: '2-digit'});
    };

    if (initialLoading) {
        return <main className="live-results-page"><LoadingState title="Loading live results"
                                                                 message="Preparing the strong-room display…"/></main>;
    }

    if (!user || (user.role !== 'superuser' && user.role !== 'staff')) {
        return <main className="live-results-page"><ErrorState title="Access denied"
                                                               message="You do not have permission to view live results."
                                                               action={<button
                                                                   className="ui-button ui-button--secondary ui-button--compact"
                                                                   onClick={closePage}>Return to dashboard</button>}/>
        </main>;
    }

    if (electionsError) {
        return <main className="live-results-page"><ErrorState title="Live results unavailable"
                                                               message="We could not load the permitted election context."
                                                               action={<button
                                                                   className="ui-button ui-button--secondary ui-button--compact"
                                                                   onClick={closePage}>Return to dashboard</button>}/>
        </main>;
    }

    if (!effectiveElectionId || !election) {
        return <main className="live-results-page"><ErrorState title="No election selected"
                                                               message={isStaff ? 'Your assigned election is unavailable.' : 'Return to Election Results and select an election first.'}
                                                               action={<button
                                                                   className="ui-button ui-button--secondary ui-button--compact"
                                                                   onClick={closePage}>Return to dashboard</button>}/>
        </main>;
    }

    if (resultsQuery.isError && !results) {
        return <main className="live-results-page"><ErrorState title="Results unavailable"
                                                               message="The selected election could not be loaded. It may be outside your permitted scope."
                                                               action={<button
                                                                   className="ui-button ui-button--secondary ui-button--compact"
                                                                   onClick={closePage}>Return to dashboard</button>}/>
        </main>;
    }

    return (
        <main className="live-results-page">
            <header className="live-results-header px-2 py-1">
                <div className="live-results-heading">
                    <div>
                        <h1>{results?.election_name ?? election.name}</h1>
                    </div>
                </div>
                <div className="live-results-header-actions">
                    <div className="live-results-header-stats" aria-label="Election summary">
                        <div><span>Eligible</span><strong>{results?.total_voters.toLocaleString() ?? '—'}</strong></div>
                        <div><span>Votes</span><strong>{results?.voters_voted.toLocaleString() ?? '—'}</strong></div>
                        <div><span>Turnout</span><strong>{results?.voter_turnout.toFixed(1) ?? '0.0'}%</strong></div>
                        <div>
                            <span>Remaining</span><strong>{results ? Math.max(0, results.total_voters - results.voters_voted).toLocaleString() : '—'}</strong>
                        </div>
                    </div>
                    <div className="live-results-update" aria-live="polite">
                        <span className="live-results-dot" aria-hidden="true"/>
                        <span>Live</span>
                    </div>
                    <div className="live-results-clock" aria-hidden="true">
                        <FiClock/>{formatCurrentTime()}
                    </div>
                    <button type="button" className="live-results-close" onClick={closePage}
                            aria-label="Return to dashboard" title="Return to dashboard">
                        <FiX aria-hidden="true"/>
                    </button>
                </div>
            </header>

            {resultsQuery.isError && results &&
                <p className="live-results-connection-warning" role="status"><FiAlertCircle
                    aria-hidden="true"/> Connection interrupted. Showing the last successful results.</p>}
            {electionClosed &&
                <p className="live-results-closed" role="status"><FiClock aria-hidden="true"/> Election closed. Winner
                    labels reflect the final aggregate only.</p>}

            {!positions.length ? (
                <section className="live-results-empty"><FiUsers aria-hidden="true"/><h2>No positions found</h2><p>This
                    election does not have any positions yet.</p></section>
            ) : !candidates.length ? (
                <section className="live-results-empty"><FiUsers aria-hidden="true"/><h2>No candidates found</h2><p>The
                    positions in this election do not have candidates yet.</p></section>
            ) : (
                <section className="live-results-candidate-grid" aria-label="Election candidates">
                    {candidates.map(({candidate, positionName, accentColor, approval}) => (
                        <CandidateResultBox
                            key={candidate.id}
                            candidate={candidate}
                            positionName={positionName}
                            accentColor={accentColor}
                            approval={approval}
                        />
                    ))}
                </section>
            )}

            {positions.length > 0 && (
                <aside className="live-results-skip-bar" aria-label="Skipped ballots by position">
                    <strong className="live-results-skip-label">Skipped ballots:</strong>
                    <div className="live-results-skip-list">
                        {positions.map(position => (
                            <span className="live-results-skip-item" key={position.position_id}>
                                <span>{position.position_name}</span>
                                <strong>{position.skipped_votes.toLocaleString()}</strong>
                            </span>
                        ))}
                    </div>
                </aside>
            )}
        </main>
    );
}
