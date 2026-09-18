
import {useState} from 'react';
import {
    FiCalendar,
    FiCheckCircle,
    FiPlayCircle,
    FiPauseCircle,
} from 'react-icons/fi';

import ConfirmModal from '../../components/ConfirmModal';
import StatisticCard from '../../components/StatisticCard';

import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import LoadingState from '../../components/ui/LoadingState';

import {useConfirmModal} from '../../hooks/useConfirmModal';
import {
    useManageElections,
    useToggleElection,
    type Election,
} from '../../queries/useManageElections';

type ApiError = {
    response?: {
        data?: {
            detail?: string;
        };
    };
};

function formatDateTime(value: string) {
    return new Date(value).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function ManageElectionsPage() {
    const electionsQuery = useManageElections();
    const toggleElection = useToggleElection();
    const confirmModal = useConfirmModal();

    const [actionElectionId, setActionElectionId] =
        useState<number | null>(null);

    const elections = electionsQuery.data ?? [];

    const activeCount = elections.filter(
        election => election.is_active
    ).length;

    // Election status handler

    const handleToggle = async (
        election: Election,
        nextActive: boolean
    ) => {
        const confirmed = await confirmModal.confirm({
            title: nextActive
                ? 'Start election'
                : 'Stop election',

            message: nextActive
                ? `Start "${election.name}"?`
                : `Stop "${election.name}"? This changes its availability but does not delete votes or election data.`,

            confirmText: nextActive
                ? 'Start'
                : 'Stop',

            type: nextActive
                ? 'warning'
                : 'danger',
        });

        if (!confirmed) return;

        setActionElectionId(election.id);

        toggleElection.mutate(
            {
                election_id: election.id,
                is_active: nextActive,
            },
            {
                onSettled: () => setActionElectionId(null),
            }
        );
    };

    return (
        <>
            {/* Status update error */}

            {toggleElection.isError && (
                <Alert
                    variant="error"
                    title="Election status was not changed"
                >
                    {(toggleElection.error as ApiError).response?.data?.detail ||
                        'Please try again.'}
                </Alert>
            )}

            {/* Election statistics */}

            <section
                className="management-stat-grid management-statistics"
                aria-label="Election status summary"
            >
                <StatisticCard
                    label="Active elections"
                    value={activeCount}
                    status="success"
                    layout="split"
                    icon={<FiCheckCircle />}
                />

                <StatisticCard
                    label="Total elections"
                    value={elections.length}
                    status="primary"
                    layout="split"
                    icon={<FiCalendar />}
                />
        </section>

            {/* Election status controls */}

            <section
                className="management-panel"
                aria-labelledby="status-heading"
            >
                <div className="management-panel-heading">
                    <div>
                        <p className="dashboard-kicker">
                            Availability controls
                        </p>

                        <h2 id="status-heading">
                            Election status
                        </h2>
                    </div>
                </div>

                {/* Loading, error and empty states */}

                {electionsQuery.isLoading ? (
                    <LoadingState
                        title="Loading elections"
                        inline
                    />
                ) : electionsQuery.isError ? (
                    <ErrorState
                        title="Election controls unavailable"
                        message="We could not load elections for status management."
                        action={
                            <Button
                                variant="secondary"
                                size="compact"
                                onClick={() =>
                                    void electionsQuery.refetch()
                                }
                            >
                                Try again
                            </Button>
                        }
                    />
                ) : elections.length === 0 ? (
                    <EmptyState
                        title="No elections available"
                        message="Create an election before changing its status."
                        icon={<FiCalendar />}
                    />
                ) : (
                    <div className="management-table-wrap">
                        <table className="management-table">
                            <caption className="sr-only">
                                Election status controls
                            </caption>

                            <thead>
                                <tr>
                                    <th scope="col">
                                        Election
                                    </th>

                                    <th scope="col">
                                        Window
                                    </th>

                                    <th scope="col">
                                        Status
                                    </th>

                                    <th scope="col" className="!text-right">
                                        Action
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {elections.map(election => (
                                    <tr key={election.id}>
                                        <td data-label="Election">
                                            {election.name}

                                            <span className="table-secondary">
                                                {election.year}
                                            </span>
                                        </td>

                                        <td data-label="Window">
                                            {formatDateTime(
                                                election.start_time
                                            )}
                                            {' – '}
                                            {formatDateTime(
                                                election.end_time
                                            )}
                                        </td>

                                        <td data-label="Status">
                                                {election.is_active
                                                    ? 'Active'
                                                    : 'Inactive'}
                                        </td>

                                        <td data-label="Action" className="text-right">
                                            <Button
                                                size="compact"
                                                variant={
                                                    election.is_active
                                                        ? 'danger'
                                                        : 'success'
                                                }
                                                loading={
                                                    toggleElection.isPending &&
                                                    actionElectionId === election.id
                                                }
                                                disabled={
                                                    toggleElection.isPending
                                                }
                                                leadingIcon={
                                                    election.is_active ? (
                                                        <FiPauseCircle
                                                            aria-hidden="true"
                                                        />
                                                    ) : (
                                                        <FiPlayCircle
                                                            aria-hidden="true"
                                                        />
                                                    )
                                                }
                                                onClick={() =>
                                                    void handleToggle(
                                                        election,
                                                        !election.is_active
                                                    )
                                                }
                                            >
                                                {election.is_active
                                                    ? 'Stop'
                                                    : 'Start'}
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Confirmation modal */}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={confirmModal.handleClose}
                onConfirm={confirmModal.handleConfirm}
                title={confirmModal.options.title}
                message={confirmModal.options.message}
                confirmText={confirmModal.options.confirmText}
                cancelText={confirmModal.options.cancelText}
                type={confirmModal.options.type}
            />
        </>
    );
}
