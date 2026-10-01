import {type FormEvent, type KeyboardEvent, useEffect, useMemo, useState,} from 'react';

import {
    FiBarChart2,
    FiCheckCircle,
    FiEye,
    FiEyeOff,
    FiPower,
    FiSend,
    FiUserPlus,
    FiUsers,
    FiUserX,
    FiX,
} from 'react-icons/fi';

import {useElections} from '../../queries/useElections';
import {electionStatusPresentation} from '../../utils/electionLifecycle';
import {useAuth} from '../../hooks/useAuth';
import {type Student, useStudents} from '../../queries/useStudents';
import {useActivateStudent} from '../../queries/useActivations';
import {
    type SmsPinSendResponse,
    type SmsVoterStatusRow,
    useGenerateSmsPin,
    useResendSmsPin,
    useSendSmsPins,
    useSmsVoterStatus,
    useVoterRecoveryStatus,
    type VoterRecoveryStatusRow,
} from '../../queries/useSmsPins';

import {showError, showSuccess} from '../../utils/toast';

import PageContainer from '../../components/PageContainer';
import StatisticCard from '../../components/StatisticCard';

import FormField from '../../components/ui/FormField';
import TextInput from '../../components/ui/TextInput';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import LoadingState from '../../components/ui/LoadingState';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import ConfirmModal from '../../components/ConfirmModal';
import {BsFillGearFill, BsSendFill} from "react-icons/bs";
import {MdPersonOff} from "react-icons/md";

type ApiError = {
    response?: {
        data?: {
            detail?: string;
        };
    };
};

function errorMessage(error: unknown) {
    return (
        (error as ApiError)?.response?.data?.detail ||
        'Activation failed. Please try again.'
    );
}

const smsStatusLabels: Record<SmsVoterStatusRow['status'], string> = {
    not_sent: 'Not sent',
    sent: 'PIN active',
    generated: 'Generated manually',
    expired: 'PIN expired',
    failed: 'Failed',
    missing_phone: 'Missing phone',
    voted: 'Voted',
};


function formatSmsDate(value: string | null) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('en-UK', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(value));
}

function canSendSmsToVoter(row: SmsVoterStatusRow) {
    return row.can_resend || row.status === 'not_sent' || row.status === 'expired' || row.status === 'failed';
}

function smsVoterActionLabel(row: SmsVoterStatusRow) {
    return row.status === 'not_sent' ? 'Send PIN' : 'Resend';
}

function canGenerateSmsPinForVoter(row: SmsVoterStatusRow) {
    return row.status === 'not_sent' || row.status === 'expired' || row.status === 'failed' || row.status === 'missing_phone';
}

function recoveryStateLabel(row: VoterRecoveryStatusRow) {
    return row.state.replaceAll('_', ' ').replace(/^\w/, value => value.toUpperCase());
}

type SmsConfirmAction =
    | { kind: 'send_all' }
    | { kind: 'resend'; row: SmsVoterStatusRow }
    | { kind: 'generate'; row: SmsVoterStatusRow }
    | { kind: 'invalidate'; student_id: string; full_name: string };

function TablePagination({count, page, onChange}: { count: number; page: number; onChange: (page: number) => void }) {
    const pageCount = Math.ceil(count / 10);
    if (pageCount <= 1) return null;
    return (
        <nav className="mt-3 flex items-center justify-between gap-3" aria-label="Table pagination">
            <span className="text-xs text-gray-600">
                Page {page} of {pageCount} - <strong>{count} voters</strong>
            </span>
            <div className="flex gap-2">
                <Button type="button" variant="secondary" size="compact" disabled={page <= 1}
                        onClick={() => onChange(page - 1)}>Previous</Button>
                <Button type="button" variant="secondary" size="compact" disabled={page >= pageCount}
                        onClick={() => onChange(page + 1)}>Next</Button>
            </div>
        </nav>
    );
}

