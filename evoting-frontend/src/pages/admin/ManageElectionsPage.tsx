import {type FormEvent, useState} from 'react';
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
import FormField from '../../components/ui/FormField';
import LoadingState from '../../components/ui/LoadingState';
import Modal from '../../components/ui/Modal';
import TextArea from '../../components/ui/TextArea';
import TextInput from '../../components/ui/TextInput';
import {electionStatusPresentation} from '../../utils/electionLifecycle';

import {useConfirmModal} from '../../hooks/useConfirmModal';
import {
    useManageElections,
    useToggleElection,
    useExtendElection,
    type Election,
} from '../../queries/useManageElections';

type ApiError = {
    response?: {
        data?: {
            detail?: string;
            end_time?: string | string[];
            reason?: string | string[];
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

function toDateTimeLocal(value: string) {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16);
}

function mutationMessage(error: unknown, fallback: string) {
    const data = (error as ApiError).response?.data;
    if (data?.detail) return data.detail;
    const fieldError = [data?.end_time, data?.reason]
        .flatMap(value => Array.isArray(value) ? value : value ? [value] : [])[0];
    return fieldError || fallback;
}

export default function ManageElectionsPage() {
    const electionsQuery = useManageElections({refetchInterval: 30_000});
    const toggleElection = useToggleElection();
    const extendElection = useExtendElection();
    const confirmModal = useConfirmModal();

    const [actionElectionId, setActionElectionId] =
        useState<number | null>(null);
    const [extensionElection, setExtensionElection] = useState<Election | null>(null);
    const [extensionEndTime, setExtensionEndTime] = useState('');
    const [extensionReason, setExtensionReason] = useState('');
    const [extensionFormError, setExtensionFormError] = useState('');

    const elections = electionsQuery.data ?? [];
    const currentExtensionElection = extensionElection
        ? elections.find(election => election.id === extensionElection.id) ?? extensionElection
        : null;

    const openCount = elections.filter(election => election.status === 'open').length;

    // Election status handler

    const handleToggle = async (
        election: Election,
        nextVotingEnabled: boolean
    ) => {
        if (election.status === 'ended') return;

        const confirmed = await confirmModal.confirm({
            title: nextVotingEnabled ? 'Enable voting' : 'Pause voting',

            message: nextVotingEnabled
                ? `Enable voting for "${election.name}"? Voting will only be available during the scheduled period.`
                : `Pause voting for "${election.name}"? Students will not be able to vote until voting is enabled again.`,

            confirmText: nextVotingEnabled ? 'Enable voting' : 'Pause voting',

            type: nextVotingEnabled ? 'warning' : 'danger',
        });

        if (!confirmed) return;

        setActionElectionId(election.id);

        toggleElection.mutate(
            {
                election_id: election.id,
                voting_enabled: nextVotingEnabled,
            },
            {
                onSettled: () => setActionElectionId(null),
            }
        );
    };

    const openExtension = (election: Election) => {
        setExtensionElection(election);
        setExtensionEndTime(toDateTimeLocal(election.end_time));
        setExtensionReason('');
        setExtensionFormError('');
        extendElection.reset();
    };

    const closeExtension = () => {
        if (extendElection.isPending) return;
        setExtensionElection(null);
        setExtensionEndTime('');
        setExtensionReason('');
        setExtensionFormError('');
    };

    const handleExtend = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!currentExtensionElection) return;

        if (!['open', 'paused'].includes(currentExtensionElection.status)) {
            setExtensionFormError('Only open or paused elections can be extended.');
            return;
        }

        const newEndMilliseconds = new Date(extensionEndTime).getTime();
        const currentEndMilliseconds = new Date(currentExtensionElection.end_time).getTime();
        if (!Number.isFinite(newEndMilliseconds) || newEndMilliseconds <= currentEndMilliseconds) {
            setExtensionFormError('Choose a closing time later than the current closing time.');
            return;
        }

        if (!extensionReason.trim()) {
            setExtensionFormError('Enter a reason for extending the closing time.');
            return;
        }

        setExtensionFormError('');
        extendElection.mutate(
            {
                electionId: currentExtensionElection.id,
                end_time: new Date(extensionEndTime).toISOString(),
                reason: extensionReason.trim(),
            },
            {
                onSuccess: () => {
                    setExtensionElection(null);
                    setExtensionEndTime('');
                    setExtensionReason('');
                },
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
            {extendElection.isError && (
                <Alert variant="error" title="Closing time was not extended">
                    {mutationMessage(extendElection.error, 'Please try again.')}
                </Alert>
            )}

            {/* Election statistics */}

            <section
                className="management-stat-grid management-statistics"
                aria-label="Election status summary"
            >
                <StatisticCard
                    label="Voting open"
                    value={openCount}
                    status="success"
                    layout="split"
                    icon={<FiCheckCircle/>}
                />

                <StatisticCard
                    label="Total elections"
                    value={elections.length}
                    status="primary"
                    layout="split"
                    icon={<FiCalendar/>}
                />
            </section>

            {/* Election status controls */}

            <section
                className="management-panel manage-elections-status"
                aria-labelledby="status-heading"
            >
                <div className="management-panel-heading">
                    <div>
                        <p className="dashboard-kicker">
                            Availability controls
                        </p>

                        <h2 id="status-heading">
                            Enable or pause voting
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
                        icon={<FiCalendar/>}
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
                                    Actions
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
                                        <span>{electionStatusPresentation(election.status).label}</span>
                                    </td>

                                    <td data-label="Actions" className="text-right">
                                        <div className="flex flex-wrap justify-end gap-2">
                                        {election.status === 'ended' ? (
                                            <span aria-label="No actions available">—</span>
                                        ) : (
                                            <>
                                        {['open', 'paused'].includes(election.status) && (
                                            <Button
                                                size="compact"
                                                variant="secondary"
                                                leadingIcon={<FiCalendar aria-hidden="true"/>}
                                                aria-label={`Extend closing time for ${election.name}`}
                                                onClick={() => openExtension(election)}
                                            >
                                                Extend closing time
                                            </Button>
                                        )}
                                        <Button
                                            size="compact"
                                            variant={
                                                election.voting_enabled
                                                    ? 'danger'
                                                    : 'success'
                                            }
                                            loading={
                                                toggleElection.isPending &&
                                                actionElectionId === election.id
                                            }
                                            disabled={
                                                toggleElection.isPending ||
                                                (!election.voting_enabled && !election.ballot_ready)
                                            }
                                            title={!election.voting_enabled && !election.ballot_ready
                                                ? 'Configure at least one position and a candidate for every position before enabling voting.'
                                                : undefined}
                                            leadingIcon={
                                                election.voting_enabled ? (
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
                                                    !election.voting_enabled
                                                )
                                            }
                                        >
                                            {election.voting_enabled ? 'Pause voting' : 'Enable voting'}
                                        </Button>
                                        {!election.ballot_ready && (
                                            <span className="w-full text-xs text-amber-700" role="note">
                                                Add a candidate to every position before enabling voting.
                                            </span>
                                        )}
                                            </>
                                        )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <Modal
                open={Boolean(extensionElection)}
                onClose={closeExtension}
                title="Extend closing time"
                description={currentExtensionElection
                    ? `Current closing time: ${formatDateTime(currentExtensionElection.end_time)}. Voting will remain ${currentExtensionElection.voting_enabled ? 'open' : 'paused'}.`
                    : undefined}
                className="election-create-modal"
            >
                {currentExtensionElection && (
                    <form onSubmit={handleExtend} className="election-form">
                        {extensionFormError && (
                            <Alert variant="error" title="Unable to extend closing time">
                                {extensionFormError}
                            </Alert>
                        )}
                        <FormField
                            id="extension-end-time"
                            label="New closing time"
                            required
                            helperText="Choose a time later than the current closing time."
                        >
                            <TextInput
                                type="datetime-local"
                                value={extensionEndTime}
                                onChange={event => {
                                    setExtensionEndTime(event.target.value);
                                    setExtensionFormError('');
                                }}
                                required
                            />
                        </FormField>
                        <FormField
                            id="extension-reason"
                            label="Reason for extension"
                            required
                        >
                            <TextArea
                                rows={3}
                                maxLength={500}
                                value={extensionReason}
                                onChange={event => {
                                    setExtensionReason(event.target.value);
                                    setExtensionFormError('');
                                }}
                                required
                            />
                        </FormField>
                        <div className="election-form-footer">
                            <div className="ui-modal-actions">
                                <Button type="button" variant="quiet" onClick={closeExtension} disabled={extendElection.isPending}>
                                    Cancel
                                </Button>
                                <Button type="submit" loading={extendElection.isPending}>
                                    Extend closing time
                                </Button>
                            </div>
                        </div>
                    </form>
                )}
            </Modal>

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
