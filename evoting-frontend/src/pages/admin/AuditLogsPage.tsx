import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {FiActivity, FiChevronLeft, FiChevronRight} from 'react-icons/fi';

import api from '../../apiClient';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import LoadingState from '../../components/ui/LoadingState';
import Button from '../../components/ui/Button';

const PAGE_SIZE = 10;

type AuditEvent = {
    id: number;
    action: string;
    outcome: string;
    election: number | null;
    election_name: string;
    student_reference: string;
    actor_username: string;
    created_at: string;
};

type AuditResponse = { results?: AuditEvent[] };

export default function AuditLogsPage() {
    const auditQuery = useQuery({
        queryKey: ['audit-logs'],
        queryFn: async () => {
            const response = await api.get<AuditResponse | AuditEvent[]>('api/audit-logs/');
            return Array.isArray(response.data) ? response.data : response.data.results ?? [];
        },
        refetchInterval: 30_000,
    });

    const events = auditQuery.data ?? [];
    const [currentPage, setCurrentPage] = useState(1);
    const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
    const visiblePage = Math.min(currentPage, totalPages);
    const visibleEvents = events.slice(
        (visiblePage - 1) * PAGE_SIZE,
        visiblePage * PAGE_SIZE,
    );

    return (
        <section className="management-panel audit-logs-page" aria-labelledby="audit-logs-title">
            <div className="ui-section-heading">
                <div>
                    <h1 id="audit-logs-title">Audit trail</h1>
                </div>
            </div>

            {auditQuery.isLoading ? (
                <LoadingState title="Loading audit trail" message="Fetching recorded election activity."/>
            ) : auditQuery.isError ? (
                <ErrorState title="Audit trail unavailable" message="We could not load the recorded activity."/>
            ) : events.length === 0 ? (
                <EmptyState title="No activity recorded" message="New election activity will appear here."
                            icon={<FiActivity aria-hidden="true"/>}/>
            ) : (
                <div className="management-table-wrap">
                    <table className="management-table audit-logs-table">
                        <caption className="sr-only">Election audit trail</caption>
                        <thead>
                        <tr>
                            <th scope="col">Time</th>
                            <th scope="col">Action</th>
                            <th scope="col">Result</th>
                            <th scope="col">Election</th>
                            <th scope="col">Voter</th>
                            <th scope="col">Actor</th>
                        </tr>
                        </thead>
                        <tbody>
                        {visibleEvents.map(event => (
                            <tr key={event.id}>
                                <td data-label="Time">{new Date(event.created_at).toLocaleString()}</td>
                                <td data-label="Action" className="management-table-cell--primary">{event.action}</td>
                                <td data-label="Result">{event.outcome}</td>
                                <td data-label="Election">{event.election_name || 'System'}</td>
                                <td data-label="Voter">{event.student_reference || '—'}</td>
                                <td data-label="Actor">{event.actor_username || 'Voter/system'}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    {totalPages > 1 && (
                        <nav className="audit-logs-pagination" aria-label="Audit trail pagination">
                            <span>Page {visiblePage} of {totalPages}</span>
                            <div>
                                <Button
                                    type="button"
                                    variant="quiet"
                                    size="compact"
                                    leadingIcon={<FiChevronLeft aria-hidden="true"/>}
                                    disabled={visiblePage === 1}
                                    onClick={() => setCurrentPage(page => Math.max(page - 1, 1))}
                                >
                                    Previous
                                </Button>
                                <Button
                                    type="button"
                                    variant="quiet"
                                    size="compact"
                                    trailingIcon={<FiChevronRight aria-hidden="true"/>}
                                    disabled={visiblePage === totalPages}
                                    onClick={() => setCurrentPage(page => Math.min(page + 1, totalPages))}
                                >
                                    Next
                                </Button>
                            </div>
                        </nav>
                    )}
                </div>
            )}
        </section>
    );
}
