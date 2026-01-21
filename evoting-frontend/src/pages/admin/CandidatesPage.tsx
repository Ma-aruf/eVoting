import {type FormEvent, useEffect, useState} from 'react';
import api from '../../apiConfig';

interface Election {
    id: number;
    name: string;
    year: number;
}

interface Position {
    id: number;
    name: string;
    display_order: number;
    election: number;
}

interface Student {
    id: number;
    student_id: string;
    full_name: string;
}

interface Candidate {
    id: number;
    student: number;
    student_name: string;
    position: number;
    photo_url: string;
}

interface ListResponse<T> {
    count?: number;
    results?: T[];
}

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
    const [elections, setElections] = useState<Election[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);

    const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
    const [selectedPositionId, setSelectedPositionId] = useState<number | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
    const [studentQuery, setStudentQuery] = useState('');
    const [studentDropdownOpen, setStudentDropdownOpen] = useState(false);
    const [photoUrl, setPhotoUrl] = useState<string>('');

    const extractItems = <T,>(data: T[] | ListResponse<T>): T[] => {
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.results)) return data.results;
        return [];
    };

    const fetchElections = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<Election[] | ListResponse<Election>>('api/elections/');
            const items = extractItems(res.data);
            setElections(items);
            if (!selectedElectionId && items.length > 0) {
                setSelectedElectionId(items[0].id);
            }
        } catch (err) {
            console.error(err);
            setError('Failed to load elections.');
        } finally {
            setLoading(false);
        }
    };

    const fetchStudents = async () => {
        try {
            const res = await api.get<Student[] | ListResponse<Student>>('api/students/');
            setStudents(extractItems(res.data));
        } catch (err) {
            console.error(err);
            // Do not block page if students fail; just show empty dropdown
        }
    };

    const fetchPositions = async (electionId: number | null) => {
        if (!electionId) {
            setPositions([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<Position[] | ListResponse<Position>>('api/positions/', {
                params: {election_id: electionId},
            });
            const items = extractItems(res.data);
            setPositions(items);
            if (!selectedPositionId && items.length > 0) {
                setSelectedPositionId(items[0].id);
            }
        } catch (err) {
            console.error(err);
            setError('Failed to load positions.');
        } finally {
            setLoading(false);
        }
    };

    const fetchCandidates = async (positionId: number | null) => {
        if (!positionId) {
            setCandidates([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<Candidate[] | ListResponse<Candidate>>('api/candidates/', {
                params: {position_id: positionId},
            });
            setCandidates(extractItems(res.data));
        } catch (err) {
            console.error(err);
            setError('Failed to load candidates.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchElections();
        fetchStudents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selectedElectionId !== null) {
            fetchPositions(selectedElectionId);
        } else {
            setPositions([]);
        }
        setSelectedPositionId(null);
        setCandidates([]);
    }, [selectedElectionId]);

    useEffect(() => {
        if (selectedPositionId !== null) {
            fetchCandidates(selectedPositionId);
        } else {
            setCandidates([]);
        }
    }, [selectedPositionId]);

    const handleCreateCandidate = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!selectedElectionId) {
            setError('Please select an election.');
            return;
        }
        if (!selectedPositionId) {
            setError('Please select a position.');
            return;
        }
        if (!selectedStudentId) {
            setError('Please select a student.');
            return;
        }

        try {
            setLoading(true);
            await api.post('api/candidates/create/', {
                student: selectedStudentId,
                position: selectedPositionId,
                photo_url: photoUrl.trim() || undefined,
            });

            setSuccessMessage('Candidate created successfully.');
            setSelectedStudentId(null);
            setStudentQuery('');
            setPhotoUrl('');
            await fetchCandidates(selectedPositionId);
        } catch (err: any) {
            console.error(err);
            const detail = err.response?.data?.detail;
            setError(detail || 'Failed to create candidate.');
        } finally {
            setLoading(false);
        }
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
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold text-gray-900">Candidates</h1>
                <button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                >
                    <PlusIcon />
                    Add Candidate
                </button>
            </div>

            {/* Error / Success Messages */}
            {error && (
                <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                    <p className="text-sm text-red-600">{error}</p>
                </div>
            )}
            {successMessage && (
                <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                    <p className="text-sm text-green-600">{successMessage}</p>
                </div>
            )}

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
                                                    onClick={() => {
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

            {/* Candidates table */}
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                        <h2 className="text-base font-medium text-gray-900">
                            Candidates
                            {selectedElection && selectedPosition
                                ? ` for ${selectedPosition.name} – ${selectedElection.name} (${selectedElection.year})`
                                : ''}
                        </h2>
                        {loading && <span className="text-xs text-gray-500">Loading…</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Search by name or ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-64 border border-blue-200 border-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                    </tr>
                                );
                            })}
                            {!loading && filteredCandidates.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-5 py-8 text-center text-gray-400">
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

