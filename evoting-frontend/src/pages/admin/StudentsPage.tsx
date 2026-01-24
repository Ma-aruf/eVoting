import {type FormEvent, useState, useEffect} from 'react';
import {useElections} from '../../queries/useElections';
import {useStudents, useCreateStudent, useUpdateStudent, useDeleteStudent, useBulkUploadStudents} from '../../queries/useStudents';
import {showError} from '../../utils/toast';

interface Student {
    id: number;
    student_id: string;
    full_name: string;
    class_name: string;
    has_voted: boolean;
    is_active: boolean;
    election?: {
        id: number;
        name: string;
        year: number;
    };
}

const CLASS_OPTIONS = ['Form 1', 'Form 2', 'Form 3'];

// const UsersIcon = () => (
//     <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
//               d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
//     </svg>
// );
//
// const CheckCircleIcon = () => (
//     <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
//               d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
//     </svg>
// );

const UploadIcon = () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
    </svg>
);

const PlusIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
    </svg>
);

const EditIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
    </svg>
);

const TrashIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
    </svg>
);

const UsersIcon = () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
    </svg>
);

const CheckCircleIcon = () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>
);

const VoteIcon = () => (
    <svg xmlns="http://www.w3.org" viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="#2ecc71"
         stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
);

export default function StudentsPage() {
    // State
    const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);

    // Queries
    const {data: elections = [], isLoading: electionsLoading} = useElections();
    const {data: students = [], isLoading: studentsLoading} = useStudents(selectedElectionId);

    // Mutations
    const createStudent = useCreateStudent();
    const updateStudent = useUpdateStudent();
    const deleteStudent = useDeleteStudent();
    const bulkUploadStudents = useBulkUploadStudents();

    const loading = electionsLoading || studentsLoading || createStudent.isPending || updateStudent.isPending || deleteStudent.isPending || bulkUploadStudents.isPending;

    // Toggle for add student form
    const [showAddForm, setShowAddForm] = useState(false);

    // Single student form state
    const [studentId, setStudentId] = useState('');
    const [fullName, setFullName] = useState('');
    const [className, setClassName] = useState('');

    // Edit modal state
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    const [editFullName, setEditFullName] = useState('');
    const [editClassName, setEditClassName] = useState('');

    const [file, setFile] = useState<File | null>(null);

    // Search state
    const [searchTerm, setSearchTerm] = useState('');

    // Set initial election
    useEffect(() => {
        if (elections.length > 0 && selectedElectionId === null) {
            const firstElectionId = elections[0].id;
            if (firstElectionId !== selectedElectionId) {
                setSelectedElectionId(firstElectionId);
            }
        }
    }, [elections, selectedElectionId]);

    const handleCreateStudent = async (e: FormEvent) => {
        e.preventDefault();

        if (!studentId.trim() || !fullName.trim() || !className) {
            showError('Please fill in all required fields.');
            return;
        }

        if (!selectedElectionId) {
            showError('Please select an election.');
            return;
        }

        createStudent.mutate({
            student_id: studentId.trim(),
            full_name: fullName.trim(),
            class_name: className,
            election: selectedElectionId,
        });

        setStudentId('');
        setFullName('');
        setClassName('');
        setShowAddForm(false);
    };

    const handleUpload = async (e: FormEvent) => {
        e.preventDefault();
        if (!file) return;
        if (!selectedElectionId) {
            showError('Please select an election before uploading.');
            return;
        }

        bulkUploadStudents.mutate({
            file,
            election_id: selectedElectionId,
        });

        setFile(null);
    };

    const openEditModal = (student: Student) => {
        setEditingStudent(student);
        setEditFullName(student.full_name);
        setEditClassName(student.class_name);
    };

    const handleEditStudent = async (e: FormEvent) => {
        e.preventDefault();
        if (!editingStudent) return;

        updateStudent.mutate({
            id: editingStudent.id,
            full_name: editFullName.trim(),
            class_name: editClassName,
        });

        setEditingStudent(null);
    };

    const handleDeleteStudent = async (student: Student) => {
        if (student.has_voted) {
            showError('Cannot delete a student who has already voted.');
            return;
        }
        if (!confirm(`Are you sure you want to delete ${student.full_name}?`)) return;

        deleteStudent.mutate(student);
    };

    const selectedElection = elections.find(e => e.id === selectedElectionId) || null;

    // Filter students by search term
    const filteredStudents = students.filter(s =>
        s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.student_id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 relative">
            {/* Loading Overlay */}
            {loading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center  rounded-xl">
                    <div className="bg-white/20 px-6 py-4 rounded-lg shadow-md flex items-center gap-3">
                        <div
                            className="w-6 h-6 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin"></div>
                        <span className="text-sm text-gray-700">Loading students…</span>
                    </div>
                </div>
            )}

            {/* Stat Cards */}
            <section>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div
                        className="bg-gradient-to-br h-35 from-blue-600 to-blue-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <UsersIcon/>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">All students</p>
                        </div>
                        <h3 className="font-semibold text-lg">Total Students</h3>
                        <p className="text-3xl font-bold mt-2">{students.length}</p>
                    </div>

                    <div
                        className="bg-gradient-to-br h-35 from-cyan-600 to-cyan-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <CheckCircleIcon/>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Currently active</p>
                        </div>
                        <h3 className="font-semibold text-lg">Active</h3>
                        <p className="text-3xl font-bold mt-2">{students.filter(s => s.is_active).length}</p>
                    </div>

                    <div
                        className="bg-gradient-to-br h-35 from-blue-900 to-blue-900 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <VoteIcon/>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Already voted</p>
                        </div>
                        <h3 className="font-semibold text-lg">Voted</h3>
                        <p className="text-3xl font-bold mt-2">{students.filter(s => s.has_voted).length}</p>
                    </div>
                </div>
            </section>



            {/* Page Header */}
            <div className="flex justify-between">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1">
                        {/*<label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="election-select">*/}
                        {/*    Select Election*/}
                        {/*</label>*/}
                        <select
                            id="election-select"
                            value={selectedElectionId ?? ''}
                            onChange={(e) => setSelectedElectionId(e.target.value ? Number(e.target.value) : null)}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full md:w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {elections.length === 0 && <option value="">No elections available</option>}
                            {elections.map(e => (
                                <option key={e.id} value={e.id}>{e.name} ({e.year})</option>
                            ))}
                        </select>
                    </div>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex w-full sm:w-auto justify-center items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                >
                    <PlusIcon />
                    Add Student
                </button>
            </div>

            {/* Election Selector */}



            {/* Add Student Form - Collapsible */}
            {showAddForm && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-base font-medium text-gray-900 mb-4">Add New Student</h2>
                    <form onSubmit={handleCreateStudent} className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1">
                            <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="student_id">
                                Student ID
                            </label>
                            <input
                                id="student_id"
                                type="text"
                                value={studentId}
                                onChange={(e) => setStudentId(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g. 23KOSA001"
                                required
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="full_name">
                                Full Name
                            </label>
                            <input
                                id="full_name"
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g. Ama Mensah"
                                required
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="class_name">
                                Class
                            </label>
                            <select
                                id="class_name"
                                value={className}
                                onChange={(e) => setClassName(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            >
                                <option value="">Select class...</option>
                                {CLASS_OPTIONS.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !selectedElectionId}
                            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition"
                        >
                            {loading ? 'Saving…' : 'Submit'}
                        </button>
                    </form>
                    {!selectedElection && elections.length > 0 && (
                        <p className="text-xs text-gray-500 mt-2">
                            Select an election above before adding a student.
                        </p>
                    )}
                </div>
            )}

            {/* Bulk Upload Section */}
            <section className=" flex justify-between bg-white rounded-xl border border-gray-200 py-2 px-5">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                        <UploadIcon />
                    </div>
                    <div>
                        <h2 className="text-base font-medium text-gray-900">Bulk Upload from Excel</h2>
                        <p className="text-xs text-gray-500">
                            Required columns: <code className="bg-gray-100 px-1 rounded">student_id</code>, <code className="bg-gray-100 px-1 rounded">full_name</code>, <code className="bg-gray-100 px-1 rounded">class_name</code>
                        </p>
                    </div>
                </div>
                <form onSubmit={handleUpload} className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
                    />
                    <button
                        type="submit"
                        disabled={!file || !selectedElectionId}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition"
                    >
                        {loading ? 'Uploading…' : 'Upload'}
                    </button>
                </form>
                {!selectedElection && elections.length > 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                        Select an election above before uploading students.
                    </p>
                )}
            </section>

            {/* Students Table */}
            <section className="bg-white rounded-xl border border-gray-200  overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                        <h2 className="text-base font-medium text-gray-900">
                            Students {selectedElection ? `for ${selectedElection.name} (${selectedElection.year})` : ''}
                        </h2>
                        {loading && <span className="text-xs text-gray-500">Loading…</span>}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                        <input
                            type="text"
                            placeholder="Search by name or ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full sm:w-64 border border-blue-200 border-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {searchTerm && (
                            <span className="text-xs text-gray-500">
                                {filteredStudents.length} of {students.length}
                            </span>
                        )}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="bg-blue-100 border-b border-gray-100">
                                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Student ID</th>
                                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
                                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
                                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Has Voted</th>
                                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y  divide-gray-100">
                            {filteredStudents.map((s) => (
                                <tr key={s.id} className="hover:bg-gray-50 transition odd:bg-white even:bg-blue-50 ">
                                    <td className="px-5 py-2 font-medium text-gray-900">{s.student_id}</td>
                                    <td className="px-5 py-2 text-gray-700">{s.full_name}</td>
                                    <td className="px-5 py-2 text-gray-700">{s.class_name}</td>
                                    <td className="px-5 py-2 ">
                                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {s.is_active ? 'Yes' : 'No'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-2">
                                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${s.has_voted ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {s.has_voted ? 'Yes' : 'No'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-2">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => openEditModal(s)}
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                title="Edit student"
                                            >
                                                <EditIcon />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteStudent(s)}
                                                disabled={s.has_voted}
                                                className={`p-1.5 rounded-lg transition ${s.has_voted ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:bg-red-50'}`}
                                                title={s.has_voted ? 'Cannot delete - student has voted' : 'Delete student'}
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loading && filteredStudents.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-5 py-8 text-center text-gray-400">
                                        {searchTerm
                                            ? 'No students match your search.'
                                            : (selectedElection
                                                ? 'No students added for this election yet.'
                                                : 'Select an election to view its students.')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Edit Modal */}
            {editingStudent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit Student</h2>
                        <form onSubmit={handleEditStudent} className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block">
                                    Student ID
                                </label>
                                <input
                                    type="text"
                                    value={editingStudent.student_id}
                                    disabled
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="edit_full_name">
                                    Full Name
                                </label>
                                <input
                                    id="edit_full_name"
                                    type="text"
                                    value={editFullName}
                                    onChange={(e) => setEditFullName(e.target.value)}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="edit_class_name">
                                    Class
                                </label>
                                <select
                                    id="edit_class_name"
                                    value={editClassName}
                                    onChange={(e) => setEditClassName(e.target.value)}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                >
                                    <option value="">Select class...</option>
                                    {CLASS_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingStudent(null)}
                                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition"
                                >
                                    {loading ? 'Saving…' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

