
import {
    type FormEvent,
    type KeyboardEvent,
    useEffect,
    useMemo,
    useState,
} from 'react';

import {
    FiCheckCircle,
    FiUserPlus,
    FiUsers,
    FiUserX,
} from 'react-icons/fi';

import {useElections} from '../../queries/useElections';
import {useAuth} from '../../hooks/useAuth';
import {type Student, useStudents} from '../../queries/useStudents';
import {useDashboardStats} from '../../queries/useDashboard';
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

    const listboxId = 'activation-student-options';

    // Queries and mutation

    const electionsQuery = useElections();
    const effectiveElectionId = isScopedRole
        ? user?.assignedElection?.id ?? null
        : selectedElectionId;
    const studentsQuery = useStudents(effectiveElectionId);
    const statsQuery = useDashboardStats(effectiveElectionId);
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

    const activeElections = useMemo(
        () => elections.filter(election => election.is_active),
        [elections]
    );

    const activeElection = elections.find(
        election => election.is_active
    );

    const availableStudents = useMemo(
        () =>
            students.filter(
                student => !student.is_active && !student.has_voted
            ),
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
        studentsQuery.isLoading ||
        statsQuery.isLoading;

    // Select the active election automatically

    useEffect(() => {
        if (!isScopedRole &&
            activeElections.length &&
            (!selectedElectionId ||
                !activeElections.some(
                    election => election.id === selectedElectionId
                ))
        ) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelectedElectionId(activeElections[0].id);
        }
    }, [activeElections, isScopedRole, selectedElectionId]);

    // Student selection

    const chooseStudent = (student: Student) => {
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

        if (!effectiveElectionId || !selectedStudentId) {
            return;
        }

        activateStudent.mutate(
            {
                student_id: selectedStudentId,
                election_id: effectiveElectionId,
            },
            {
                onSuccess: () => {
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
        studentsQuery.error ||
        statsQuery.error;

    const mutationError = activateStudent.error
        ? errorMessage(activateStudent.error)
        : null;

    return (
        <PageContainer>
            {/* Query error */}

            {queryError && (
                <ErrorState
                    title="Unable to load activation data"
                    message={errorMessage(queryError)}
                />
            )}

            {/* No active election */}

            {!activeElection && !electionsQuery.isLoading && (
                <Alert
                    variant="warning"
                    title="No active election"
                >
                    Voter activation is only available when an election is
                    active.
                </Alert>
            )}

            {/* Activation dashboard */}

            {activeElection && (
                <div className="space-y-5">
                    {/* Election selection */}

                    {/* Activation statistics */}

                    <div className="grid gap-3 sm:grid-cols-3">
                        <StatisticCard
                            label="Total voters"
                            value={
                                statsQuery.data?.total_students ??
                                students.length
                            }
                            icon={<FiUsers aria-hidden="true" />}
                        />

                        <StatisticCard
                            label="Active voters"
                            value={
                                statsQuery.data?.active_students ??
                                students.filter(
                                    student => student.is_active
                                ).length
                            }
                            icon={<FiCheckCircle aria-hidden="true" />}
                        />

                        <StatisticCard
                            label="Available to activate"
                            value={availableStudents.length}
                            icon={<FiUserPlus aria-hidden="true" />}
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 md:items-end">
                        <FormField
                            id="activation-election"
                            label="Active election"
                        >
                            {isScopedRole ? (
                                <TextInput
                                    value={activeElection ? `${activeElection.name} (${activeElection.year})` : 'Assigned election unavailable'}
                                    readOnly
                                    aria-readonly="true"
                                />
                            ) : (
                                <SelectField
                                    value={effectiveElectionId ?? ''}
                                    onChange={event => setSelectedElectionId(event.target.value ? Number(event.target.value) : null)}
                                >
                                    {activeElections.map(election => (
                                        <option key={election.id} value={election.id}>
                                            {election.name} ({election.year})
                                        </option>
                                    ))}
                                </SelectField>
                            )}
                        </FormField>

                    </div>
                    {/* Voter activation form */}

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
                                                !availableStudents.length
                                            }
                                        />
                                    </div>

                                    {/* Search results */}

                                    {isOpen && (
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
                                    !effectiveElectionId
                                }
                                leadingIcon={
                                    <FiUserPlus aria-hidden="true" />
                                }
                            >
                                Activate voter
                            </Button>
                        </form>

                        {/* Selected voter details */}

                        {selectedStudent && (
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-gray-50 p-3">
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
                            icon={<FiUserX aria-hidden="true" />}
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
