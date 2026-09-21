import {type FormEvent, useEffect, useMemo, useState} from 'react';
import {FiEdit2, FiPlus, FiTrash2, FiUsers,} from 'react-icons/fi';
import {useQueryClient} from '@tanstack/react-query';

import {useElections} from '../../queries/useElections';
import {useAuth} from '../../hooks/useAuth';
import {type Position, usePositions} from '../../queries/usePositions';
import {type Student, getStudentElectionId, useStudents} from '../../queries/useStudents';
import {
    type Candidate,
    useCandidates,
    useCreateCandidate,
    useDeleteCandidate,
    useUpdateCandidate,
} from '../../queries/useCandidates';
import {queryKeys} from '../../queries/queryKeys';

import {showError} from '../../utils/toast';
import {useConfirmModal} from '../../hooks/useConfirmModal';

import ConfirmModal from '../../components/ConfirmModal';
import ImageUpload from '../../components/ImageUpload';
import CandidateCard from '../../components/CandidateCard';
import CandidateStudentCombobox from '../../components/CandidateStudentCombobox';
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
import IconButton from '../../components/ui/IconButton';
import Modal from '../../components/ui/Modal';

type ApiError = {
    response?: {
        data?: unknown;
    };
};

const errorDetail = (error: unknown) => {
    const detail = (error as ApiError)?.response?.data;

    if (typeof detail === 'string') {
        return detail;
    }

    if (detail && typeof detail === 'object') {
        const values = Object.values(
            detail as Record<string, unknown>
        )
            .flatMap(value =>
                Array.isArray(value) ? value : [value]
            )
            .filter(value => typeof value === 'string');

        return values[0] || 'The candidate request could not be completed.';
    }

    return 'The candidate request could not be completed.';
};

// Candidate form

type CandidateFormProps = {
    mode: 'create' | 'edit';
    electionId: number | null;
    positionId: number | null;
    positions: Position[];
    students: Student[];
    studentId: number | null;
    studentQuery: string;
    photoUrl: string;
    ballotNumber: number;
    pending: boolean;
    onStudentChange: (student: Student) => void;
    onQueryChange: (query: string) => void;
    onPhotoChange: (url: string) => void;
    onBallotChange: (value: number) => void;
    onSubmit: (event: FormEvent) => void;
    onCancel?: () => void;
    editableContext?: boolean;
    onElectionChange?: (id: number) => void;
    onPositionChange?: (id: number) => void;
    elections?: {
        id: number;
        name: string;
        year: number;
    }[];
    locked?: boolean;
    scopedRole?: boolean;
};

function CandidateForm({
                           mode,
                           electionId,
                           positionId,
                           positions,
                           students,
                           studentId,
                           studentQuery,
                           photoUrl,
                           ballotNumber,
                           pending,
                           onStudentChange,
                           onQueryChange,
                           onPhotoChange,
                           onBallotChange,
                           onSubmit,
                           onCancel,
                           editableContext = false,
                           onElectionChange,
                           onPositionChange,
                           elections = [],
                           locked = false,
                           scopedRole = false,
                       }: CandidateFormProps) {
    return (
        <form
            onSubmit={onSubmit}
            className="candidate-form grid gap-4 md:grid-cols-2"
        >
            <FormField
                id={`${mode}-candidate-election`}
                label="Election"
            >
                {scopedRole ? (
                    <TextInput value={elections.find(election => election.id === electionId)?.name ?? 'Assigned election unavailable'} readOnly aria-readonly="true" />
                ) : (
                    <SelectField
                        value={electionId ?? ''}
                        disabled={locked || !editableContext}
                        onChange={event => onElectionChange?.(Number(event.target.value))}
                    >
                        <option value="">Select an election</option>
                        {elections.map(election => (
                            <option key={election.id} value={election.id}>
                                {election.name} ({election.year})
                            </option>
                        ))}
                    </SelectField>
                )}
            </FormField>

            <FormField
                id={`${mode}-candidate-position`}
                label="Position"
            >
                <SelectField
                    value={positionId ?? ''}
                    disabled={locked || !editableContext || !electionId}
                    onChange={event =>
                        onPositionChange?.(Number(event.target.value))
                    }
                >
                    <option value="">
                        Select a position
                    </option>

                    {positions.map(position => (
                        <option
                            key={position.id}
                            value={position.id}
                        >
                            {position.name}
                        </option>
                    ))}
                </SelectField>
            </FormField>

            <CandidateStudentCombobox
                id={`${mode}-candidate-student`}
                students={students}
                value={studentId}
                query={studentQuery}
                onChange={onQueryChange}
                onSelect={onStudentChange}
                disabled={locked || !positionId}
            />

            <FormField
                id={`${mode}-candidate-ballot`}
                label="Ballot number"
                helperText="Numbers must be unique within this position."
                required
            >
                <TextInput
                    type="number"
                    min="0"
                    value={ballotNumber}
                    onChange={event =>
                        onBallotChange(Number(event.target.value))
                    }
                    required
                    readOnly={mode === 'edit'}
                    disabled={locked}
                />
            </FormField>

            <FormField
                id={`${mode}-candidate-photo`}
                label="Candidate photo"
                helperText="Optional JPEG, PNG or WebP image, up to 5MB."
            >
                <ImageUpload
                    currentImageUrl={photoUrl || undefined}
                    onUploadSuccess={onPhotoChange}
                    disabled={locked}
                />
            </FormField>

            <div className="candidate-form-actions flex justify-end gap-2 md:col-span-2">
                {onCancel && (
                    <Button
                        type="button"
                        variant="quiet"
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                )}

                <Button
                    type="submit"
                    loading={pending}
                    disabled={locked || !electionId || !positionId || !studentId}
                >
                    {mode === 'create'
                        ? 'Add candidate'
                        : 'Save changes'}
                </Button>
            </div>
        </form>
    );
}

