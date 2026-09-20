import {FiBarChart2, FiCalendar, FiCheckCircle, FiList, FiUsers} from 'react-icons/fi';

import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import StatisticCard from '../../components/StatisticCard';
import {useDashboardStatsForElections} from '../../queries/useDashboard.ts';
import {useElections} from '../../queries/useElections';
import {useAuth} from '../../hooks/useAuth';

function formatDateTime(value: string | undefined) {
    if (!value) return 'Not set';

    return new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}


export default function Dashboard() {
    const {user} = useAuth();
    const electionsQuery = useElections();
    const elections = electionsQuery.data ?? [];

    const visibleElections = user?.role === 'staff' ? elections : elections.filter(election => election.is_active);
    const visibleElectionIds = visibleElections.map(election => election.id);

    const statsQueries = useDashboardStatsForElections(visibleElectionIds);
    const stats = visibleElections.length
        ? statsQueries.statsByElectionId.get(visibleElections[0].id)
        : undefined;

    const initialLoading =
        electionsQuery.isLoading ||
        (visibleElections.length > 0 && statsQueries.isLoading);

    const queryError = electionsQuery.isError;

    const retry = () => {
        void electionsQuery.refetch();

        statsQueries.queries.forEach(query => void query.refetch());
    };

    const metricValue = (value: number | undefined) => value ?? '—';

    return (
        <div className="dashboard-page">
            {queryError ? (
                <ErrorState
                    title="Dashboard unavailable"
                    message="We could not load the current election overview."
                    action={
                        <button
                            type="button"
                            className="ui-button ui-button--secondary ui-button--compact"
                            onClick={retry}
                        >
                            Try again
                        </button>
                    }
                />
            ) : initialLoading ? (
                <section
                    className="dashboard-grid"
                    aria-label="Loading dashboard statistics"
                >
                    <LoadingSkeleton
                        lines={3}
                        className="dashboard-skeleton-card"
                    />
                    <LoadingSkeleton
                        lines={3}
                        className="dashboard-skeleton-card"
                    />
                    <LoadingSkeleton
                        lines={3}
                        className="dashboard-skeleton-card"
                    />
                    <LoadingSkeleton
                        lines={3}
                        className="dashboard-skeleton-card"
                    />
                    <LoadingSkeleton
                        lines={3}
                        className="dashboard-skeleton-card"
                    />
                    <LoadingSkeleton
                        lines={3}
                        className="dashboard-skeleton-card"
                    />
                </section>
            ) : (
                <>
                    <section
                        className="dashboard-grid"
                        aria-label="Election statistics"
                    >
                        <StatisticCard
                            label="Registered voters"
                            value={metricValue(stats?.total_students)}
                            icon={<FiUsers/>}
                            status="primary"
                            layout="split"
                        />

                        <StatisticCard
                            label="Activated voters"
                            value={metricValue(stats?.active_students)}
                            icon={<FiCheckCircle/>}
                            status="success"
                            layout="split"
                        />

                        <StatisticCard
                            label="Voters voted"
                            value={metricValue(stats?.voted_students)}
                            icon={<FiBarChart2/>}
                            status="strong"
                            layout="split"
                        />

                        <StatisticCard
                            label="Pending activations"
                            value={metricValue(stats?.pending_activations)}
                            icon={<FiUsers/>}
                            status="warning"
                            layout="split"
                        />

                        <StatisticCard
                            label="Positions"
                            value={metricValue(stats?.total_positions)}
                            icon={<FiList/>}
                            status="info"
                            layout="split"
                        />

                        <StatisticCard
                            label="Candidates"
                            value={metricValue(stats?.total_candidates)}
                            icon={<FiUsers/>}
                            status="accent"
                            layout="split"
                        />
                    </section>

                    <section
                        className="dashboard-section"
                        aria-labelledby="active-elections-heading"
                    >
                        <div className="dashboard-section-heading">
                            <div>
                                <p className="dashboard-kicker">{user?.role === 'staff' ? 'Assigned election' : 'Active elections'}</p>
                            </div>
                        </div>

                        {visibleElections.length ? (
                            <div className="active-election-list">
                                {visibleElections.map(election => {
                                    const electionStats = statsQueries.statsByElectionId.get(election.id);
                                    const electionStatsQuery = statsQueries.queries[visibleElectionIds.indexOf(election.id)];
                                    return <article className="active-election-card" key={election.id}>
                                        <div className="active-election-header">
                                                <FiCalendar className="active-election-icon" aria-hidden="true"/>
                                                <div>
                                                    <h3>{election.name}</h3>
                                                    <p>Election year {election.year}</p>
                                                    <p>{election.is_active ? 'Active' : 'Inactive'}</p>
                                                </div>
                                            </div>
                                            {electionStatsQuery?.isError ?
                                                <p className="active-election-error" role="alert">Statistics unavailable
                                                    for this election.</p> : <dl className="active-election-details">
                                                    <div className="election-detail-card election-detail-card--opens">
                                                        <span className="election-detail-strip" aria-hidden="true"/>
                                                        <div className="election-detail-content">
                                                            <dt>Voting opens</dt>
                                                            <dd>{formatDateTime(election.start_time)}</dd>
                                                        </div>
                                                    </div>
                                                    <div className="election-detail-card election-detail-card--closes">
                                                        <span className="election-detail-strip" aria-hidden="true"/>
                                                        <div className="election-detail-content">
                                                            <dt>Voting closes</dt>
                                                            <dd>{formatDateTime(election.end_time)}</dd>
                                                        </div>
                                                    </div>
                                                    <div className="election-detail-card election-detail-card--voted">
                                                        <span className="election-detail-strip" aria-hidden="true"/>
                                                        <div className="election-detail-content">
                                                            <dt>Voters voted</dt>
                                                            <dd>{metricValue(electionStats?.voted_students)}</dd>
                                                        </div>
                                                    </div>
                                                    <div className="election-detail-card election-detail-card--pending">
                                                        <span className="election-detail-strip" aria-hidden="true"/>
                                                        <div className="election-detail-content">
                                                            <dt>Pending activations</dt>
                                                            <dd>{metricValue(electionStats?.pending_activations)}</dd>
                                                        </div>
                                                    </div>
                                                </dl>}
                                    </article>;
                                })}
                            </div>
                        ) : (
                            <EmptyState
                                title={user?.role === 'staff' ? 'Assigned election unavailable' : 'No active elections'}
                                message={user?.role === 'staff' ? 'Your assigned election could not be found.' : 'Activate an election to see voter activity and election statistics here.'}
                                icon={<FiCalendar/>}
                            />
                        )}
                    </section>
                </>
            )}
        </div>
    );
}
