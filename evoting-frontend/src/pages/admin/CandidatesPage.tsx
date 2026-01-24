import {type FormEvent, useEffect, useState} from 'react';
import {useElections} from '../../queries/useElections';
import {usePositions} from '../../queries/usePositions';
import {useAllStudents} from '../../queries/useAllStudents';
import {useCandidates, useCreateCandidate, useUpdateCandidate, useDeleteCandidate} from '../../queries/useCandidates';
import type {Candidate} from '../../queries/useCandidates';
import {showError} from '../../utils/toast';


const UsersIcon = () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
    </svg>
);

const ListIcon = () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
    </svg>
);

const PlusIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
    </svg>
);

export default function CandidatesPage() {
    const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
    const [selectedPositionId, setSelectedPositionId] = useState<number | null>(null);
    
    // Queries
    const {data: elections = [], isLoading: electionsLoading} = useElections();
    const {data: positions = [], isLoading: positionsLoading} = usePositions(selectedElectionId);
    const {data: students = [], isLoading: studentsLoading} = useAllStudents();
    const {data: candidates = [], isLoading: candidatesLoading} = useCandidates(selectedPositionId);
    
    // Mutations
    const createCandidateMutation = useCreateCandidate();
    const updateCandidateMutation = useUpdateCandidate();
    const deleteCandidateMutation = useDeleteCandidate();
    
    // Loading state
    const loading = electionsLoading || positionsLoading || studentsLoading || candidatesLoading || 
                   createCandidateMutation.isPending || updateCandidateMutation.isPending || deleteCandidateMutation.isPending;

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
    const [studentQuery, setStudentQuery] = useState('');
    const [studentDropdownOpen, setStudentDropdownOpen] = useState(false);
    const [photoUrl, setPhotoUrl] = useState<string>('');

    const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
    const [editPhotoUrl, setEditPhotoUrl] = useState<string>('');
    const [editElectionId, setEditElectionId] = useState<number | null>(null);
    const [editPositionId, setEditPositionId] = useState<number | null>(null);
    const [editStudentId, setEditStudentId] = useState<number | null>(null);
    const [editStudentQuery, setEditStudentQuery] = useState('');
    const [editStudentDropdownOpen, setEditStudentDropdownOpen] = useState(false);


    const handleEditCandidate = (candidate: any) => {
        setEditingCandidate(candidate);
        setEditPhotoUrl(candidate.photo_url || '');
        
        // Find the position and its election
        const position = positions.find(p => p.id === candidate.position);
        if (position) {
            setEditElectionId(position.election);
            setEditPositionId(candidate.position);
        }
        setEditStudentId(candidate.student);
        const student = students.find(s => s.id === candidate.student);
        if (student) {
            setEditStudentQuery(`${student.full_name} (${student.student_id})`);
        }
    };

    const handleUpdateCandidate = async (e: FormEvent) => {
        e.preventDefault();
        if (!editingCandidate) return;

        if (!editElectionId || !editPositionId || !editStudentId) {
            showError('Please select election, position, and student.');
            return;
        }

        updateCandidateMutation.mutate({
            id: editingCandidate.id,
            student: editStudentId,
            position: editPositionId,
            photo_url: editPhotoUrl.trim() || '',
        }, {
            onSuccess: () => {
                setEditingCandidate(null);
                setEditPhotoUrl('');
                setEditElectionId(null);
                setEditPositionId(null);
                setEditStudentId(null);
                setEditStudentQuery('');
            },
        });
    };


    const handleDeleteCandidate = async (candidate: any) => {
        if (!confirm(`Delete candidate "${candidate.student_name}"?`)) return;

        deleteCandidateMutation.mutate(candidate);
    };


    // Auto-select first election and position when data loads
    useEffect(() => {
        if (elections.length > 0 && !selectedElectionId) {
            setSelectedElectionId(elections[0].id);
        }
    }, [elections, selectedElectionId]);
    
    useEffect(() => {
        if (positions.length > 0 && !selectedPositionId) {
            setSelectedPositionId(positions[0].id);
        }
    }, [positions, selectedPositionId]);

    const handleCreateCandidate = async (e: FormEvent) => {
        e.preventDefault();
                
        if (!selectedElectionId) {
            showError('Please select an election.');
            return;
        }
        if (!selectedPositionId) {
            showError('Please select a position.');
            return;
        }
        if (!selectedStudentId) {
            showError('Please select a student.');
            return;
        }

        createCandidateMutation.mutate({
            student: selectedStudentId,
            position: selectedPositionId,
            photo_url: photoUrl.trim() || undefined,
        }, {
            onSuccess: () => {
                setSelectedStudentId(null);
                setStudentQuery('');
                setPhotoUrl('');
            },
        });
    };

    const selectedElection = elections.find(e => e.id === selectedElectionId) || null;
    const selectedPosition = positions.find(p => p.id === selectedPositionId) || null;

    const filteredStudentOptions = students.filter((student) => {
        const q = studentQuery.toLowerCase().trim();
        if (!q) return true;
        return (
            student.full_name.toLowerCase().includes(q) ||
            student.student_id.toLowerCase().includes(q)
        );
    });

    const filteredEditStudentOptions = students.filter((student) => {
        const q = editStudentQuery.toLowerCase().trim();
        if (!q) return true;
        return (
            student.full_name.toLowerCase().includes(q) ||
            student.student_id.toLowerCase().includes(q)
        );
    });

    const filteredCandidates = candidates.filter((candidate) => {
        const student = students.find((s) => s.id === candidate.student);
        const name = (candidate.student_name || student?.full_name || '').toLowerCase();
        const id = (student?.student_id || '').toLowerCase();
        const q = searchTerm.toLowerCase().trim();
        if (!q) return true;
        return name.includes(q) || id.includes(q);
    });

    return (

        <div className="space-y-6">
              {/* Loading Overlay */}
            {loading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl">
                    <div className="bg-white/20 px-6 py-4 rounded-lg shadow-md flex items-center gap-3">
                        <div
                            className="w-6 h-6 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin"></div>
                        <span className="text-sm text-gray-700">Loading positions…</span>
                    </div>
                </div>
            )}

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h1 className="text-xl font-semibold text-gray-900">Candidates</h1>
                <button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className="flex w-full sm:w-auto justify-center items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                >
                    <PlusIcon />
                    Add Candidate
                </button>
            </div>


            {/* Stat Cards */}
            <section>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br h-35 from-blue-600 to-blue-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <UsersIcon />
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Registered candidates</p>
                        </div>
                        <h3 className="font-semibold text-lg">Candidates</h3>
                        <p className="text-3xl font-bold mt-2">{candidates.length}</p>
                    </div>

                    <div className="bg-gradient-to-br h-35 from-cyan-600 to-cyan-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <ListIcon />
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Positions loaded</p>
                        </div>
                        <h3 className="font-semibold text-lg">Positions</h3>
                        <p className="text-3xl font-bold mt-2">{positions.length}</p>
                    </div>

                    <div className="bg-gradient-to-br h-35 from-blue-900 to-blue-900 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <UsersIcon />
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Students loaded</p>
                        </div>
                        <h3 className="font-semibold text-lg">Students</h3>
                        <p className="text-3xl font-bold mt-2">{students.length}</p>
                    </div>
                </div>
            </section>

            {/* Filters */}
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-base font-medium text-gray-900">Select Election & Position</h2>
                        <p className="text-xs text-gray-500 mt-1">Candidates are tied to a position within an election.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full md:w-auto">
                        <select
                            id="election_select"
                            value={selectedElectionId ?? ''}
                            onChange={(e) =>
                                setSelectedElectionId(e.target.value ? Number(e.target.value) : null)
                            }
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full md:w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {elections.length === 0 && <option value="">No elections available</option>}
                            {elections.length > 0 && <option value="">Select election…</option>}
                            {elections.map((election) => (
                                <option key={election.id} value={election.id}>
                                    {election.name} ({election.year})
                                </option>
                            ))}
                        </select>

                        <select
                            id="position_select"
                            value={selectedPositionId ?? ''}
                            onChange={(e) =>
                                setSelectedPositionId(e.target.value ? Number(e.target.value) : null)
                            }
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full md:w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={!selectedElectionId || positions.length === 0}
                        >
                            {!selectedElectionId && <option value="">Select an election first</option>}
                            {selectedElectionId && positions.length === 0 && (
                                <option value="">No positions for this election</option>
                            )}
                            {positions.length > 0 && <option value="">Select position…</option>}
                            {positions.map((position) => (
                                <option key={position.id} value={position.id}>
                                    {position.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </section>

            {/* Filters and create form */}
            {showCreateForm && (
                <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <h2 className="text-base font-medium text-gray-900 mb-4">Add Candidate</h2>
                    <form
                        onSubmit={handleCreateCandidate}
                        className="flex flex-col md:flex-row gap-4 items-end"
                    >
                        <div className="flex-1">
                            <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="student_search">
                                Student
                            </label>
                            <div className="relative">
                                <input
                                    id="student_search"
                                    type="text"
                                    value={studentQuery}
                                    onChange={(e) => {
                                        setStudentQuery(e.target.value);
                                        setStudentDropdownOpen(true);
                                        setSelectedStudentId(null);
                                    }}
                                    onFocus={() => setStudentDropdownOpen(true)}
                                    onBlur={() => {
                                        window.setTimeout(() => setStudentDropdownOpen(false), 150);
                                    }}
                                    placeholder="Type student name or ID..."
                                    disabled={students.length === 0}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                                />

                                {studentDropdownOpen && students.length > 0 && (
                                    <div className="absolute z-10 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-64 overflow-auto">
                                        {filteredStudentOptions.length === 0 ? (
                                            <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
                                        ) : (
                                            filteredStudentOptions.slice(0, 25).map((student) => (
                                                <button
                                                    key={student.id}
                                                    type="button"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        setSelectedStudentId(student.id);
                                                        setStudentQuery(`${student.full_name} (${student.student_id})`);
                                                        setStudentDropdownOpen(false);
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition"
                                                >
                                                    <span className="font-medium text-gray-900">{student.full_name}</span>{' '}
                                                    <span className="text-gray-500">({student.student_id})</span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                            {!selectedStudentId && studentQuery.trim() && (
                                <p className="text-xs text-gray-500 mt-1">Select a student from the list.</p>
                            )}
                        </div>

                        <div className="flex-1">
                            <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="photo_url">
                                Photo URL (optional)
                            </label>
                            <input
                                id="photo_url"
                                type="url"
                                value={photoUrl}
                                onChange={(e) => setPhotoUrl(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="https://..."
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !selectedElectionId || !selectedPositionId}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition"
                        >
                            {loading ? 'Saving…' : 'Submit'}
                        </button>
                    </form>
                </section>
            )}

            {editingCandidate && (
                <section className="bg-white rounded-xl border border-blue-200 shadow-sm p-5">
                    <h2 className="text-base font-medium text-gray-900 mb-4">
                        Edit Candidate: {editingCandidate.student_name}
                    </h2>
                    <form onSubmit={handleUpdateCandidate} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="edit_election">
                                    Election
                                </label>
                                <select
                                    id="edit_election"
                                    value={editElectionId ?? ''}
                                    onChange={(e) => {
                                        const value = e.target.value ? Number(e.target.value) : null;
                                        setEditElectionId(value);
                                        setEditPositionId(null);
                                    }}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Select election…</option>
                                    {elections.map((election) => (
                                        <option key={election.id} value={election.id}>
                                            {election.name} ({election.year})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="edit_position">
                                    Position
                                </label>
                                <select
                                    id="edit_position"
                                    value={editPositionId ?? ''}
                                    onChange={(e) => setEditPositionId(e.target.value ? Number(e.target.value) : null)}
                                    disabled={!editElectionId}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                                >
                                    {!editElectionId && <option value="">Select election first</option>}
                                    {editElectionId && positions.length === 0 && (
                                        <option value="">No positions for this election</option>
                                    )}
                                    {positions.length > 0 && <option value="">Select position…</option>}
                                    {positions.map((position) => (
                                        <option key={position.id} value={position.id}>
                                            {position.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="edit_photo_url">
                                    Photo URL
                                </label>
                                <input
                                    id="edit_photo_url"
                                    type="url"
                                    value={editPhotoUrl}
                                    onChange={(e) => setEditPhotoUrl(e.target.value)}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="https://..."
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="edit_student_search">
                                Student
                            </label>
                            <div className="relative">
                                <input
                                    id="edit_student_search"
                                    type="text"
                                    value={editStudentQuery}
                                    onChange={(e) => {
                                        setEditStudentQuery(e.target.value);
                                        setEditStudentDropdownOpen(true);
                                        setEditStudentId(null);
                                    }}
                                    onFocus={() => setEditStudentDropdownOpen(true)}
                                    onBlur={() => {
                                        window.setTimeout(() => setEditStudentDropdownOpen(false), 150);
                                    }}
                                    placeholder="Type student name or ID..."
                                    disabled={students.length === 0}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                                />

                                {editStudentDropdownOpen && students.length > 0 && (
                                    <div className="absolute z-10 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-64 overflow-auto">
                                        {filteredEditStudentOptions.length === 0 ? (
                                            <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
                                        ) : (
                                            filteredEditStudentOptions.slice(0, 25).map((student) => (
                                                <button
                                                    key={student.id}
                                                    type="button"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        setEditStudentId(student.id);
                                                        setEditStudentQuery(`${student.full_name} (${student.student_id})`);
                                                        setEditStudentDropdownOpen(false);
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition"
                                                >
                                                    <span className="font-medium text-gray-900">{student.full_name}</span>{' '}
                                                    <span className="text-gray-500">({student.student_id})</span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                            {!editStudentId && editStudentQuery.trim() && (
                                <p className="text-xs text-gray-500 mt-1">Select a student from the list.</p>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="submit"
                                disabled={loading || !editElectionId || !editPositionId || !editStudentId}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition"
                            >
                                {loading ? 'Saving…' : 'Update Candidate'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingCandidate(null);
                                    setEditPhotoUrl('');
                                    setEditElectionId(null);
                                    setEditPositionId(null);
                                    setEditStudentId(null);
                                    setEditStudentQuery('');
                                }}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </section>
            )}

            {/* Candidates table */}
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                        <h2 className="text-base font-medium text-gray-900">
                            Candidates
                            {selectedElection && selectedPosition
                                ? ` for ${selectedPosition.name} – ${selectedElection.name} (${selectedElection.year})`
                                : ''}
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
                                {filteredCandidates.length} of {candidates.length}
                            </span>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="bg-blue-100 border-b border-gray-100">
                                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Student ID</th>
                                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Photo</th>
                                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredCandidates.map((candidate) => {
                                const student = students.find((s) => s.id === candidate.student);
                                return (
                                    <tr key={candidate.id} className="hover:bg-gray-50 transition odd:bg-white even:bg-blue-50">
                                        <td className="px-5 py-2 font-medium text-gray-900">
                                            {candidate.student_name || student?.full_name || '—'}
                                        </td>
                                        <td className="px-5 py-2 text-gray-700">
                                            {student?.student_id || '—'}
                                        </td>
                                        <td className="px-5 py-2">
                                            {candidate.photo_url ? (
                                                <a
                                                    href={candidate.photo_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    View
                                                </a>
                                            ) : (
                                                <span className="text-gray-400 text-xs">No photo</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-2 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => handleEditCandidate(candidate)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteCandidate(candidate)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-600 transition"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {!loading && filteredCandidates.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                                        {searchTerm
                                            ? 'No candidates match your search.'
                                            : (selectedPosition
                                                ? 'No candidates registered for this position yet.'
                                                : 'Select an election and position to view candidates.')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

