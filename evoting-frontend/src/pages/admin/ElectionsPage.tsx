import {type FormEvent, useState} from 'react';
import {FiCalendar, FiCheckCircle, FiClock, FiEdit2, FiPlus} from 'react-icons/fi';
import StatisticCard from '../../components/StatisticCard';

import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import TextInput from '../../components/ui/TextInput';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import LoadingState from '../../components/ui/LoadingState';

import {useElections} from '../../queries/useElections';
import {useCreateElection, useUpdateElectionSchedule} from '../../queries/useElectionsMutations';
import type {Election} from '../../types/election';
import {electionStatusPresentation} from '../../utils/electionLifecycle';

type ApiError = {
    response?: {
        data?: {
            detail?: string;
            start_time?: string | string[];
            end_time?: string | string[];
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

function toDateTimeLocalValue(value: string) {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16);
}

function mutationMessage(error: unknown, fallback: string) {
    const data = (error as ApiError).response?.data;
    if (data?.detail) return data.detail;
    const fieldError = [data?.start_time, data?.end_time]
        .flatMap(value => Array.isArray(value) ? value : value ? [value] : [])[0];
    return fieldError || fallback;
}

export default function ElectionsPage() {
    const electionsQuery = useElections({refetchInterval: 45_000});
    const createElection = useCreateElection();
    const updateSchedule = useUpdateElectionSchedule();

    const elections = electionsQuery.data ?? [];

    const [showCreateForm, setShowCreateForm] = useState(false);

    const [name, setName] = useState('');
    const [year, setYear] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [scheduleError, setScheduleError] = useState('');
    const [scheduleElectionId, setScheduleElectionId] = useState<number | null>(null);
    const [editedStartTime, setEditedStartTime] = useState('');
    const [editedEndTime, setEditedEndTime] = useState('');
    const [scheduleEditError, setScheduleEditError] = useState('');
    const editingElection = elections.find(election => election.id === scheduleElectionId) ?? null;

    const statusCounts = {
        scheduled: elections.filter(election => election.status === 'scheduled').length,
        open: elections.filter(election => election.status === 'open').length,
        paused: elections.filter(election => election.status === 'paused').length,
        ended: elections.filter(election => election.status === 'ended').length,
    };

    // Form handlers

    const resetForm = () => {
        setName('');
        setYear('');
        setStartTime('');
        setEndTime('');
        setScheduleError('');
    };

    const openScheduleEditor = (election: Election) => {
        updateSchedule.reset();
        setScheduleElectionId(election.id);
        setEditedStartTime(toDateTimeLocalValue(election.start_time));
        setEditedEndTime(toDateTimeLocalValue(election.end_time));
        setScheduleEditError('');
    };

    const closeScheduleEditor = () => {
        setScheduleElectionId(null);
        setScheduleEditError('');
        updateSchedule.reset();
    };

    const handleCreateElection = (event: FormEvent) => {
        event.preventDefault();

        const startMilliseconds = new Date(startTime).getTime();
        const endMilliseconds = new Date(endTime).getTime();
        if (!name.trim() || !Number.isInteger(Number(year)) || Number(year) <= 0) return;
        if (!Number.isFinite(startMilliseconds) || !Number.isFinite(endMilliseconds) || endMilliseconds <= startMilliseconds) {
            setScheduleError('The election must end after its starting time.');
            return;
        }
        setScheduleError('');

        createElection.mutate(
            {
                name: name.trim(),
                year: Number(year),
                start_time: new Date(startTime).toISOString(),
                end_time: new Date(endTime).toISOString(),
                voting_enabled: false,
            },
            {
                onSuccess: () => {
                    resetForm();
                    setShowCreateForm(false);
                },
            }
        );
    };

    const handleUpdateSchedule = (event: FormEvent) => {
        event.preventDefault();
        if (!editingElection || editingElection.status !== 'scheduled') return;

        const startMilliseconds = new Date(editedStartTime).getTime();
        const endMilliseconds = new Date(editedEndTime).getTime();
        if (!Number.isFinite(startMilliseconds) || !Number.isFinite(endMilliseconds) || endMilliseconds <= startMilliseconds) {
            setScheduleEditError('The election must end after its starting time.');
            return;
        }

        setScheduleEditError('');
        updateSchedule.mutate(
            {
                electionId: editingElection.id,
                start_time: new Date(editedStartTime).toISOString(),
                end_time: new Date(editedEndTime).toISOString(),
            },
            {
                onSuccess: () => {
                    setScheduleElectionId(null);
                    setEditedStartTime('');
                    setEditedEndTime('');
                },
            }
        );
    };

    return (
        <div className="elections-page">

            <Button
                leadingIcon={<FiPlus aria-hidden="true"/>}
                onClick={() => setShowCreateForm(true)}
            >
                Create election
            </Button>

            {/* Election statistics */}

            <section
                className="elections-statistics"
                aria-label="Election statistics"
            >
                <StatisticCard
                    label="All elections"
                    value={elections.length}
                    icon={<FiCalendar aria-hidden="true"/>}
                    status="primary"
                    layout="split"
                />

                <StatisticCard
                    label="Scheduled"
                    value={statusCounts.scheduled}
                    icon={<FiCheckCircle aria-hidden="true"/>}
                    status="success"
                    layout="split"
                />

                <StatisticCard
                    label="Voting open"
                    value={statusCounts.open}
                    icon={<FiClock aria-hidden="true"/>}
                    status="neutral"
                    layout="split"
                />
                <StatisticCard label="Paused" value={statusCounts.paused} icon={<FiClock aria-hidden="true"/>} status="warning" layout="split"/>
                <StatisticCard label="Ended" value={statusCounts.ended} icon={<FiCheckCircle aria-hidden="true"/>} status="neutral" layout="split"/>
            </section>

            {/* Creation error */}

            {createElection.isError && (
                <Alert
                    variant="error"
                    title="Election could not be created"
                >
                    {mutationMessage(
                        createElection.error,
                        'Please review the election details and try again.'
                    )}
                </Alert>
            )}
            {scheduleError && <Alert variant="error" title="Invalid voting schedule">{scheduleError}</Alert>}

            {/* Election register */}

            <section
                className="elections-records"
                aria-labelledby="all-elections-heading"
            >
                <div className="elections-section-heading">
                    <div>

                        <h2 id="all-elections-heading">
                            All elections
                        </h2>
                    </div>
                </div>

                {/* Loading, error and empty states */}

                {electionsQuery.isLoading ? (
                    <LoadingState
                        title="Loading elections"
                        message="Fetching election records."
                    />
                ) : electionsQuery.isError ? (
                    <ErrorState
                        title="Elections unavailable"
                        message="We could not load the election register."
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
                        title="No elections yet"
                        message="Create an election to begin configuring the voting cycle."
                        icon={<FiCalendar aria-hidden="true"/>}
                    />
                ) : (
                    <div className="management-table-wrap elections-table-wrap">
                        <table className="management-table elections-table">
                            <caption className="sr-only">
                                Election register
                            </caption>

                            <thead>
                            <tr>
                                <th scope="col">Name</th>
                                <th scope="col">Year</th>
            <th scope="col">Voting opens</th>
                                <th scope="col">Voting closes</th>
                                <th scope="col">Status</th>
                                <th scope="col">Actions</th>
                            </tr>
                            </thead>

                            <tbody>
                            {elections.map(election => (
                                <tr key={election.id}>
                                    <td className="management-table-cell--primary" data-label="Name">
                                        {election.name}
                                    </td>

                                    <td data-label="Year">
                                        {election.year}
                                    </td>

                                    <td data-label="Voting opens">
                                        {formatDateTime(
                                            election.start_time
                                        )}
                                    </td>

                                    <td data-label="Voting closes">
                                        {formatDateTime(
                                            election.end_time
                                        )}
                                    </td>

                                    <td data-label="Status">
                                        {electionStatusPresentation(election.status).label}
                                    </td>

                                    <td data-label="Actions">
                                        {election.status === 'scheduled' && !election.candidate_changes_locked ? (
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="compact"
                                                leadingIcon={<FiEdit2 aria-hidden="true"/>}
                                                aria-label={`Edit schedule for ${election.name}`}
                                                onClick={() => openScheduleEditor(election)}
                                            >
                                                Edit schedule
                                            </Button>
                                        ) : '—'}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Create election modal */}

            <Modal
                open={showCreateForm}
                onClose={() => setShowCreateForm(false)}
                title="Create election"
                description="Set the election details and voting period."
                className="election-create-modal"
            >
                <form
                    onSubmit={handleCreateElection}
                    className="election-form"
                >
                    <section className="election-form-section">
                        <h3 className="election-form-section-title">Election details</h3>
                        <div className="election-form-details">
                            <FormField
                                id="election_name"
                                label="Election name"
                                required
                            >
                                <TextInput
                                    value={name}
                                    onChange={event =>
                                        setName(event.target.value)
                                    }
                                    placeholder="e.g. 2026 SRC Elections"
                                    required
                                />
                            </FormField>

                            <FormField
                                id="election_year"
                                label="Year"
                                required
                            >
                                <TextInput
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={year}
                                    onChange={event =>
                                        setYear(event.target.value)
                                    }
                                    placeholder="2026"
                                    required
                                />
                            </FormField>
                        </div>
                    </section>

                    <section className="election-form-section election-form-section--schedule">
                        <h3 className="election-form-section-title">Voting schedule</h3>
                        <div className="election-form-dates">
                            <FormField
                                id="start_time"
                                label="Voting opens"
                                required
                            >
                                <TextInput
                                    type="datetime-local"
                                    value={startTime}
                                    onChange={event => {
                                        setStartTime(event.target.value);
                                        setScheduleError('');
                                    }}
                                    required
                                />
                            </FormField>

                            <FormField
                                id="end_time"
                                label="Voting closes"
                                required
                            >
                                <TextInput
                                    type="datetime-local"
                                    value={endTime}
                                    onChange={event => {
                                        setEndTime(event.target.value);
                                        setScheduleError('');
                                    }}
                                    required
                                />
                            </FormField>
                        </div>
                    </section>

                    <p className="text-xs text-gray-600">
                        Configure at least one position and a candidate for every position before enabling voting.
                    </p>

                    <div className="election-form-footer">
                        <div className="ui-modal-actions">
                            <Button
                                type="button"
                                variant="quiet"
                                onClick={() =>
                                    setShowCreateForm(false)
                                }
                            >
                                Cancel
                            </Button>

                            <Button
                                type="submit"
                                loading={createElection.isPending}
                            >
                                Create election
                            </Button>
                        </div>
                    </div>
                </form>
            </Modal>

            <Modal
                open={Boolean(scheduleElectionId)}
                onClose={closeScheduleEditor}
                title="Edit election schedule"
                description={editingElection ? `${editingElection.name} (${editingElection.year})` : undefined}
                className="election-create-modal"
            >
                {editingElection && (
                    <form onSubmit={handleUpdateSchedule} className="election-form">
                        <section className="election-form-section election-form-section--schedule">
                            <h3 className="election-form-section-title">Voting schedule</h3>
                            <div className="election-form-dates">
                                <FormField id="edit_start_time" label="Voting opens" required>
                                    <TextInput
                                        type="datetime-local"
                                        value={editedStartTime}
                                        onChange={event => {
                                            setEditedStartTime(event.target.value);
                                            setScheduleEditError('');
                                        }}
                                        required
                                    />
                                </FormField>
                                <FormField id="edit_end_time" label="Voting closes" required>
                                    <TextInput
                                        type="datetime-local"
                                        value={editedEndTime}
                                        onChange={event => {
                                            setEditedEndTime(event.target.value);
                                            setScheduleEditError('');
                                        }}
                                        required
                                    />
                                </FormField>
                            </div>
                        </section>
                        {(scheduleEditError || updateSchedule.isError) && (
                            <Alert variant="error" title="Schedule not updated">
                                {scheduleEditError || mutationMessage(updateSchedule.error, 'Please try again.')}
                            </Alert>
                        )}
                        <div className="election-form-footer">
                            <div className="ui-modal-actions">
                                <Button type="button" variant="quiet" onClick={closeScheduleEditor}>
                                    Cancel
                                </Button>
                                <Button type="submit" loading={updateSchedule.isPending}>
                                    Save schedule
                                </Button>
                            </div>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
}
