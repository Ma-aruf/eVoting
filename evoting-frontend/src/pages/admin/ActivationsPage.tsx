import {type FormEvent, type KeyboardEvent, useEffect, useMemo, useState,} from 'react';

import {FiCheckCircle, FiUserPlus, FiUsers, FiUserX, FiX,} from 'react-icons/fi';

import {useElections} from '../../queries/useElections';
import {electionStatusPresentation} from '../../utils/electionLifecycle';
import {useAuth} from '../../hooks/useAuth';
import {type Student, useStudents} from '../../queries/useStudents';
import {useActivateStudent} from '../../queries/useActivations';

import {showError} from '../../utils/toast';

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

export default function ActivationsPage() {
    const {user} = useAuth();
    const isScopedRole = user?.role === 'activator' || user?.role === 'staff';
    // Selection and search state

    const [selectedElectionId, setSelectedElectionId] =
        useState<number | null>(null);

    const [studentQuery, setStudentQuery] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [activeOption, setActiveOption] = useState(0);
    const [generatedPin, setGeneratedPin] = useState<string | null>(null);
    const [generatedPinStudent, setGeneratedPinStudent] = useState('');

    const listboxId = 'activation-student-options';

    // Queries and mutation

    const electionsQuery = useElections({refetchInterval: 45_000});
    const effectiveElectionId = isScopedRole
        ? user?.assignedElection?.id ?? null
        : selectedElectionId;
    const studentsQuery = useStudents(effectiveElectionId, {refetchInterval: 10_000});
    const activateStudent = useActivateStudent();

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
        selectedElection.ballot_ready
    );
    const activationBlockMessage = !selectedElection
        ? ''
        : selectedElection.status === 'scheduled'
            ? 'Voter activation is available when voting opens.'
            : selectedElection.status === 'paused'
                ? 'Voter activation is unavailable while voting is currently paused.'
                : selectedElection.status === 'ended'
                    ? 'Voter activation is unavailable because voting has ended.'
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
    const activatedStudentCount = useMemo(
        () => students.filter(student => student.is_active).length,
        [students]
    );

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

    // Select the election automatically

    useEffect(() => {
        if (!isScopedRole &&
            electionChoices.length &&
            (!selectedElectionId ||
                !electionChoices.some(
                    election => election.id === selectedElectionId
                ))
        ) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
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

                    <div className="grid gap-3 sm:grid-cols-3">
                        <StatisticCard
                            label="Total voters"
                            value={studentsQuery.isError ? '—' : students.length}
                            icon={<FiUsers aria-hidden="true"/>}
                            status="primary"
                            layout="split"
                            loading={studentsQuery.isLoading}
                        />

                        <StatisticCard
                            label="Activated voters"
                            value={studentsQuery.isError ? '—' : activatedStudentCount}
                            icon={<FiCheckCircle aria-hidden="true"/>}
                            status="success"
                            layout="split"
                            loading={studentsQuery.isLoading}
                        />

                        <StatisticCard
                            label="Available to activate"
                            value={studentsQuery.isError ? '—' : availableStudents.length}
                            icon={<FiUserPlus aria-hidden="true"/>}
                            status="info"
                            layout="split"
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

                    {!canActivateVoters && activationBlockMessage && (
                        <Alert variant="warning" title="Activation unavailable">
                            {activationBlockMessage}
                        </Alert>
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
        </PageContainer>
    );
}
