import {FormEvent, useEffect, useState} from 'react';
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

    const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
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

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold text-gray-800">Candidates</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Register and manage candidates for each position.
                </p>
            </header>

            {(error || successMessage) && (
                <section>
                    {error && (
                        <p className="text-sm text-red-600 mb-1">
                            {error}
                        </p>
                    )}
                    {successMessage && (
                        <p className="text-sm text-green-600">
                            {successMessage}
                        </p>
                    )}
                </section>
            )}

            {/* Filters and create form */}
            <section className="border rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-600 mb-1" htmlFor="election_select">
                            Election
                        </label>
                        <select
                            id="election_select"
                            value={selectedElectionId ?? ''}
                            onChange={(e) =>
                                setSelectedElectionId(e.target.value ? Number(e.target.value) : null)
                            }
                            className="border rounded-md px-3 py-2 text-sm"
                        >
                            {elections.length === 0 && <option value="">No elections available</option>}
                            {elections.length > 0 && <option value="">Select election…</option>}
                            {elections.map((election) => (
                                <option key={election.id} value={election.id}>
                                    {election.name} ({election.year})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-600 mb-1" htmlFor="position_select">
                            Position
                        </label>
                        <select
                            id="position_select"
                            value={selectedPositionId ?? ''}
                            onChange={(e) =>
                                setSelectedPositionId(e.target.value ? Number(e.target.value) : null)
                            }
                            className="border rounded-md px-3 py-2 text-sm"
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

                <div className="border-t border-gray-100 pt-4 mt-2">
                    <h2 className="font-medium text-gray-800 mb-2">Add Candidate</h2>
                    <p className="text-xs text-gray-500 mb-3">
                        Choose a student and position to register a candidate. Optional: add a photo URL.
                    </p>
                    <form
                        onSubmit={handleCreateCandidate}
                        className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
                    >
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-gray-600 mb-1" htmlFor="student_select">
                                Student
                            </label>
                            <select
                                id="student_select"
                                value={selectedStudentId ?? ''}
                                onChange={(e) =>
                                    setSelectedStudentId(e.target.value ? Number(e.target.value) : null)
                                }
                                className="border rounded-md px-3 py-2 text-sm"
                            >
                                {students.length === 0 && (
                                    <option value="">No students available</option>
                                )}
                                {students.length > 0 && <option value="">Select student…</option>}
                                {students.map((student) => (
                                    <option key={student.id} value={student.id}>
                                        {student.full_name} ({student.student_id})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-gray-600 mb-1" htmlFor="photo_url">
                                Photo URL (optional)
                            </label>
                            <input
                                id="photo_url"
                                type="url"
                                value={photoUrl}
                                onChange={(e) => setPhotoUrl(e.target.value)}
                                className="border rounded-md px-3 py-2 text-sm"
                                placeholder="https://..."
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !selectedElectionId || !selectedPositionId}
                            className="px-4 py-2 bg-kosa-primary hover:bg-kosa-primary/90 text-white text-sm rounded-md disabled:opacity-60"
                        >
                            {loading ? 'Saving…' : 'Add Candidate'}
                        </button>
                    </form>
                </div>
            </section>

            {/* Candidates table */}
            <section className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-medium text-gray-800">
                        Candidates
                        {selectedElection && selectedPosition
                            ? ` for ${selectedPosition.name} – ${selectedElection.name} (${selectedElection.year})`
                            : ''}
                    </h2>
                    {loading && <span className="text-xs text-gray-500">Loading…</span>}
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                        <tr className="border-b bg-gray-50">
                            <th className="text-left px-3 py-2">Student</th>
                            <th className="text-left px-3 py-2">Student ID</th>
                            <th className="text-left px-3 py-2">Photo</th>
                        </tr>
                        </thead>
                        <tbody>
                        {candidates.map((candidate) => {
                            const student = students.find((s) => s.id === candidate.student);
                            return (
                                <tr key={candidate.id} className="border-b last:border-b-0">
                                    <td className="px-3 py-2">
                                        {candidate.student_name || student?.full_name || '—'}
                                    </td>
                                    <td className="px-3 py-2">
                                        {student?.student_id || '—'}
                                    </td>
                                    <td className="px-3 py-2">
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
                        {!loading && candidates.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-3 py-4 text-center text-gray-400">
                                    {selectedPosition
                                        ? 'No candidates registered for this position yet.'
                                        : 'Select an election and position to view candidates.'}
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