// Candidates page

export default function CandidatesPage() {
    const {user} = useAuth();
    const isScopedRole = user?.role === 'staff' || user?.role === 'activator';
    // Selection and form state

    const [selectedElectionId, setSelectedElectionId] =
        useState<number | null>(null);

    const [selectedPositionId, setSelectedPositionId] =
        useState<number | null>(null);

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentTime, setCurrentTime] = useState(() => Date.now());

    const [studentId, setStudentId] = useState<number | null>(null);
    const [studentQuery, setStudentQuery] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [ballotNumber, setBallotNumber] = useState(0);

    // Edit state

    const [editingCandidate, setEditingCandidate] =
        useState<Candidate | null>(null);

    const [editElectionId, setEditElectionId] =
        useState<number | null>(null);

    const [editPositionId, setEditPositionId] =
        useState<number | null>(null);

    const [editStudentId, setEditStudentId] =
        useState<number | null>(null);

    const [editStudentQuery, setEditStudentQuery] = useState('');
    const [editPhotoUrl, setEditPhotoUrl] = useState('');

    // Queries and mutations

    const queryClient = useQueryClient();
    const confirmModal = useConfirmModal();

    const electionsQuery = useElections();
    const effectiveElectionId = isScopedRole
        ? user?.assignedElection?.id ?? null
        : selectedElectionId;
    const positionsQuery = usePositions(effectiveElectionId);
    const effectiveEditElectionId = isScopedRole ? user?.assignedElection?.id ?? null : editElectionId;
    const editPositionsQuery = usePositions(editingCandidate ? effectiveEditElectionId : null);
    const editStudentsQuery = useStudents(editingCandidate ? effectiveEditElectionId : null);
    const studentsQuery = useStudents(effectiveElectionId);
    const candidatesQuery = useCandidates(selectedPositionId, effectiveElectionId);

    const createMutation = useCreateCandidate();
    const updateMutation = useUpdateCandidate();
    const deleteMutation = useDeleteCandidate();

    // Query data

    const elections = useMemo(
        () => electionsQuery.data ?? [],
        [electionsQuery.data]
    );

    const positions = useMemo(
        () => positionsQuery.data ?? [],
        [positionsQuery.data]
    );

    const editPositions = useMemo(
        () => editPositionsQuery.data ?? [],
        [editPositionsQuery.data]
    );

    const students = useMemo(
        () => studentsQuery.data ?? [],
        [studentsQuery.data]
    );

    const editStudents = editStudentsQuery.data ?? [];

    const candidates = useMemo(
        () => candidatesQuery.data ?? [],
        [candidatesQuery.data]
    );

    const selectedElection =
        elections.find(
            election => election.id === effectiveElectionId
        ) ?? null;

    const selectedPosition =
        positions.find(
            position => position.id === selectedPositionId
        ) ?? null;

    const votingStarted = Boolean(
        selectedElection?.start_time &&
        new Date(selectedElection.start_time).getTime() <= currentTime
    );

    const noVotersAvailable = Boolean(
        effectiveElectionId &&
        !studentsQuery.isLoading &&
        !studentsQuery.isError &&
        students.length === 0
    );

    const candidateCreationBlocked = votingStarted || noVotersAvailable;

    useEffect(() => {
        const interval = window.setInterval(
            () => setCurrentTime(Date.now()),
            30_000
        );

        return () => window.clearInterval(interval);
    }, []);

    // Synchronize election selection with loaded API data

    useEffect(() => {
        if (selectedElectionId === null && elections.length) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelectedElectionId(
                (isScopedRole
                    ? elections.find(election => election.id === user?.assignedElection?.id)
                    : elections.find(election => election.is_active) ?? elections[0]
                )?.id ?? null
            );
        }
    }, [elections, isScopedRole, selectedElectionId, user?.assignedElection?.id]);

    // Synchronize position selection with loaded API data

    useEffect(() => {
        if (!positions.length) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelectedPositionId(null);

            queryClient.invalidateQueries({
                queryKey: queryKeys.candidates(null),
                refetchType: 'inactive',
            });

            return;
        }

        if (
            !selectedPositionId ||
            !positions.some(
                position => position.id === selectedPositionId
            )
        ) {
            setSelectedPositionId(positions[0].id);
        }
    }, [positions, selectedPositionId, queryClient]);

    // Filter candidates

    const filteredCandidates = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();

        return candidates.filter(candidate => {
            const student = students.find(
                item => item.id === candidate.student
            );

            return (
                !query ||
                (
                    candidate.student_name ||
                    student?.full_name ||
                    ''
                )
                    .toLowerCase()
                    .includes(query) ||
                (student?.student_id || '')
                    .toLowerCase()
                    .includes(query)
            );
        });
    }, [candidates, searchTerm, students]);

    // Check for candidate conflicts

    const conflictMessage = (
        id: number | null,
        exclude?: number
    ) => {
        const conflict = candidates.find(
            candidate =>
                candidate.student === id &&
                candidate.id !== exclude
        );

        return conflict
            ? `${
                students.find(student => student.id === id)?.full_name ||
                'This voter'
            } is already a candidate for ${
                positions.find(
                    position => position.id === conflict.position
                )?.name || 'another position'
            }.`
            : null;
    };

    const ballotConflictMessage = (
        number: number,
        positionId: number | null,
        exclude?: number
    ) =>
        candidates.some(
            candidate =>
                candidate.position === positionId &&
                candidate.ballot_number === number &&
                candidate.id !== exclude
        )
            ? `Ballot number ${number} is already assigned for this position.`
            : null;

    // Create candidate

    const resetCreate = () => {
        setStudentId(null);
        setStudentQuery('');
        setPhotoUrl('');
        setBallotNumber(0);
    };

    const handleCreate = (event: FormEvent) => {
        event.preventDefault();

        if (votingStarted) {
            showError('Candidate changes are locked because voting has begun for this election.');
            return;
        }

        const conflict = conflictMessage(studentId);

        const ballotConflict = ballotConflictMessage(
            ballotNumber,
            selectedPositionId
        );

        if (conflict) {
            showError(conflict);
            return;
        }

        if (ballotConflict) {
            showError(ballotConflict);
            return;
        }

        if (!studentId || !selectedPositionId) {
            showError('Select a voter and position.');
            return;
        }

        if (!students.some(student => student.id === studentId && getStudentElectionId(student) === effectiveElectionId) ||
            !positions.some(position => position.id === selectedPositionId && position.election === effectiveElectionId)) {
            showError('Select a voter and position from the selected election.');
            return;
        }

        createMutation.mutate(
            {
                student: studentId,
                position: selectedPositionId,
                election_id: effectiveElectionId ?? undefined,
                photo_url: photoUrl.trim() || undefined,
                ballot_number: ballotNumber,
            },
            {
                onSuccess: () => {
                    resetCreate();
                    setShowCreateForm(false);
                },
            }
        );
    };

    // Edit candidate

    const openEdit = (candidate: Candidate) => {
        const student = students.find(
            item => item.id === candidate.student
        );

        const candidatePosition = positions.find(
            position => position.id === candidate.position
        );

        setEditingCandidate(candidate);

        setEditElectionId(
            candidatePosition?.election ?? effectiveElectionId
        );

        setEditPositionId(candidate.position);
        setEditStudentId(candidate.student);

        setEditStudentQuery(
            student
                ? `${student.full_name} (${student.student_id})`
                : ''
        );

        setEditPhotoUrl(candidate.photo_url || '');
    };

    const handleUpdate = (event: FormEvent) => {
        event.preventDefault();

        if (votingStarted) {
            showError('Candidate changes are locked because voting has begun for this election.');
            return;
        }

        if (
            !editingCandidate ||
            !editStudentId ||
            !editPositionId ||
            !effectiveEditElectionId
        ) {
            return;
        }

        if (!editStudents.some(student => student.id === editStudentId && getStudentElectionId(student) === effectiveEditElectionId) ||
            !editPositions.some(position => position.id === editPositionId && position.election === effectiveEditElectionId)) {
            showError('Select a voter and position from the selected election.');
            return;
        }

        const conflict = conflictMessage(
            editStudentId,
            editingCandidate.id
        );

        const ballotConflict = ballotConflictMessage(
            editingCandidate.ballot_number,
            editPositionId,
            editingCandidate.id
        );

        if (conflict) {
            showError(conflict);
            return;
        }

        if (ballotConflict) {
            showError(ballotConflict);
            return;
        }

        updateMutation.mutate(
            {
                id: editingCandidate.id,
                student: editStudentId,
                position: editPositionId,
                election_id: effectiveEditElectionId,
                photo_url: editPhotoUrl.trim() || '',
                ballot_number: editingCandidate.ballot_number,
            },
            {
                onSuccess: () => {
                    setEditingCandidate(null);
                    setEditElectionId(null);
                    setEditPositionId(null);
                    setEditStudentId(null);
                    setEditStudentQuery('');
                    setEditPhotoUrl('');
                },
            }
        );
    };

    // Delete candidate

    const handleDelete = async (candidate: Candidate) => {
        if (votingStarted) {
            showError('Candidate changes are locked because voting has begun for this election.');
            return;
        }

        const confirmed = await confirmModal.confirm({
            title: 'Delete candidate',
            message: `Delete ${
                candidate.student_name || 'this candidate'
            }?`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            type: 'danger',
        });

        if (confirmed) {
            deleteMutation.mutate({...candidate, election_id: effectiveElectionId ?? undefined});
        }
    };

    // Request states

    const loading =
        electionsQuery.isLoading ||
        positionsQuery.isLoading ||
        studentsQuery.isLoading ||
        candidatesQuery.isLoading;

    const queryError =
        electionsQuery.error ||
        positionsQuery.error ||
        studentsQuery.error ||
        candidatesQuery.error;

    const mutationError =
        createMutation.error ||
        updateMutation.error ||
        deleteMutation.error;

    return (
        <PageContainer className="candidates-page">
            {/* Page header */}
            <Button
                leadingIcon={<FiPlus aria-hidden="true"/>}
                onClick={() => setShowCreateForm(true)}
                disabled={!selectedPositionId || candidateCreationBlocked}
                title={votingStarted ? 'Candidate changes are unavailable after voting starts.' : noVotersAvailable ? 'Add voters before adding candidates.' : undefined}
            >
                Add candidate
            </Button>

            {selectedPosition && (
                <div className="grid gap-3 sm:grid-cols-2 py-4">
                    <StatisticCard
                        label="Candidates"
                        value={candidates.length}
                        status="primary"
                        layout="split"
                        icon={<FiUsers aria-hidden="true"/>}
                    />

                    <StatisticCard
                        label="Voters loaded"
                        value={students.length}
                        status="success"
                        layout="split"
                        icon={<FiUsers aria-hidden="true"/>}
                    />
                </div>
            )}

            {/* Election and position selection */}
            <div className="grid gap-4 md:grid-cols-2 pb-4">
                <FormField
                    id="candidate-election"
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
                            onChange={event => setSelectedElectionId(event.target.value ? Number(event.target.value) : null)}
                        >
                            <option value="">
                                {elections.length ? 'Select an election' : 'No elections available'}
                            </option>
                            {elections.map(election => (
                                <option key={election.id} value={election.id}>
                                    {election.name} ({election.year})
                                </option>
                            ))}
                        </SelectField>
                    )}
                </FormField>

                <FormField
                    id="candidate-position"
                    label="Position"
                >
                    <SelectField
                        value={selectedPositionId ?? ''}
                        onChange={event =>
                            setSelectedPositionId(
                                event.target.value
                                    ? Number(event.target.value)
                                    : null
                            )
                        }
                        disabled={
                            !effectiveElectionId ||
                            !positions.length
                        }
                    >
                        <option value="">
                            {!effectiveElectionId
                                ? 'Select an election first'
                                : positions.length
                                    ? 'Select a position'
                                    : 'No positions for this election'}
                        </option>

                        {positions.map(position => (
                            <option
                                key={position.id}
                                value={position.id}
                            >
                                {position.name}
                            </option>
                        ))}
                    </SelectField>
                </FormField>
            </div>
            {/* Query and mutation errors */}

            {queryError && (
                <ErrorState
                    title="Unable to load candidates"
                    message={errorDetail(queryError)}
                />
            )}

            {mutationError && (
                <Alert
                    variant="error"
                    title="Candidate update failed"
                >
                    {errorDetail(mutationError)}
                </Alert>
            )}

            {votingStarted && selectedElection && (
                <Alert
                    variant="warning"
                    title="Candidate changes are locked"
                >
                    Voting has begun for {selectedElection.name}. Candidates, ballot numbers, and photos can no longer be changed.
                </Alert>
            )}

            {noVotersAvailable && selectedElection && (
                <Alert
                    variant="warning"
                    title="Add voters before adding candidates"
                >
                    {selectedElection.name} has no voter records yet. Add or import voters for this election before creating candidates.
                </Alert>
            )}

            {/* Create candidate modal */}

            <Modal
                open={showCreateForm}
                onClose={() => {
                    resetCreate();
                    setShowCreateForm(false);
                }}
                title="Add candidate"
                description={
                    selectedPosition
                        ? `Add a candidate for ${selectedPosition.name} in ${selectedElection?.name}.`
                        : 'Select a position before adding a candidate.'
                }
                className="candidate-create-modal"
            >
                <CandidateForm
                    mode="create"
                    locked={votingStarted}
                    electionId={effectiveElectionId}
                    elections={elections}
                    positionId={selectedPositionId}
                    positions={positions}
                    students={students}
                    studentId={studentId}
                    studentQuery={studentQuery}
                    photoUrl={photoUrl}
                    ballotNumber={ballotNumber}
                    pending={createMutation.isPending}
                    onStudentChange={student => {
                        setStudentId(student.id);

                        setStudentQuery(
                            `${student.full_name} (${student.student_id})`
                        );
                    }}
                    onQueryChange={query => {
                        setStudentId(null);
                        setStudentQuery(query);
                    }}
                    onPhotoChange={setPhotoUrl}
                    onBallotChange={setBallotNumber}
                    onSubmit={handleCreate}
                    scopedRole={isScopedRole}
                    onCancel={() => {
                        resetCreate();
                        setShowCreateForm(false);
                    }}
                />
            </Modal>

            {/* Candidate register */}

            {!selectedPositionId && (
                <EmptyState
                    title="Select a position"
                    message="Choose an election and position to view candidates."
                />
            )}

            {selectedPositionId && (
                <section className="ui-section">
                    <div className="ui-section-heading">
                        <div>
                            <h2>
                                Candidates for {selectedPosition?.name}
                            </h2>

                            <p>
                                {filteredCandidates.length} of{' '}
                                {candidates.length} candidates shown.
                            </p>
                        </div>

                        <FormField
                            id="candidate-search"
                            label="Search"
                        >
                            <TextInput
                                className="candidate-search-input"
                                value={searchTerm}
                                onChange={event =>
                                    setSearchTerm(event.target.value)
                                }
                                placeholder="Name or voter ID"
                            />
                        </FormField>
                    </div>

                    {/* Loading and empty states */}

                    {loading && (
                        <LoadingState
                            title="Loading candidates"
                            message="Fetching candidate records."
                        />
                    )}

                    {!loading && !filteredCandidates.length && (
                        <EmptyState
                            title={
                                searchTerm
                                    ? 'No matching candidates'
                                    : 'No candidates yet'
                            }
                            message={
                                searchTerm
                                    ? 'Try a different name or voter ID.'
                                    : 'Use Add candidate to register the first candidate for this position.'
                            }
                        />
                    )}

                    {/* Candidate table and mobile cards */}

                    {!loading && filteredCandidates.length > 0 && (
                        <>
                            <div className="hidden overflow-x-auto md:block">
                                <table className="ui-table">
                                    <caption className="sr-only">
                                        Candidates for {selectedPosition?.name}
                                    </caption>
                                    <thead>
                                    <tr>
                                        <th scope="col">Photo</th>
                                        <th scope="col">Candidate</th>
                                        <th scope="col">Voter ID</th>
                                        <th scope="col">Ballot number</th>
                                        <th scope="col" className="!text-right">Actions</th>
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {filteredCandidates.map(candidate => {
                                        const student = students.find(
                                            item =>
                                                item.id === candidate.student
                                        );

                                        return (
                                            <tr key={candidate.id}>
                                                <td>
                                                    {candidate.photo_url ? (
                                                        <img
                                                            src={candidate.photo_url}
                                                            alt={`${candidate.student_name || 'Candidate'} photo`}
                                                            className="h-10 w-10 rounded-md object-cover"
                                                        />
                                                    ) : (
                                                        <span className="text-xs text-gray-500">
                                                                No photo
                                                            </span>
                                                    )}
                                                </td>

                                                <td className="font-medium">
                                                    {candidate.student_name ||
                                                        student?.full_name ||
                                                        'Candidate'}
                                                </td>

                                                <td>
                                                    {student?.student_id ||
                                                        'Unavailable'}
                                                </td>

                                                <td>
                                                        {candidate.ballot_number}
                                                </td>

                                                <td>
                                                    <div className="flex gap-1 justify-end">
                                                        <IconButton
                                                            label={votingStarted ? 'Editing is unavailable after voting starts' : 'Edit candidate'}
                                                            icon={
                                                                <FiEdit2
                                                                    aria-hidden="true"
                                                                />
                                                            }
                                                            disabled={votingStarted}
                                                            onClick={() =>
                                                                openEdit(
                                                                    candidate
                                                                )
                                                            }
                                                        />

                                                        <IconButton
                                                            label={votingStarted ? 'Deleting is unavailable after voting starts' : 'Delete candidate'}
                                                            icon={
                                                                <FiTrash2
                                                                    aria-hidden="true"
                                                                />
                                                            }
                                                            variant="danger"
                                                            disabled={votingStarted}
                                                            onClick={() =>
                                                                void handleDelete(
                                                                    candidate
                                                                )
                                                            }
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="grid gap-3 md:hidden">
                                {filteredCandidates.map(candidate => (
                                    <CandidateCard
                                        key={candidate.id}
                                        candidate={candidate}
                                        studentId={
                                            students.find(
                                                student =>
                                                    student.id ===
                                                    candidate.student
                                            )?.student_id
                                        }
                                        onEdit={openEdit}
                                        onDelete={candidateToDelete =>
                                            void handleDelete(candidateToDelete)
                                        }
                                        locked={votingStarted}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </section>
            )}

            {/* Edit candidate modal */}

            {editingCandidate && (
                <Modal
                    open
                    onClose={() => setEditingCandidate(null)}
                    title="Edit candidate"
                    description="Update the election, position, voter or photo. The existing ballot number is preserved."
                >
                    <CandidateForm
                        mode="edit"
                        locked={votingStarted}
                        electionId={effectiveEditElectionId}
                        positionId={editPositionId}
                        positions={editPositions}
                        elections={elections}
                        scopedRole={isScopedRole}
                        editableContext
                        students={editStudents}
                        onElectionChange={id => {
                            setEditElectionId(id);
                            setEditPositionId(null);
                            setEditStudentId(null);
                            setEditStudentQuery('');
                        }}
                        onPositionChange={setEditPositionId}
                        studentId={editStudentId}
                        studentQuery={editStudentQuery}
                        photoUrl={editPhotoUrl}
                        ballotNumber={editingCandidate.ballot_number}
                        pending={updateMutation.isPending}
                        onStudentChange={student => {
                            setEditStudentId(student.id);

                            setEditStudentQuery(
                                `${student.full_name} (${student.student_id})`
                            );
                        }}
                        onQueryChange={query => {
                            setEditStudentId(null);
                            setEditStudentQuery(query);
                        }}
                        onPhotoChange={setEditPhotoUrl}
                        onBallotChange={() => undefined}
                        onSubmit={handleUpdate}
                        onCancel={() => setEditingCandidate(null)}
                    />
                </Modal>
            )}

            {/* Delete confirmation modal */}

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
        </PageContainer>
    );
}
