import {type FormEvent, useState} from 'react';
import {FiCalendar, FiCheckCircle, FiClock, FiPlus} from 'react-icons/fi';
import PageHeader from '../../components/PageHeader';
import StatisticCard from '../../components/StatisticCard';
import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import TextInput from '../../components/ui/TextInput';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import LoadingState from '../../components/ui/LoadingState';
import {useElections} from '../../queries/useElections';
import {useCreateElection} from '../../queries/useElectionsMutations';

type ApiError = {response?: {data?: {detail?: string}}};

function formatDateTime(value: string) {
    return new Date(value).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function mutationMessage(error: unknown, fallback: string) {
    return (error as ApiError).response?.data?.detail || fallback;
}

export default function ElectionsPage() {
    const electionsQuery = useElections();
    const createElection = useCreateElection();
    const elections = electionsQuery.data ?? [];
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [name, setName] = useState('');
    const [year, setYear] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [isActive, setIsActive] = useState(false);
    const activeCount = elections.filter(election => election.is_active).length;

    const resetForm = () => {
        setName('');
        setYear('');
        setStartTime('');
        setEndTime('');
        setIsActive(false);
    };

    const handleCreateElection = (event: FormEvent) => {
        event.preventDefault();
        createElection.mutate({
            name: name.trim(),
            year: Number(year),
            start_time: new Date(startTime).toISOString(),
            end_time: new Date(endTime).toISOString(),
            is_active: isActive,
        }, {
            onSuccess: () => {
                resetForm();
                setShowCreateForm(false);
            },
        });
    };

    return <div className="elections-page">
        <PageHeader
            title="Elections"
            description="Create and review elections for each voting cycle."
            actions={<Button leadingIcon={<FiPlus aria-hidden="true"/>} onClick={() => setShowCreateForm(true)}>Create election</Button>}
        />

        <section className="elections-statistics" aria-label="Election statistics">
            <StatisticCard label="All elections" value={elections.length} icon={<FiCalendar aria-hidden="true"/>} status="primary" layout="split"/>
            <StatisticCard label="Active elections" value={activeCount} icon={<FiCheckCircle aria-hidden="true"/>} status="success" layout="split"/>
            <StatisticCard label="Inactive elections" value={elections.length - activeCount} icon={<FiClock aria-hidden="true"/>} status="neutral" layout="split"/>
        </section>

        {createElection.isError && <Alert variant="error" title="Election could not be created">{mutationMessage(createElection.error, 'Please review the election details and try again.')}</Alert>}

        <section className="elections-records" aria-labelledby="all-elections-heading">
            <div className="elections-section-heading">
                <div>
                    <p className="dashboard-kicker">Election register</p>
                    <h2 id="all-elections-heading">All elections</h2>
                    <p>{elections.length} election{elections.length === 1 ? '' : 's'} configured.</p>
                </div>
            </div>

            {electionsQuery.isLoading ? <LoadingState title="Loading elections" message="Fetching election records."/> : electionsQuery.isError ? <ErrorState title="Elections unavailable" message="We could not load the election register." action={<Button variant="secondary" size="compact" onClick={() => void electionsQuery.refetch()}>Try again</Button>}/> : elections.length === 0 ? <EmptyState title="No elections yet" message="Create an election to begin configuring the voting cycle." icon={<FiCalendar aria-hidden="true"/>}/> : <div className="management-table-wrap elections-table-wrap"><table className="management-table elections-table"><caption className="sr-only">Election register</caption><thead><tr><th scope="col">Name</th><th scope="col">Year</th><th scope="col">Voting opens</th><th scope="col">Voting closes</th><th scope="col">Status</th></tr></thead><tbody>{elections.map(election => <tr key={election.id}><td data-label="Name">{election.name}</td><td data-label="Year">{election.year}</td><td data-label="Voting opens">{formatDateTime(election.start_time)}</td><td data-label="Voting closes">{formatDateTime(election.end_time)}</td><td data-label="Status"><Badge variant={election.is_active ? 'success' : 'neutral'}>{election.is_active ? 'Active' : 'Inactive'}</Badge></td></tr>)}</tbody></table></div>}
        </section>

        <Modal open={showCreateForm} onClose={() => setShowCreateForm(false)} title="Create election" description="Set the election identity and voting window. Date and time values use the application's existing timezone handling.">
            <form onSubmit={handleCreateElection} className="election-form">
                <FormField id="election_name" label="Election name" required helperText="Use a clear name voters and administrators will recognize."><TextInput value={name} onChange={event => setName(event.target.value)} placeholder="e.g. 2026 SRC Elections" required/></FormField>
                <FormField id="election_year" label="Year" required><TextInput type="number" value={year} onChange={event => setYear(event.target.value)} placeholder="2026" required/></FormField>
                <FormField id="start_time" label="Voting opens" required helperText="Displayed using the application's existing timezone handling."><TextInput type="datetime-local" value={startTime} onChange={event => setStartTime(event.target.value)} required/></FormField>
                <FormField id="end_time" label="Voting closes" required><TextInput type="datetime-local" value={endTime} onChange={event => setEndTime(event.target.value)} required/></FormField>
                <label className="election-checkbox"><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)}/><span>Set as active after creation</span></label>
                <div className="ui-modal-actions"><Button type="button" variant="quiet" onClick={() => setShowCreateForm(false)}>Cancel</Button><Button type="submit" loading={createElection.isPending}>Save election</Button></div>
            </form>
        </Modal>
    </div>;
}
