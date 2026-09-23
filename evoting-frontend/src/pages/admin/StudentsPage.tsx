import {type FormEvent, useMemo, useState} from 'react';
import {
    FiCheckCircle,
    FiChevronLeft,
    FiChevronRight, FiDownloadCloud,
    FiEdit2,
    FiFileText,
    FiPlus,
    FiSearch,
    FiTrash2,
    FiUploadCloud,
    FiUsers,
} from 'react-icons/fi';

import EditStudentModal from '../../components/EditStudentModal';
import StudentRow from '../../components/StudentRow';
import ConfirmModal from '../../components/ConfirmModal';
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

import {useElections} from '../../queries/useElections';
import {useAuth} from '../../hooks/useAuth';
import {
    type Student,
    getStudentElectionId,
    useBulkUploadStudents,
    useCreateStudent,
    useDeleteStudent,
    useStudents,
    useUpdateStudent,
} from '../../queries/useStudents';

import {showError} from '../../utils/toast';

const CLASS_OPTIONS = ['Form 1', 'Form 2', 'Form 3'];

type ActiveFilter = 'all' | 'active' | 'inactive';
type VotedFilter = 'all' | 'voted' | 'not-voted';

type ApiError = {
    response?: {
        data?: {
            detail?: string;
        };
    };
};

type UploadResult = {
    detail?: string;
    errors?: unknown;
};

const message = (error: unknown, fallback: string) =>
    (error as ApiError)?.response?.data?.detail || fallback;

