import {type FormEvent, useEffect, useMemo, useState,} from 'react';

import {
    FiBarChart2,
    FiCheckCircle,
    FiUserPlus,
    FiUsers,
    FiUserX,
    FiX,
} from 'react-icons/fi';

import {useElections} from '../../queries/useElections';
import {electionStatusPresentation} from '../../utils/electionLifecycle';
import {useAuth} from '../../hooks/useAuth';
import {useActivateStudent} from '../../queries/useActivations';
import {
    type SmsPinSendResponse,
    type SmsVoterStatusRow,
    useGenerateSmsPin,
    useResendSmsPin,
    useSendSmsPins,
    useSmsVoterStatus,
    useVoterRecoveryStatus,
} from '../../queries/useSmsPins';

import {showError, showSuccess} from '../../utils/toast';

import PageContainer from '../../components/PageContainer';
import StatisticCard from '../../components/StatisticCard';

import FormField from '../../components/ui/FormField';
import TextInput from '../../components/ui/TextInput';
import SelectField from '../../components/ui/SelectField';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import LoadingState from '../../components/ui/LoadingState';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import ConfirmModal from '../../components/ConfirmModal';
import {errorMessage} from './activations/activationHelpers';
import ManualActivationPanel from './activations/ManualActivationPanel';
import SmsActivationPanel from './activations/SmsActivationPanel';
import VoterRecoveryPanel from './activations/VoterRecoveryPanel';
import {useActivationStudentSelection} from './activations/useActivationStudentSelection';

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

    const selectedElection = (electionsQuery.data ?? []).find(election => election.id === effectiveElectionId);
    const canActivateVoters = Boolean(
        selectedElection?.status === 'open' &&
        selectedElection.voting_open &&
        selectedElection.ballot_ready &&
        selectedElection.voter_login_mode !== 'sms_pin'
    );
    const studentSelection = useActivationStudentSelection(effectiveElectionId, canActivateVoters);
    const {
        studentsQuery, students, selectedStudent, studentQuery, setStudentQuery,
        selectedStudentId, setSelectedStudentId, isOpen, setIsOpen, activeOption,
        setActiveOption, chooseStudent, handleSearchKeyDown,
        resetForElectionChange, resetAfterActivation,
    } = studentSelection;
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

    const electionChoices = elections;

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

    const summary = studentsQuery.data?.summary;
    const availableStudentCount = summary?.available ?? 0;
    const activeStudentCount = summary?.activated ?? 0;
    const votedStudentCount = summary?.voted ?? 0;
    const totalActivatedStudentCount = activeStudentCount + votedStudentCount;
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
                    resetAfterActivation();
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
                            value={studentsQuery.isError ? '—' : summary?.total ?? 0}
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
                            value={studentsQuery.isError ? '—' : availableStudentCount}
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
                                        resetForElectionChange();
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

                    {selectedElection.voter_login_mode === 'sms_pin' ? (
                        <SmsActivationPanel
                            rows={smsVoters}
                            isLoading={smsStatusQuery.isLoading}
                            isError={smsStatusQuery.isError}
                            hasSearch={Boolean(smsStatusSearch)}
                            canViewStatus={canViewSmsStatus}
                            canShowSendButton={Boolean(canViewSmsStatus && effectiveElectionId)}
                            canSendPins={canSendSmsPins}
                            activationBlockMessage={activationBlockMessage}
                            isSendPending={sendSmsPins.isPending}
                            isVisible={isVoterTableVisible}
                            search={smsStatusSearch}
                            resendingStudentId={resendingStudentId}
                            generatingStudentId={generatingStudentId}
                            pagination={<TablePagination count={smsStatusQuery.data?.count ?? 0} page={smsStatusPage} onChange={setSmsStatusPage}/>}
                            onToggleVisibility={() => setIsVoterTableVisible(visible => !visible)}
                            onSearchChange={value => {
                                setSmsStatusSearch(value);
                                setSmsStatusPage(1);
                                setRecoveryStatusPage(1);
                            }}
                            onSendAll={() => setSmsConfirmAction({kind: 'send_all'})}
                            onResend={row => setSmsConfirmAction({kind: 'resend', row})}
                            onGenerate={row => setSmsConfirmAction({kind: 'generate', row})}
                            onInvalidate={row => setSmsConfirmAction({kind: 'invalidate', student_id: row.student_id, full_name: row.full_name})}
                        />
                    ) : (
                        <ManualActivationPanel
                            students={students}
                            selectedStudent={selectedStudent}
                            studentQuery={studentQuery}
                            selectedStudentId={selectedStudentId}
                            isOpen={isOpen}
                            activeOption={activeOption}
                            listboxId={listboxId}
                            availableStudentCount={availableStudentCount}
                            hasElection={Boolean(effectiveElectionId)}
                            canActivateVoters={canActivateVoters}
                            isPending={activateStudent.isPending}
                            mutationError={mutationError}
                            onQueryChange={value => {
                                setStudentQuery(value);
                                setSelectedStudentId('');
                                setIsOpen(true);
                                setActiveOption(0);
                            }}
                            onOpenChange={setIsOpen}
                            onSearchKeyDown={handleSearchKeyDown}
                            onChooseStudent={chooseStudent}
                            onSubmit={handleActivate}
                        />
                    )}

                    {canViewVoterRecovery && selectedElection.voter_login_mode !== 'sms_pin' && (
                        <VoterRecoveryPanel
                            rows={recoveryVoters}
                            isLoading={recoveryStatusQuery.isLoading}
                            isError={recoveryStatusQuery.isError}
                            hasSearch={Boolean(smsStatusSearch)}
                            isVisible={isVoterTableVisible}
                            search={smsStatusSearch}
                            canActivateVoters={canActivateVoters}
                            activationBlockMessage={activationBlockMessage}
                            activationPending={activateStudent.isPending}
                            pagination={<TablePagination count={recoveryStatusQuery.data?.count ?? 0} page={recoveryStatusPage} onChange={setRecoveryStatusPage}/>}
                            onToggleVisibility={() => setIsVoterTableVisible(visible => !visible)}
                            onSearchChange={value => {
                                setSmsStatusSearch(value);
                                setSmsStatusPage(1);
                                setRecoveryStatusPage(1);
                            }}
                            onActivate={row => activateStudent.mutate(
                                {student_id: row.student_id, election_id: effectiveElectionId!},
                                {
                                    onSuccess: data => {
                                        if (data.voting_pin) {
                                            setGeneratedPin(data.voting_pin);
                                            setGeneratedPinStudent(row.full_name);
                                        } else setActivationSuccessStudent(row.full_name);
                                    },
                                    onError: error => showError(errorMessage(error)),
                                },
                            )}
                            onDisable={row => setSmsConfirmAction({kind: 'invalidate', student_id: row.student_id, full_name: row.full_name})}
                        />
                    )}

                    {/* Empty and loading states */}

                    {!isLoading && !availableStudentCount && (
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
