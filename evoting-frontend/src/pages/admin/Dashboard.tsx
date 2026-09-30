import {Link} from 'react-router-dom';
import {
    Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
    Tooltip, XAxis, YAxis,
} from 'recharts';
import {FiActivity, FiBarChart2, FiCheckCircle, FiClock, FiUsers} from 'react-icons/fi';

import StatisticCard from '../../components/StatisticCard';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import {useAuth} from '../../hooks/useAuth';
import {useOperationsDashboard, type OperationsMetrics} from '../../queries/useDashboard';

const CHART_COLORS = {
    voted: '#178a55',
    remaining: '#dfe5ee',
    active: '#2563b8',
    pending: '#d39a28',
    sent: '#178a55',
    failed: '#c62828',
    generated: '#2563b8',
};

function DonutChart({
                        title,
                        segments,
                    }: {
    title: string;
    segments: { name: string; value: number; color: string }[];
}) {
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);

    return (
        <div className="dashboard-chart-block">
            <h3>{title}</h3>
            {total ? (
                <div className="dashboard-donut-layout">
                    <div className="dashboard-donut" role="img"
                         aria-label={segments.map(segment => `${segment.name}: ${segment.value}`).join(', ')}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={segments} dataKey="value" nameKey="name" innerRadius="59%" outerRadius="85%"
                                     stroke="none" isAnimationActive={false}>
                                    {segments.map(segment => <Cell key={segment.name} fill={segment.color}/>)}
                                </Pie>
                                <Tooltip formatter={value => Number(value ?? 0).toLocaleString()}/>
                            </PieChart>
                        </ResponsiveContainer>
                        <strong className="dashboard-donut-total">{total.toLocaleString()}</strong>
                    </div>
                    <ul className="dashboard-chart-legend">
                        {segments.map(segment => (
                            <li key={segment.name}>
                                <span className="dashboard-legend-swatch" style={{backgroundColor: segment.color}}
                                      aria-hidden="true"/>
                                <span>{segment.name}</span>
                                <strong>{segment.value.toLocaleString()}</strong>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : <p className="dashboard-chart-empty">No activity recorded yet.</p>}
        </div>
    );
}

function MetricCards({totals}: { totals: OperationsMetrics }) {
    const cards = [
        {
            label: 'Total voters',
            value: totals.total_voters.toLocaleString(),
            icon: <FiUsers/>,
            status: 'primary' as const
        },
        {
            label: 'Active voters',
            value: totals.active_voters.toLocaleString(),
            icon: <FiCheckCircle/>,
            status: 'success' as const
        },
        {
            label: 'Voters voted',
            value: totals.voters_voted.toLocaleString(),
            icon: <FiBarChart2/>,
            status: 'strong' as const
        },
        {
            label: 'Yet to activate',
            value: totals.yet_to_activate.toLocaleString(),
            icon: <FiClock/>,
            status: 'warning' as const
        },
        {
            label: 'Turnout',
            value: `${totals.turnout_percentage.toFixed(1)}%`,
            icon: <FiActivity/>,
            status: 'info' as const
        },
    ];

    return (
        <section className="dashboard-grid" aria-label="Election statistics">
            {cards.map(card => (
                <StatisticCard key={card.label} {...card} layout="split" style={{height: '4.5rem', width: '100%'}}/>
            ))}
        </section>
    );
}

export default function Dashboard() {
    const {user} = useAuth();
    const operations = useOperationsDashboard();
    const data = operations.data;
    const elections = data?.elections ?? [];
    const totals = data?.totals;
    const smsElections = elections.filter(election => election.voter_login_mode === 'sms_pin');
    const smsTotals = smsElections.reduce((summary, election) => ({
        sent: summary.sent + election.sms_sent,
        failed: summary.failed + election.sms_failed,
        generated: summary.generated + election.sms_generated,
    }), {sent: 0, failed: 0, generated: 0});

    if (operations.isLoading) {
        return <div className="dashboard-page">
            <section className="dashboard-grid" aria-label="Loading dashboard statistics">
                {Array.from({length: 5}, (_, index) => <LoadingSkeleton key={index} lines={2}
                                                                        className="dashboard-skeleton-card"/>)}
            </section>
        </div>;
    }

    if (operations.isError || !totals) {
        return <div className="dashboard-page">
            <ErrorState
                title="Dashboard unavailable"
                message="We could not load the current election overview."
                action={<Button type="button" variant="secondary" size="compact"
                                onClick={() => void operations.refetch()}>Try again</Button>}
            />
        </div>;
    }

    return (
        <div className="dashboard-page">
            <div className="dashboard-context">
                <h1>{user?.role === 'superuser' ? 'Election operations' : user?.assignedElection?.name ?? 'Election operations'}</h1>
                <span>{user?.role === 'superuser' ? 'All open and paused elections' : 'Assigned election'}</span>
            </div>

            <MetricCards totals={totals}/>

            {elections.length ? <>
                <section className="dashboard-operations" aria-label="Operational activity">
                    <div><span>Logged in now</span><strong>{totals.logged_in_voters.toLocaleString()}</strong></div>
                    <div><span>Failed logins</span><strong>{totals.failed_logins.toLocaleString()}</strong></div>
                    <div><span>Expired sessions</span><strong>{totals.expired_sessions.toLocaleString()}</strong></div>
                    <div><span>SMS failures</span><strong>{totals.sms_failed.toLocaleString()}</strong></div>
                </section>

                <section className="dashboard-section" aria-labelledby="turnout-heading">
                    <div className="dashboard-section-heading">
                        <h2 id="turnout-heading">Turnout by election</h2>
                        <span className="dashboard-section-note">Completed ballots / registered voters</span>
                    </div>
                    <div className="dashboard-turnout-chart" role="img"
                         aria-label={elections.map(election => `${election.name}: ${election.turnout_percentage.toFixed(1)}% turnout`).join(', ')}
                         style={{height: Math.max(140, elections.length * 54 + 40)}}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={elections} layout="vertical"
                                      margin={{top: 5, right: 22, bottom: 5, left: 4}}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dfe5ee"/>
                                <XAxis type="number" domain={[0, 100]} tickFormatter={value => `${value}%`}
                                       tick={{fontSize: 11}}/>
                                <YAxis type="category" dataKey="name" width={120} tick={{fontSize: 11}}
                                       tickFormatter={value => String(value).length > 17 ? `${String(value).slice(0, 14)}...` : String(value)}/>
                                <Tooltip formatter={value => `${Number(value ?? 0).toFixed(1)}%`}/>
                                <Bar dataKey="turnout_percentage" name="Turnout" fill={CHART_COLORS.active} barSize={18}
                                     radius={0}/>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                <section className="dashboard-section" aria-labelledby="participation-heading">
                    <div className="dashboard-section-heading">
                        <h2 id="participation-heading">Voter progress</h2>
                    </div>
                    <div className="dashboard-chart-grid">
                        <DonutChart title="Participation" segments={[
                            {name: 'Voted', value: totals.voters_voted, color: CHART_COLORS.voted},
                            {
                                name: 'Not voted',
                                value: Math.max(0, totals.total_voters - totals.voters_voted),
                                color: CHART_COLORS.remaining
                            },
                        ]}/>
                        <DonutChart title="Access status" segments={[
                            {name: 'Active', value: totals.active_voters, color: CHART_COLORS.active},
                            {name: 'Yet to activate', value: totals.yet_to_activate, color: CHART_COLORS.pending},
                        ]}/>
                        {smsElections.length > 0 && <DonutChart title="SMS PIN attempts" segments={[
                            {name: 'Sent', value: smsTotals.sent, color: CHART_COLORS.sent},
                            {name: 'Failed', value: smsTotals.failed, color: CHART_COLORS.failed},
                            {name: 'Generated manually', value: smsTotals.generated, color: CHART_COLORS.generated},
                        ]}/>}
                    </div>
                </section>

                <section className="dashboard-section" aria-labelledby="elections-overview-heading">
                    <div className="dashboard-section-heading">
                        <h2 id="elections-overview-heading">Election overview</h2>
                        <span
                            className="dashboard-section-note">{elections.length} current {elections.length === 1 ? 'election' : 'elections'}</span>
                    </div>
                    <div className="management-table-wrap">
                        <table className="management-table dashboard-election-table">
                            <thead>
                            <tr>
                                <th scope="col">Election</th>
                                <th scope="col">Status</th>
                                <th scope="col">Voters</th>
                                <th scope="col">Active</th>
                                <th scope="col">Voted</th>
                                <th scope="col">Turnout</th>
                                <th scope="col">Failed logins</th>
                                <th scope="col">SMS failures</th>
                                <th scope="col">Results</th>
                            </tr>
                            </thead>
                            <tbody>{elections.map(election => <tr key={election.id}>
                                <td data-label="Election" className="management-table-cell--primary">
                                    <strong>{election.name}</strong><span
                                    className="table-secondary">{election.year}</span></td>
                                <td data-label="Status">{election.status}</td>
                                <td data-label="Voters">{election.total_voters.toLocaleString()}</td>
                                <td data-label="Active">{election.active_voters.toLocaleString()}</td>
                                <td data-label="Voted">{election.voters_voted.toLocaleString()}</td>
                                <td data-label="Turnout">{election.turnout_percentage.toFixed(1)}%</td>
                                <td data-label="Failed logins">{election.failed_logins.toLocaleString()}</td>
                                <td data-label="SMS failures">{election.voter_login_mode === 'sms_pin' ? election.sms_failed.toLocaleString() : '-'}</td>
                                <td data-label="Results"><Link className="dashboard-results-link"
                                                               to={`/admin/live-results?election=${election.id}`}>View
                                    results</Link></td>
                            </tr>)}</tbody>
                        </table>
                    </div>
                </section>
            </> : <section className="dashboard-section">
                <EmptyState
                    title="No open or paused elections"
                    message="Only elections that are currently open or paused appear on the dashboard."
                    icon={<FiActivity aria-hidden="true"/>}
                />
            </section>}
        </div>
    );
}