export default function ActivationsPage() {
    const {user} = useAuth();
    const isScopedRole = user?.role === 'activator' || user?.role === 'staff';
    // Selection and search state

    const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);

    const [studentQuery, setStudentQuery] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [activeOption, setActiveOption] = useState(0);
    const [generatedPin, setGeneratedPin] = useState<string | null>(null);
    const [generatedPinStudent, setGeneratedPinStudent] = useState('');
    const [activationSuccessStudent, setActivationSuccessStudent] = useState('');
    const [smsSendResult, setSmsSendResult] = useState<SmsPinSendResponse | null>(null);
    const [smsStatusSearch, setSmsStatusSearch] = useState('');
    const [smsStatusPage, setSmsStatusPage] = useState(1);
    const [recoveryStatusPage, setRecoveryStatusPage] = useState(1);
    const [isVoterTableVisible, setIsVoterTableVisible] = useState(false);
    const [resendingStudentId, setResendingStudentId] = useState<number | null>(null);
    const [generatingStudentId, setGeneratingStudentId] = useState<number | null>(null);
    const [smsConfirmAction, setSmsConfirmAction] = useState<SmsConfirmAction | null>(null);

    const listboxId = 'activation-student-options';

    // Queries and mutation

    const electionsQuery = useElections({refetchInterval: 45_000});
    const effectiveElectionId = isScopedRole
        ? user?.assignedElection?.id ?? null
        : selectedElectionId;
    const studentsQuery = useStudents(effectiveElectionId, {refetchInterval: 10_000});
    const activateStudent = useActivateStudent();
    const sendSmsPins = useSendSmsPins();
    const resendSmsPin = useResendSmsPin();
    const generateSmsPin = useGenerateSmsPin();

    const confirmSmsAction = async () => {
        if (!smsConfirmAction || !effectiveElectionId) return;

        if (smsConfirmAction.kind === 'send_all') {
            setSmsSendResult(null);
            const result = await sendSmsPins.mutateAsync(effectiveElectionId);
            setSmsSendResult(result);
            return;
        }

        if (smsConfirmAction.kind === 'invalidate') {
            await activateStudent.mutateAsync({
                student_id: smsConfirmAction.student_id,
                election_id: effectiveElectionId,
                is_active: false,
            });
            showSuccess(`Access invalidated for ${smsConfirmAction.full_name}.`);
            return;
        }

        const {row} = smsConfirmAction;
        if (smsConfirmAction.kind === 'resend') {
            setResendingStudentId(row.id);
            try {
                await resendSmsPin.mutateAsync({electionId: effectiveElectionId, studentId: row.id});
            } finally {
                setResendingStudentId(null);
            }
            return;
        }

        setGeneratingStudentId(row.id);
        try {
            const data = await generateSmsPin.mutateAsync({electionId: effectiveElectionId, studentId: row.id});
            if (data.voting_pin) {
                setGeneratedPin(data.voting_pin);
                setGeneratedPinStudent(row.full_name);
                setActivationSuccessStudent('');
            }
        } finally {
            setGeneratingStudentId(null);
        }
    };

    const smsConfirmationMessage = smsConfirmAction?.kind === 'send_all'
        ? 'Send a fresh PIN by SMS to all eligible voters in this election?'
        : smsConfirmAction?.kind === 'resend'
            ? 'Send a new PIN by SMS to ' + smsConfirmAction.row.full_name + '?'
            : smsConfirmAction?.kind === 'generate'
                ? 'Generate a PIN for ' + smsConfirmAction.row.full_name + ' without sending an SMS?'
                : `Invalidate ${smsConfirmAction?.full_name}'s current voter access? They will need to be activated again before logging in.`;

    // Query data

    const elections = useMemo(
        () => electionsQuery.data ?? [],
        [electionsQuery.data]
    );

    const students = useMemo(
        () => studentsQuery.data ?? [],
        [studentsQuery.data]
    );

    const electionChoices = elections;

    const selectedElection = elections.find(election => election.id === effectiveElectionId);
    const canActivateVoters = Boolean(
        selectedElection?.status === 'open' &&
        selectedElection.voting_open &&
        selectedElection.ballot_ready &&
        selectedElection.voter_login_mode !== 'sms_pin'
    );
    const activationBlockMessage = !selectedElection
        ? ''
        : selectedElection.status === 'scheduled'
            ? 'Voter activation is available when voting opens.'
            : selectedElection.status === 'paused'
                ? 'Voter activation is unavailable while voting is currently paused.'
                : selectedElection.status === 'ended'
                    ? 'Voter activation is unavailable because voting has ended.'
                    : selectedElection.voter_login_mode === 'sms_pin'
                        ? 'This election uses SMS PINs. Use the Send PINs button to deliver voter access.'
                        : !selectedElection.ballot_ready
                            ? 'Add at least one position and at least one candidate to every position before activating voters.'
                            : '';

    const availableStudents = useMemo(
        () =>
            students.filter(
                student => !student.is_active && !student.has_voted
            ),
        [students]
    );
    const activeStudentCount = useMemo(
        () => students.filter(student => student.is_active).length,
        [students]
    );

    const votedStudentCount = useMemo(
        () => students.filter(student => student.has_voted).length,
        [students]
    );
    const totalActivatedStudentCount = activeStudentCount + votedStudentCount;

    const options = useMemo(() => {
        const query = studentQuery.trim().toLowerCase();

        return availableStudents
            .filter(
                student =>
                    !query ||
                    student.full_name.toLowerCase().includes(query) ||
                    student.student_id.toLowerCase().includes(query)
            )
            .slice(0, 25);
    }, [availableStudents, studentQuery]);

    const selectedStudent =
        students.find(
            student => student.student_id === selectedStudentId
        ) ?? null;

    const isLoading =
        electionsQuery.isLoading ||
        studentsQuery.isLoading;

    const canSendSmsPins = Boolean(
        (user?.role === 'staff' || user?.role === 'superuser') &&
        selectedElection?.voter_login_mode === 'sms_pin' &&
        selectedElection.status === 'open' &&
        selectedElection.voting_open &&
        selectedElection.ballot_ready
    );
    const canViewSmsStatus = user?.role === 'staff' || user?.role === 'superuser';
    const canViewVoterRecovery = canViewSmsStatus;
    const recoveryStatusQuery = useVoterRecoveryStatus(
        effectiveElectionId,
        recoveryStatusPage,
        smsStatusSearch.trim(),
        canViewVoterRecovery && selectedElection?.voter_login_mode !== 'sms_pin'
    );
    const smsStatusQuery = useSmsVoterStatus(
        effectiveElectionId,
        smsStatusPage,
        smsStatusSearch.trim(),
        canViewSmsStatus && selectedElection?.voter_login_mode === 'sms_pin'
    );
    const smsVoters = smsStatusQuery.data?.results ?? [];
    const recoveryVoters = recoveryStatusQuery.data?.results ?? [];

    useEffect(() => {
        setSmsStatusPage(1);
        setRecoveryStatusPage(1);
    }, [effectiveElectionId]);
    // Select the election automatically

    useEffect(() => {
        if (!isScopedRole &&
            electionChoices.length &&
            (!selectedElectionId ||
                !electionChoices.some(
                    election => election.id === selectedElectionId
                ))
        ) {
            setSelectedElectionId(electionChoices[0].id);
        }
    }, [electionChoices, isScopedRole, selectedElectionId]);

    // Student selection

    const chooseStudent = (student: Student) => {
        if (!canActivateVoters) return;

        setSelectedStudentId(student.student_id);

        setStudentQuery(
            student.full_name + ' (' + student.student_id + ')'
        );

        setIsOpen(false);
        setActiveOption(0);
    };

    // Search keyboard navigation

    const handleSearchKeyDown = (
        event: KeyboardEvent<HTMLInputElement>
    ) => {
        if (!canActivateVoters) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);

            setActiveOption(index =>
                Math.min(
                    index + 1,
                    Math.max(options.length - 1, 0)
                )
            );
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);

            setActiveOption(index =>
                Math.max(index - 1, 0)
            );
        }

        if (
            event.key === 'Enter' &&
            isOpen &&
            options[activeOption]
        ) {
            event.preventDefault();
            chooseStudent(options[activeOption]);
        }

        if (event.key === 'Escape') {
            setIsOpen(false);
        }
    };

    // Activate voter

    const handleActivate = (event: FormEvent) => {
        event.preventDefault();

        if (
            !canActivateVoters || !effectiveElectionId || !selectedElection ||
            !selectedStudent || selectedStudent.is_active || selectedStudent.has_voted) {
            return;
        }

        activateStudent.mutate(
            {
                student_id: selectedStudentId,
                election_id: effectiveElectionId,
            },
            {
                onSuccess: data => {
                    if (data.voting_pin) {
                        setGeneratedPin(data.voting_pin);
                        setGeneratedPinStudent(selectedStudent.full_name);
                        setActivationSuccessStudent('');
                    } else {
                        setGeneratedPin(null);
                        setGeneratedPinStudent('');
                        setActivationSuccessStudent(selectedStudent.full_name);
                    }
                    setSelectedStudentId('');
                    setStudentQuery('');
                    setIsOpen(false);
                },
                onError: error => showError(errorMessage(error)),
            }
        );
    };

    // Request errors

    const queryError =
        electionsQuery.error ||
        studentsQuery.error;

    const mutationError = activateStudent.error
        ? errorMessage(activateStudent.error)
        : null;

    return (
        <PageContainer className="activations-page">
            {/* Query error */}

            {queryError && (
                <ErrorState
                    title="Unable to load activation data"
                    message={errorMessage(queryError)}
                />
            )}

            {/* No election */}

            {!selectedElection && !electionsQuery.isLoading && (
                <Alert
                    variant="warning"
                    title="No election available"
                >
                    Assign or create an election before activating voters.
                </Alert>
            )}

            {/* Activation dashboard */}

            {selectedElection && (
                <div className="space-y-5">
                    {/* Election selection */}

                    {/* Activation statistics */}

                    <div className="activation-metrics grid gap-3">
                        <StatisticCard
                            label="Total voters"
                            value={studentsQuery.isError ? '—' : students.length}
                            icon={<FiUsers aria-hidden="true"/>}
                            status="primary"
                            layout="split"
                            style={{height: '4.5rem', width: '100%'}}
                            loading={studentsQuery.isLoading}
                        />

                        <StatisticCard
                            label="Active voters"
                            value={studentsQuery.isError ? '—' : activeStudentCount}
                            icon={<FiCheckCircle aria-hidden="true"/>}
                            status="success"
                            layout="split"
                            style={{height: '4.5rem', width: '100%'}}
                            loading={studentsQuery.isLoading}
                        />

                        <StatisticCard
                            label="Total activated"
                            value={studentsQuery.isError ? '—' : totalActivatedStudentCount}
                            icon={<FiCheckCircle aria-hidden="true"/>}
                            status="success"
                            layout="split"
                            style={{height: '4.5rem', width: '100%'}}
                            loading={studentsQuery.isLoading}
                        />

                        <StatisticCard
                            label="Total voted"
                            value={studentsQuery.isError ? '—' : votedStudentCount}
                            icon={<FiBarChart2 aria-hidden="true"/>}
                            status="strong"
                            layout="split"
                            style={{height: '4.5rem', width: '100%'}}
                            loading={studentsQuery.isLoading}
                        />
                        <StatisticCard
                            label="Yet to Activate"
                            value={studentsQuery.isError ? '—' : availableStudents.length}
                            icon={<FiUserPlus aria-hidden="true"/>}
                            status="info"
                            layout="split"
                            style={{height: '4.5rem', width: '100%'}}
                            loading={studentsQuery.isLoading}
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 md:items-end">
                        <FormField
                            id="activation-election"
                            label="Election"
                        >
                            {isScopedRole ? (
                                <TextInput
                                    value={selectedElection ? `${selectedElection.name} (${selectedElection.year})` : 'Assigned election unavailable'}
                                    readOnly
                                    aria-readonly="true"
                                />
                            ) : (
                                <SelectField
                                    value={effectiveElectionId ?? ''}
                                    onChange={event => {
                                        setSelectedElectionId(event.target.value ? Number(event.target.value) : null);
                                        setSelectedStudentId('');
                                        setStudentQuery('');
                                        setIsOpen(false);
                                        setSmsSendResult(null);
                                        setSmsStatusSearch('');
                                    }}
                                >
                                    {electionChoices.map(election => (
                                        <option key={election.id} value={election.id}>
                                            {election.name} ({election.year})
                                            · {electionStatusPresentation(election.status).label}
                                        </option>
                                    ))}
                                </SelectField>
                            )}
                        </FormField>

                    </div>
                    {/* Voter activation form */}

                    {selectedElection?.voter_login_mode !== 'sms_pin' && !canActivateVoters && activationBlockMessage && (
                        <Alert variant="warning" title="Activation unavailable">
                            {activationBlockMessage}
                        </Alert>
                    )}

                    {smsSendResult && (
                        <div
                            className="activation-pin-banner border border-emerald-200 bg-emerald-100 p-2"
                            role="status"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="font-semibold text-emerald-900">
                                        {smsSendResult.sent > 0
                                            ? 'SMS PIN delivery completed'
                                            : smsSendResult.skipped_valid_pin > 0
                                                ? 'No new PINs were sent'
                                                : smsSendResult.total === 0 || smsSendResult.already_voted === smsSendResult.total
                                                    ? 'No eligible voters require a PIN'
                                                    : 'No PINs were sent'}
                                    </h3>
                                    <p className="mt-1 text-xs text-emerald-800">
                                        {smsSendResult.sent > 0
                                            ? `Sent ${smsSendResult.sent} of ${smsSendResult.eligible} eligible voter PINs.`
                                            : smsSendResult.skipped_valid_pin > 0
                                                ? `${smsSendResult.skipped_valid_pin} voter${smsSendResult.skipped_valid_pin === 1 ? '' : 's'} already have a valid PIN. No new messages were sent to them.`
                                                : smsSendResult.total === 0
                                                    ? 'There are no voters in this election yet.'
                                                    : smsSendResult.already_voted === smsSendResult.total
                                                        ? 'All voters in this election have already voted.'
                                                        : 'No voter PINs were delivered.'}
                                        {smsSendResult.sent > 0 && smsSendResult.skipped_valid_pin > 0 ? ` ${smsSendResult.skipped_valid_pin} already had a valid PIN.` : ''}
                                        {smsSendResult.failed ? ` ${smsSendResult.failed} failed, including ${smsSendResult.missing_phone} without a phone number.` : ''}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    aria-label="Dismiss SMS PIN message"
                                    className="text-emerald-800 cursor-pointer hover:bg-emerald-200 p-2 rounded-full transition-all"
                                    onClick={() => setSmsSendResult(null)}
                                >
                                    <FiX size={18} aria-hidden="true"/>
                                </button>
                            </div>
                        </div>
                    )}

                    {generatedPin && (
                        <div
                            key={generatedPin}
                            className="activation-pin-banner border border-emerald-200 bg-emerald-100 p-2"
                            role="status"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="font-semibold text-emerald-900">
                                        Voter PIN generated
                                    </h3>
                                    <p className="mt-1 text-xs text-emerald-800">
                                        Give this one-time PIN to {generatedPinStudent}.
                                        It will not be shown again after this panel is closed.
                                    </p>
                                    <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.35em] text-blue-700">
                                        {generatedPin}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    aria-label="Dismiss generated PIN"
                                    className="text-emerald-800 cursor-pointer hover:bg-emerald-200 p-2 rounded-full transition-all"
                                    onClick={() => {
                                        setGeneratedPin(null);
                                        setGeneratedPinStudent('');
                                    }}
                                >
                                    <FiX size={18} aria-hidden="true"/>
                                </button>
                            </div>
                        </div>
                    )}

                    {activationSuccessStudent && (
                        <div
                            key={activationSuccessStudent}
                            className="activation-pin-banner border border-emerald-200 bg-emerald-100 p-2"
                            role="status"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="font-semibold text-emerald-900">
                                        Voter activated successfully
                                    </h3>
                                    <p className="mt-1 text-xs text-emerald-800">
                                        {activationSuccessStudent} can now log in with their student ID.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    aria-label="Dismiss activation message"
                                    className="text-emerald-800 cursor-pointer hover:bg-emerald-200 p-2 rounded-full transition-all"
                                    onClick={() => {
                                        setActivationSuccessStudent('');
                                    }}
                                >
                                    <FiX size={18} aria-hidden="true"/>
                                </button>
                            </div>
                        </div>
                    )}

                    <>
                        {selectedElection?.voter_login_mode === 'sms_pin' ? (
                            <>
                                <section className="ui-section">
                                    <div className="ui-section-heading">
                                        <div className="mb-4">
                                            <h2>Send voter PINs by SMS</h2>
                                            <p>
                                                Send a fresh one-hour PIN to every eligible voter with a registered
                                                phone
                                                number.
                                                Voters will use their student ID and the PIN from the message to sign
                                                in.
                                            </p>
                                        </div>
                                        {canViewSmsStatus && effectiveElectionId ? (
                                            <Button
                                                type="button"
                                                leadingIcon={<FiSend aria-hidden="true"/>}
                                                loading={sendSmsPins.isPending}
                                                disabled={!canSendSmsPins}
                                                title={!canSendSmsPins ? (activationBlockMessage || 'SMS PIN delivery is not available for this election yet.') : undefined}
                                                onClick={() => setSmsConfirmAction({kind: 'send_all'})}
                                            >
                                                Send PINs by SMS
                                            </Button>
                                        ) : (
                                            <p className="text-sm text-gray-500">
                                                {activationBlockMessage || 'SMS PIN delivery is not available for this election yet.'}
                                            </p>
                                        )}
                                    </div>
                                </section>

                                {canViewSmsStatus && (
                                    <div
                                        className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
                                        <Button
                                            type="button"
                                            variant="primary"
                                            size="compact"
                                            className="w-full sm:w-auto sm:flex-none"
                                            style={{minHeight: '44px'}}
                                            aria-expanded={isVoterTableVisible}
                                            aria-controls="sms-voter-table-content"
                                            onClick={() => setIsVoterTableVisible(visible => !visible)}
                                        >
                                            <span className="flex items-center justify-center gap-2">
                                                {isVoterTableVisible
                                                    ? <FiEyeOff size={18} className="shrink-0"/>
                                                    : <FiEye size={18} className="shrink-0"/>}
                                                {isVoterTableVisible
                                                    ? 'Hide voter status & recovery'
                                                    : 'View voter status & recovery'}
                                            </span>
                                        </Button>
                                        {isVoterTableVisible &&
                                            <div className="w-full min-w-0 sm:flex-1">
                                                <FormField id="sms-status-search" label="Search voters">
                                                    <TextInput
                                                        className="w-full"
                                                        value={smsStatusSearch}
                                                        onChange={event => {
                                                            setSmsStatusSearch(event.target.value);
                                                            setSmsStatusPage(1);
                                                            setRecoveryStatusPage(1);
                                                        }}
                                                        placeholder="Search by voter ID, name, or phone"
                                                    />
                                                </FormField>
                                            </div>
                                        }
                                    </div>
                                )}
                                {canViewSmsStatus && isVoterTableVisible && (
                                    <section className="ui-section sms-delivery-status" id="sms-voter-table-content">
                                        <div className="ui-section-heading">
                                            <h2>Voter status & recovery</h2>
                                        </div>

                                        {smsStatusQuery.isLoading ? (
                                            <LoadingState
                                                title="Loading SMS status"
                                                message="Fetching voter delivery records."
                                            />
                                        ) : smsStatusQuery.isError ? (
                                            <Alert variant="error" title="SMS status unavailable">
                                                We could not load the voter SMS records.
                                            </Alert>
                                        ) : smsVoters.length === 0 ? (
                                            <EmptyState
                                                title={smsStatusSearch ? 'No matching voters' : 'No voters to display'}
                                                message={smsStatusSearch ? 'Try a different search term.' : 'Add voters to this election to track SMS delivery.'}
                                            />
                                        ) : (
                                            <div className="management-table-wrap sms-delivery-table-wrap">
                                                <table className="management-table sms-delivery-table">
                                                    <caption className="sr-only">SMS delivery status by voter</caption>
                                                    <thead>
                                                    <tr>
                                                        <th scope="col">S/N</th>
                                                        <th scope="col">Voter</th>
                                                        <th scope="col">Phone</th>
                                                        <th scope="col">SMS status</th>
                                                        <th scope="col">Last attempt</th>
                                                        <th scope="col">PIN expiry</th>
                                                        <th scope="col">Actions</th>
                                                    </tr>
                                                    </thead>
                                                    <tbody>
                                                    {smsVoters.map((row, index) => (
                                                        <tr key={index}>
                                                            <td data-label="S/N">{index + 1}</td>
                                                            <td data-label="Voter">
                                                                <div
                                                                    className="management-table-cell--primary">{row.full_name}</div>
                                                                <div
                                                                    className="text-xs text-gray-500">{row.student_id}</div>
                                                            </td>
                                                            <td data-label="Phone">{row.phone_number || '—'}</td>
                                                            <td data-label='SMS status'>
                                                                {smsStatusLabels[row.status]}

                                                            </td>
                                                            <td data-label="Last attempt">{formatSmsDate(row.last_attempt_at)}</td>
                                                            <td data-label="PIN expiry">
                                                                {row.status === 'sent' || row.status === 'generated' ? `${formatSmsDate(row.pin_expires_at)}` : row.status === 'expired' ? formatSmsDate(row.pin_expires_at) : '—'}
                                                            </td>
                                                            <td data-label='Actions'>
                                                                <div className='flex flex-wrap justify-end gap-2'>
                                                                    {canSendSmsToVoter(row) && (
                                                                        <Button
                                                                            type='button'
                                                                            variant='success'
                                                                            style={{
                                                                                width: '80px',
                                                                                minWidth: '60px',
                                                                                padding: '4px 1px',
                                                                                flexShrink: 0
                                                                            }}
                                                                            size='compact'
                                                                            loading={resendingStudentId === row.id}
                                                                            disabled={!canSendSmsPins || resendingStudentId !== null || generatingStudentId !== null}
                                                                            onClick={() => setSmsConfirmAction({
                                                                                kind: 'resend',
                                                                                row
                                                                            })}
                                                                        >

                                                                            <div
                                                                                className="flex flex-row gap-1 items-center">
                                                                                <BsSendFill size={13}/>
                                                                                {smsVoterActionLabel(row)}
                                                                            </div>
                                                                        </Button>
                                                                    )}
                                                                    {canGenerateSmsPinForVoter(row) && (
                                                                        <Button
                                                                            type='button'
                                                                            variant='primary'
                                                                            style={{
                                                                                width: '80px',
                                                                                minWidth: '60px',
                                                                                padding: '4px 1px',
                                                                                flexShrink: 0
                                                                            }}
                                                                            size='compact'
                                                                            loading={generatingStudentId === row.id}
                                                                            disabled={!canSendSmsPins || resendingStudentId !== null || generatingStudentId !== null}
                                                                            onClick={() => setSmsConfirmAction({
                                                                                kind: 'generate',
                                                                                row
                                                                            })}
                                                                        >
                                                                            <div
                                                                                className="flex flex-row gap-1 items-center">
                                                                                <BsFillGearFill size={13}/>
                                                                                Generate
                                                                            </div>
                                                                        </Button>
                                                                    )}
                                                                    {(row.status === 'sent' || row.status === 'generated') && (
                                                                        <Button
                                                                            type="button"
                                                                            variant="danger"
                                                                            size="compact"
                                                                            disabled={resendingStudentId !== null || generatingStudentId !== null}
                                                                            onClick={() => setSmsConfirmAction({
                                                                                kind: 'invalidate',
                                                                                student_id: row.student_id,
                                                                                full_name: row.full_name
                                                                            })}
                                                                        >Invalidate</Button>
                                                                    )}
                                                                    {!canSendSmsToVoter(row) && !canGenerateSmsPinForVoter(row) && row.status !== 'sent' && row.status !== 'generated' && (
                                                                        <span className='text-xs text-gray-400'>—</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    </tbody>
                                                </table>

                                                <TablePagination count={smsStatusQuery.data?.count ?? 0}
                                                                 page={smsStatusPage} onChange={setSmsStatusPage}/>

                                            </div>

                                        )}
                                    </section>
                                )}
                            </>
                        ) : (
                            <>
                                <section className="ui-section">
                                    <div className="ui-section-heading">
                                        <div>
                                            <h2>Activate a voter</h2>

                                            <p>
                                                Search by voter ID or name, select a
                                                result, and confirm activation.
                                            </p>
                                        </div>

                                    </div>

                                    <form
                                        onSubmit={handleActivate}
                                        className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end"
                                    >
                                        <FormField
                                            id="activation-student"
                                            label="Voter"
                                        >
                                            <div className="relative">
                                                <div className="relative">

                                                    <TextInput
                                                        className="pl-9"
                                                        value={studentQuery}
                                                        onChange={event => {
                                                            setStudentQuery(
                                                                event.target.value
                                                            );
                                                            setSelectedStudentId('');
                                                            setIsOpen(true);
                                                            setActiveOption(0);
                                                        }}
                                                        onFocus={() => setIsOpen(true)}
                                                        onKeyDown={handleSearchKeyDown}
                                                        placeholder="Search name or voter ID"
                                                        role="combobox"
                                                        aria-expanded={isOpen}
                                                        aria-controls={listboxId}
                                                        aria-autocomplete="list"
                                                        aria-activedescendant={
                                                            isOpen && options[activeOption]
                                                                ? 'activation-option-' +
                                                                options[activeOption].id
                                                                : undefined
                                                        }
                                                        disabled={
                                                            !availableStudents.length || !canActivateVoters
                                                        }
                                                    />
                                                </div>

                                                {/* Search results */}

                                                {isOpen && canActivateVoters && (
                                                    <div
                                                        id={listboxId}
                                                        role="listbox"
                                                        className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg"
                                                    >
                                                        {options.length ? (
                                                            options.map(
                                                                (student, index) => (
                                                                    <button
                                                                        id={
                                                                            'activation-option-' +
                                                                            student.id
                                                                        }
                                                                        key={student.id}
                                                                        type="button"
                                                                        role="option"
                                                                        aria-selected={
                                                                            index ===
                                                                            activeOption
                                                                        }
                                                                        className={
                                                                            'block w-full rounded px-3 py-2 text-left text-sm ' +
                                                                            (
                                                                                index ===
                                                                                activeOption
                                                                                    ? 'bg-blue-50 text-blue-900'
                                                                                    : 'text-gray-700 hover:bg-gray-50'
                                                                            )
                                                                        }
                                                                        onMouseDown={event =>
                                                                            event.preventDefault()
                                                                        }
                                                                        onClick={() =>
                                                                            chooseStudent(
                                                                                student
                                                                            )
                                                                        }
                                                                    >
                                                            <span className="font-medium">
                                                                {
                                                                    student.full_name
                                                                }
                                                            </span>

                                                                        <span className="ml-2 text-xs text-gray-500">
                                                                {
                                                                    student.student_id
                                                                }
                                                                            {' - '}
                                                                            {
                                                                                student.class_name
                                                                            }
                                                            </span>
                                                                    </button>
                                                                )
                                                            )
                                                        ) : (
                                                            <p
                                                                className="px-3 py-2 text-xs text-gray-500"
                                                                role="status"
                                                            >
                                                                No matching eligible
                                                                voters.
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </FormField>

                                        <Button
                                            type="submit"
                                            loading={activateStudent.isPending}
                                            disabled={
                                                !selectedStudentId ||
                                                !effectiveElectionId ||
                                                !canActivateVoters
                                            }
                                            leadingIcon={
                                                <FiUserPlus aria-hidden="true"/>
                                            }
                                        >
                                            Activate voter
                                        </Button>
                                    </form>

                                    {/* Selected voter details */}

                                    {selectedStudent && (
                                        <div
                                            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-gray-50 p-3">
                                            <div>
                                                <p className="text-sm font-medium">
                                                    {selectedStudent.full_name}
                                                </p>

                                                <p className="text-xs text-gray-500">
                                                    {selectedStudent.student_id}
                                                    {' - '}
                                                    {selectedStudent.class_name}
                                                </p>
                                            </div>

                                            <div className="flex gap-2">
                                                <Badge
                                                    variant={
                                                        selectedStudent.is_active
                                                            ? 'success'
                                                            : 'neutral'
                                                    }
                                                >
                                                    {selectedStudent.is_active
                                                        ? 'Active'
                                                        : 'Inactive'}
                                                </Badge>

                                                <Badge
                                                    variant={
                                                        selectedStudent.has_voted
                                                            ? 'primary'
                                                            : 'neutral'
                                                    }
                                                >
                                                    {selectedStudent.has_voted
                                                        ? 'Voted'
                                                        : 'Not voted'}
                                                </Badge>
                                            </div>
                                        </div>
                                    )}

                                    {/* Activation error */}

                                    {mutationError && (
                                        <Alert
                                            variant="error"
                                            title="Activation failed"
                                            className="mt-4"
                                        >
                                            {mutationError}
                                        </Alert>
                                    )}
                                </section>
                            </>
                        )}
                    </>

                    {canViewVoterRecovery && selectedElection.voter_login_mode !== 'sms_pin' && (
                        <>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
                                <Button
                                    type="button"
                                    variant="primary"
                                    size="compact"
                                    style={{minHeight: "44px"}}
                                    aria-expanded={isVoterTableVisible} aria-controls="voter-recovery-table-content"
                                    onClick={() => setIsVoterTableVisible(visible => !visible)}>

                                    <span className="flex items-center justify-center gap-2">
                                                {isVoterTableVisible
                                                    ? <FiEyeOff size={20} className="shrink-0"/>
                                                    : <FiEye size={20} className="shrink-0"/>}
                                        {isVoterTableVisible
                                            ? 'Hide voter status & recovery'
                                            : 'View voter status & recovery'}
                                    </span>
                                </Button>
                                {isVoterTableVisible &&

                                    <div className="w-full min-w-0 sm:flex-1">
                                        <FormField id="recovery-voter-search" label="Search voters">
                                            <TextInput
                                                type="search"
                                                value={smsStatusSearch}
                                                onChange={event => {
                                                    setSmsStatusSearch(event.target.value);
                                                    setSmsStatusPage(1);
                                                    setRecoveryStatusPage(1);
                                                }}
                                                placeholder="Search by student ID, name or phone number"
                                            />
                                        </FormField>
                                    </div>
                                }
                            </div>
                            {isVoterTableVisible && (
                                <section className="ui-section" aria-labelledby="voter-recovery-title"
                                         id="voter-recovery-table-content">
                                    <div className="ui-section-heading">
                                        <h2 id="voter-recovery-title">Voter access and recovery</h2>

                                    </div>
                                    {recoveryStatusQuery.isLoading ? (
                                        <LoadingState title="Loading voter access"
                                                      message="Checking current voter eligibility."/>
                                    ) : recoveryStatusQuery.isError ? (
                                        <Alert variant="error" title="Voter access status unavailable">We could not load
                                            current login eligibility.</Alert>
                                    ) : recoveryVoters.length === 0 ? (
                                        <EmptyState
                                            title={smsStatusSearch ? 'No matching voters' : 'No voters to display'}
                                            message={smsStatusSearch ? 'Try a different search term.' : 'Add voters to this election to review access.'}/>
                                    ) : (
                                        <div className="management-table-wrap">
                                            <table className="management-table">
                                                <caption className="sr-only">Voter login eligibility and recovery
                                                    actions
                                                </caption>
                                                <thead>
                                                <tr>
                                                    <th scope="col">S/N</th>
                                                    <th scope="col">ID</th>
                                                    <th scope="col">Voter</th>
                                                    <th scope="col">Access status</th>
                                                    <th scope="col">Why</th>
                                                    <th scope="col">Actions</th>
                                                </tr>
                                                </thead>
                                                <tbody>{recoveryVoters.map((row, index) => (
                                                    <tr key={index}>
                                                        <td data-label="S/N">{index + 1}</td>
                                                        <td data-label="Voter ID">{row.student_id}</td>
                                                        <td data-label="Voter">{row.full_name}</td>
                                                        <td data-label="Access status">{recoveryStateLabel(row)}</td>
                                                        <td data-label="Why">{row.reason}</td>
                                                        <td data-label="Actions">
                                                            <div className="flex flex-wrap justify-end gap-2">
                                                                {!row.is_active && !row.has_voted && (
                                                                    <Button
                                                                        type="button"
                                                                        variant="primary"
                                                                        size="compact"
                                                                        style={{minWidth: '95px', minHeight: "30px"}}
                                                                        disabled={!canActivateVoters || activateStudent.isPending}
                                                                        title={!canActivateVoters ? activationBlockMessage : undefined}
                                                                        onClick={() => activateStudent.mutate({
                                                                                student_id: row.student_id,
                                                                                election_id: effectiveElectionId!
                                                                            },
                                                                            {
                                                                                onSuccess: data => {
                                                                                    if (data.voting_pin) {
                                                                                        setGeneratedPin(data.voting_pin);
                                                                                        setGeneratedPinStudent(row.full_name);
                                                                                    } else setActivationSuccessStudent(row.full_name);
                                                                                },
                                                                                onError: error => showError(errorMessage(error))
                                                                            })}>
                                                                        <div
                                                                            className="flex justify-between items-center gap-2">
                                                                            <FiPower/>
                                                                            Activate
                                                                        </div>
                                                                    </Button>
                                                                )}
                                                                {
                                                                    row.can_invalidate &&
                                                                    <Button
                                                                        type="button"
                                                                        variant="danger"
                                                                        size="compact"
                                                                        style={{minWidth: '95px', minHeight: "30px"}}
                                                                        onClick={() => setSmsConfirmAction({
                                                                            kind: 'invalidate',
                                                                            student_id: row.student_id,
                                                                            full_name: row.full_name
                                                                        })}>
                                                                        <div
                                                                            className="flex justify-between items-center gap-2">
                                                                            <MdPersonOff/>
                                                                            Disable
                                                                        </div>
                                                                    </Button>}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}</tbody>
                                            </table>
                                            <TablePagination count={recoveryStatusQuery.data?.count ?? 0}
                                                             page={recoveryStatusPage}
                                                             onChange={setRecoveryStatusPage}/>
                                        </div>
                                    )}
                                </section>
                            )}
                        </>
                    )}

                    {/* Empty and loading states */}

                    {!isLoading && !availableStudents.length && (
                        <EmptyState
                            title="No voters available"
                            message="All voters are active, have voted, or are not present in this election."
                            icon={<FiUserX aria-hidden="true"/>}
                        />
                    )}

                    {isLoading && (
                        <LoadingState
                            title="Loading activation data"
                            message="Fetching the selected election and eligible voters."
                        />
                    )}
                </div>
            )}
            <ConfirmModal
                isOpen={Boolean(smsConfirmAction)}
                onClose={() => setSmsConfirmAction(null)}
                onConfirm={confirmSmsAction}
                title={smsConfirmAction?.kind === 'send_all' ? 'Send PINs by SMS' : smsConfirmAction?.kind === 'resend' ? 'Resend voter PIN' : smsConfirmAction?.kind === 'invalidate' ? 'Invalidate voter access' : 'Generate voter PIN'}
                message={smsConfirmationMessage}
                confirmText={smsConfirmAction?.kind === 'send_all' ? 'Send PINs' : smsConfirmAction?.kind === 'resend' ? 'Resend PIN' : smsConfirmAction?.kind === 'invalidate' ? 'Invalidate access' : 'Generate PIN'}
                cancelText='Cancel'
                type='warning'
            />
        </PageContainer>
    );
}