function StudentForm({
                         studentId,
                         fullName,
                         className,
                         pending,
                         onStudentIdChange,
                         onFullNameChange,
                         onClassChange,
                         onSubmit,
                         onCancel,
                     }: {
    studentId: string;
    fullName: string;
    className: string;
    pending: boolean;
    onStudentIdChange: (value: string) => void;
    onFullNameChange: (value: string) => void;
    onClassChange: (value: string) => void;
    onSubmit: (event: FormEvent) => void;
    onCancel: () => void;
}) {
    return (
        <form onSubmit={onSubmit} className="student-form">
            <FormField id="student-id" label="Voter ID" required>
                <TextInput
                    value={studentId}
                    onChange={event => onStudentIdChange(event.target.value)}
                    required
                />
            </FormField>

            <FormField id="student-name" label="Full name" required>
                <TextInput
                    value={fullName}
                    onChange={event => onFullNameChange(event.target.value)}
                    required
                />
            </FormField>

            <FormField id="student-class" label="Class" required>
                <SelectField
                    value={className}
                    onChange={event => onClassChange(event.target.value)}
                    required
                >
                    <option value="">Select class...</option>

                    {CLASS_OPTIONS.map(option => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </SelectField>
            </FormField>

            <div className="ui-modal-actions">
                <Button
                    type="button"
                    variant="quiet"
                    onClick={onCancel}
                >
                    Cancel
                </Button>

                <Button type="submit" loading={pending}>
                    Save voter
                </Button>
            </div>
        </form>
    );
}

export default function StudentsPage() {
    const {user} = useAuth();
    const isScopedRole = user?.role === 'staff' || user?.role === 'activator';
    const [selectedElectionId, setSelectedElectionId] =
        useState<number | null>(null);

    const [showAdd, setShowAdd] = useState(false);
    const [showImport, setShowImport] = useState(false);

    const [studentId, setStudentId] = useState('');
    const [fullName, setFullName] = useState('');
    const [className, setClassName] = useState('');

    const [file, setFile] = useState<File | null>(null);

    const [editing, setEditing] = useState<Student | null>(null);
    const [deleting, setDeleting] = useState<Student | null>(null);

    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
    const [votedFilter, setVotedFilter] = useState<VotedFilter>('all');
    const [classFilter, setClassFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    // Queries and mutations

    const electionsQuery = useElections({refetchInterval: 45_000});
    const effectiveElectionId = isScopedRole
        ? user?.assignedElection?.id ?? null
        : selectedElectionId;
    const studentsQuery = useStudents(effectiveElectionId);

    const create = useCreateStudent();
    const update = useUpdateStudent();
    const remove = useDeleteStudent();
    const upload = useBulkUploadStudents();

    const elections = useMemo(
        () => electionsQuery.data ?? [],
        [electionsQuery.data]
    );

    const students = useMemo(
        () => studentsQuery.data ?? [],
        [studentsQuery.data]
    );

    const selected =
        elections.find(election => election.id === effectiveElectionId) ?? null;

    // Filter options and records

    const classes = useMemo(
        () =>
            Array.from(
                new Set(students.map(student => student.class_name))
            ).sort(),
        [students]
    );

    const filtered = useMemo(
        () =>
            students.filter(student => {
                const query = search.toLowerCase().trim();

                return (
                    (
                        !query ||
                        student.full_name.toLowerCase().includes(query) ||
                        student.student_id.toLowerCase().includes(query)
                    ) &&
                    (
                        activeFilter === 'all' ||
                        (activeFilter === 'active'
                            ? student.is_active
                            : !student.is_active)
                    ) &&
                    (
                        votedFilter === 'all' ||
                        (votedFilter === 'voted'
                            ? student.has_voted
                            : !student.has_voted)
                    ) &&
                    (
                        !classFilter ||
                        student.class_name === classFilter
                    )
                );
            }),
        [students, search, activeFilter, votedFilter, classFilter]
    );

    const hasFilters = Boolean(
        search ||
        activeFilter !== 'all' ||
        votedFilter !== 'all' ||
        classFilter
    );
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const visiblePage = Math.min(currentPage, totalPages);
    const paginatedStudents = filtered.slice(
        (visiblePage - 1) * pageSize,
        visiblePage * pageSize
    );

    const queryError = electionsQuery.error || studentsQuery.error;
    const loading = electionsQuery.isLoading || studentsQuery.isLoading;
    const uploadResult = upload.data as UploadResult | undefined;

    // Form handlers

    const resetStudentForm = () => {
        setStudentId('');
        setFullName('');
        setClassName('');
    };

    const handleCreate = (event: FormEvent) => {
        event.preventDefault();

        if (
            !effectiveElectionId ||
            !studentId.trim() ||
            !fullName.trim() ||
            !className
        ) {
            showError('Select an election and complete all required fields.');
            return;
        }

        create.mutate(
            {
                student_id: studentId.trim(),
                full_name: fullName.trim(),
                class_name: className,
                election_id: effectiveElectionId,
            },
            {
                onSuccess: () => {
                    resetStudentForm();
                    setShowAdd(false);
                },
            }
        );
    };

    const handleUpload = (event: FormEvent) => {
        event.preventDefault();

        if (file && effectiveElectionId) {
            upload.mutate(
                {
                    file,
                    election_id: effectiveElectionId,
                },
                {
                    onSuccess: () => setFile(null),
                }
            );
        }
    };

    const handleDelete = () => {
        if (deleting && !deleting.has_voted) {
            remove.mutate(deleting, {
                onSettled: () => setDeleting(null),
            });
        }
    };

    const clearFilters = () => {
        setSearch('');
        setActiveFilter('all');
        setVotedFilter('all');
        setClassFilter('');
        setCurrentPage(1);
    };

    return (
        <div className="students-page">
            {/* Student statistics */}

            {selected && (
                <section
                    className="students-statistics"
                    aria-label="Voter statistics"
                >
                    <StatisticCard
                        label="Total voters"
                        value={students.length}
                        icon={<FiUsers aria-hidden="true"/>}
                        status="primary"
                        layout="split"
                    />

                    <StatisticCard
                        label="Activated voters"
                        value={
                            students.filter(student => student.is_active).length
                        }
                        icon={<FiCheckCircle aria-hidden="true"/>}
                        status="success"
                        layout="split"
                    />

                    <StatisticCard
                        label="Already voted"
                        value={
                            students.filter(student => student.has_voted).length
                        }
                        icon={<FiFileText aria-hidden="true"/>}
                        status="strong"
                        layout="split"
                    />
                </section>
            )}

            <div className="voter-header">
                <div className="voter-header-election">
                    <FormField
                        id="students-election"
                        label="Election"
                    >
                        {isScopedRole ? (
                            <TextInput
                                value={selected ? `${selected.name} (${selected.year})` : 'Assigned election unavailable'}
                                readOnly
                                aria-readonly="true"
                            />
                        ) : (
                            <SelectField
                                value={effectiveElectionId ?? ''}
                                onChange={event => {
                                    setSelectedElectionId(
                                        event.target.value
                                            ? Number(event.target.value)
                                            : null
                                    );
                                    setCurrentPage(1);
                                }}
                            >
                                <option value="">
                                    {elections.length
                                        ? 'Select an election'
                                        : 'No elections available'}
                                </option>
                                {elections.map(election => (
                                    <option key={election.id} value={election.id}>
                                        {election.name} ({election.year})
                                    </option>
                                ))}
                            </SelectField>
                        )}
                    </FormField>
                </div>
                <div className="voter-header-buttons">
                    <Button
                        leadingIcon={<FiPlus aria-hidden="true"/>}
                        onClick={() => setShowAdd(true)}
                        disabled={!effectiveElectionId}
                    >
                        Add voter
                    </Button>

                    <Button
                        variant="secondary"
                        className="voter-import-button"
                        leadingIcon={<FiUploadCloud aria-hidden="true"/>}
                        onClick={() => setShowImport(true)}
                        disabled={!effectiveElectionId}
                    >
                        Import voters
                    </Button>
                </div>
            </div>


            {/* Query error */}

            {queryError && (
                <ErrorState
                    title="Unable to load voters"
                    message={message(queryError, 'Please try again.')}
                />
            )}

            {/* Voter records */}

            <section
                className="students-records ui-section"
                aria-labelledby="students-records-heading"
            >
                <div className="students-records-heading">
                    <div>
                        <h2 id="students-records-heading" className="text-2xl font-bold">
                            {selected
                                ? `Voters for ${selected.name}`
                                : 'Voter records'}
                        </h2>
                    </div>
                </div>

                {/* Filters */}

                <div
                    className="students-filter-toolbar"
                    aria-label="Voter filters"
                >
                    <FormField
                        className="students-filter-primary"
                        id="student-search"
                        label="Search by name or voter ID"
                    >
                        <div className="students-search-control">
                            <FiSearch aria-hidden="true"/>

                            <TextInput
                                value={search}
                                onChange={event =>
                                    (() => {
                                        setSearch(event.target.value);
                                        setCurrentPage(1);
                                    })()
                                }
                                placeholder="Name or voter ID"
                            />
                        </div>
                    </FormField>

                    <FormField
                        id="active-filter"
                        label="Activation status"
                    >
                        <SelectField
                            value={activeFilter}
                            onChange={event =>
                                (() => {
                                    setActiveFilter(
                                        event.target.value as ActiveFilter
                                    );
                                    setCurrentPage(1);
                                })()
                            }
                        >
                            <option value="all">All statuses</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </SelectField>
                    </FormField>

                    <FormField
                        id="voted-filter"
                        label="Voting status"
                    >
                        <SelectField
                            value={votedFilter}
                            onChange={event =>
                                (() => {
                                    setVotedFilter(
                                        event.target.value as VotedFilter
                                    );
                                    setCurrentPage(1);
                                })()
                            }
                        >
                            <option value="all">All statuses</option>
                            <option value="voted">Voted</option>
                            <option value="not-voted">Not voted</option>
                        </SelectField>
                    </FormField>

                    <FormField
                        id="class-filter"
                        label="Class"
                    >
                        <SelectField
                            value={classFilter}
                            onChange={event => {
                                setClassFilter(event.target.value);
                                setCurrentPage(1);
                            }}
                        >
                            <option value="">All classes</option>

                            {classes.map(option => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </SelectField>
                    </FormField>

                    {hasFilters && (
                        <Button
                            type="button"
                            variant="quiet"
                            size="compact"
                            onClick={clearFilters}
                        >
                            Clear filters
                        </Button>
                    )}
                </div>

                {/* Loading and empty states */}

                {loading && (
                    <LoadingState
                        title="Loading voters"
                        message="Fetching records."
                    />
                )}

                {!loading && !queryError && !effectiveElectionId && (
                    <EmptyState
                        title="Select an election"
                        message="Choose an election to view its voters."
                    />
                )}

                {!loading &&
                    !queryError &&
                    effectiveElectionId &&
                    !students.length && (
                        <EmptyState
                            title="No voters yet"
                            message="Add a voter or import an Excel workbook."
                        />
                    )}

                {!loading &&
                    !queryError &&
                    effectiveElectionId &&
                    students.length > 0 &&
                    !filtered.length && (
                        <EmptyState
                            title="No matching voters"
                            message="Try clearing a filter or changing your search."
                        />
                    )}

                {/* Desktop table and mobile cards */}

                {!loading && !queryError && filtered.length > 0 && (
                    <>
                        <div className="students-table-wrap">
                            <table className="ui-table students-table">
                                <caption className="sr-only">
                                    Voters for the selected election
                                </caption>

                                <thead>
                                <tr>
                                    <th scope="col">Voter ID</th>
                                    <th scope="col">Full name</th>
                                    <th scope="col">Class</th>
                                    <th scope="col">Activation</th>
                                    <th scope="col">Voting status</th>
                                    <th scope="col" className="!text-right">Actions</th>
                                </tr>
                                </thead>

                                <tbody>
                                {paginatedStudents.map(student => (
                                    <StudentRow
                                        key={student.id}
                                        student={student}
                                        onEdit={setEditing}
                                        onDelete={setDeleting}
                                    />
                                ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="students-mobile-list">
                            {paginatedStudents.map(student => (
                                <article
                                    key={student.id}
                                    className="student-mobile-card"
                                >
                                    <div className="student-mobile-card-heading">
                                        <div className="w-full flex justify-between items-center">
                                            <h3>{student.full_name}</h3>
                                            <p>
                                                {student.student_id} ·{' '}
                                                {student.class_name}
                                            </p>
                                        </div>
                                    </div>

                                    <dl className="student-mobile-details">
                                        <div>
                                            <dt>Activation</dt>
                                            <dd>
                                                {student.is_active
                                                    ? 'Active'
                                                    : 'Inactive'}
                                            </dd>
                                        </div>

                                        <div>
                                            <dt>Voting status</dt>
                                            <dd>
                                                {student.has_voted
                                                    ? 'Voted'
                                                    : 'Not voted'}
                                            </dd>
                                        </div>
                                        <div className="student-mobile-actions">
                                            <IconButton
                                                label={`Edit ${student.full_name}`}
                                                icon={
                                                    <FiEdit2 aria-hidden="true"/>
                                                }
                                                onClick={() =>
                                                    setEditing(student)
                                                }
                                            />

                                            <IconButton
                                                label={
                                                    student.has_voted
                                                        ? 'Cannot delete a student who has voted'
                                                        : `Delete ${student.full_name}`
                                                }
                                                icon={
                                                    <FiTrash2 aria-hidden="true"/>
                                                }
                                                variant="danger"
                                                disabled={student.has_voted}
                                                onClick={() =>
                                                    setDeleting(student)
                                                }
                                            />
                                        </div>
                                    </dl>
                                </article>
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <nav
                                className="students-pagination"
                                aria-label="Voter records pagination"
                            >
                                <span>
                                    Page {visiblePage} of {totalPages}
                                </span>
                                <div>
                                    <Button
                                        type="button"
                                        variant="quiet"
                                        size="compact"
                                        leadingIcon={
                                            <FiChevronLeft aria-hidden="true"/>
                                        }
                                        disabled={visiblePage === 1}
                                        onClick={() =>
                                            setCurrentPage(page =>
                                                Math.max(page - 1, 1)
                                            )
                                        }
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="quiet"
                                        size="compact"
                                        trailingIcon={
                                            <FiChevronRight aria-hidden="true"/>
                                        }
                                        disabled={visiblePage === totalPages}
                                        onClick={() =>
                                            setCurrentPage(page =>
                                                Math.min(page + 1, totalPages)
                                            )
                                        }
                                    >
                                        Next
                                    </Button>
                                </div>
                            </nav>
                        )}
                    </>
                )}
            </section>

            {/* Add voter modal */}

            <Modal
                open={showAdd}
                onClose={() => setShowAdd(false)}
                title="Add voter"
                description={
                    selected
                        ? `Add an eligible voter to ${selected.name}.`
                        : 'Select an election before adding a voter.'
                }
            >
                <StudentForm
                    studentId={studentId}
                    fullName={fullName}
                    className={className}
                    pending={create.isPending}
                    onStudentIdChange={setStudentId}
                    onFullNameChange={setFullName}
                    onClassChange={setClassName}
                    onSubmit={handleCreate}
                    onCancel={() => setShowAdd(false)}
                />
            </Modal>

            {/* Import voters modal */}

            <Modal
                open={showImport}
                onClose={() => setShowImport(false)}
                title="Import voters"
                description={
                    selected
                        ? `Import eligible voters into ${selected.name}.`
                        : 'Select an election before importing voters.'
                }
            >
                <form
                    onSubmit={handleUpload}
                    className="student-import-form"
                >
                    <Alert variant="info" title="Excel format">
                        <div className="space-y-2">
                            <p>Use an Excel sheet with exactly these columns:</p>
                            <div className="space-y-1">
                                <code className="ps-6 text-red-400">student_id</code>
                                <br/>
                                <code className="ps-6 text-red-400">full_name</code>
                                <br/>
                                <code className="ps-6 text-red-400">class_name</code>
                            </div>
                            <a
                                href="/student-import-sample.csv"
                                download="student-import-sample.csv"
                                className="inline-flex items-center gap-2 mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
                            >
                                <FiDownloadCloud className="text-emerald-700" aria-hidden="true"/>
                                <p className="text-emerald-700">Download sample file</p>
                            </a>
                        </div>
                    </Alert>

                    <FormField
                        id="student-file"
                        label="Excel file"
                    >
                        <div className="file-picker-wrapper">
                            <label htmlFor="student-file-input" className="file-picker-label">
                                <span className="file-picker-emoji">📁</span>
                                <span className="file-picker-text">
                                    {file ? file.name : 'Click to pick a file'}
                                </span>
                                <span className="file-picker-hint">.xlsx, .xls, .csv</span>
                            </label>
                            <input
                                id="student-file-input"
                                type="file"
                                accept=".xlsx,.xls"
                                className="file-picker-input"
                                onChange={event =>
                                    setFile(event.target.files?.[0] ?? null)
                                }
                            />
                        </div>
                    </FormField>

                    {upload.error && (
                        <Alert
                            variant="error"
                            title="Import failed"
                        >
                            {message(
                                upload.error,
                                'Voter import failed. Check the file and try again.'
                            )}
                        </Alert>
                    )}

                    {uploadResult?.detail && !upload.error && (
                        <Alert
                            variant="success"
                            title="Import complete"
                        >
                            {uploadResult.detail}
                        </Alert>
                    )}

                    {uploadResult?.errors && (
                        <Alert
                            variant="warning"
                            title="Some rows need attention"
                        >
                            <pre className="students-upload-errors">
                                {JSON.stringify(
                                    uploadResult.errors,
                                    null,
                                    2
                                )}
                            </pre>
                        </Alert>
                    )}

                    <div className="ui-modal-actions">
                        <Button
                            type="button"
                            variant="quiet"
                            onClick={() => setShowImport(false)}
                        >
                            Cancel
                        </Button>

                        <Button
                            type="submit"
                            loading={upload.isPending}
                            disabled={!file || !effectiveElectionId}
                            className="voter-import-button"
                            leadingIcon={
                                <FiUploadCloud aria-hidden="true"/>
                            }
                        >
                            Import voters
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Edit voter modal */}

            <EditStudentModal
                student={editing}
                onClose={() => setEditing(null)}
                onSave={(student, name, classValue) =>
                    update.mutate(
                        {
                            id: student.id,
                            full_name: name,
                            class_name: classValue,
                            election_id: getStudentElectionId(student) ?? effectiveElectionId!,
                        },
                        {
                            onSuccess: () => setEditing(null),
                        }
                    )
                }
                loading={update.isPending}
            />

            {/* Delete confirmation modal */}

            <ConfirmModal
                isOpen={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Delete voter?"
                message={
                    deleting
                        ? `Delete ${deleting.full_name}? This cannot be undone.`
                        : ''
                }
                confirmText="Delete voter"
            />
        </div>
    );
}
