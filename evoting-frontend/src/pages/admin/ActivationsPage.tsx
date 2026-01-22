import {type FormEvent, type MouseEvent, useEffect, useState} from 'react';
import api from '../../apiConfig';

interface Student {
    id: number;
    student_id: string;
    full_name: string;
    class_name: string;
    has_voted: boolean;
    is_active: boolean;
}

interface ListResponse<T> {
    count?: number;
    results?: T[];
}

export default function ActivationsPage() {
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(false);

    const [studentQuery, setStudentQuery] = useState('');
    const [studentDropdownOpen, setStudentDropdownOpen] = useState(false);
    const [studentId, setStudentId] = useState('');

    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchStudents = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<Student[] | ListResponse<Student>>('api/students/');
            const data = res.data;
            if (Array.isArray(data)) {
                setStudents(data);
            } else if (Array.isArray(data.results)) {
                setStudents(data.results);
            } else {
                setStudents([]);
            }
        } catch (err) {
            setError('Failed to load students.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStudents();
    }, []);

    const handleToggle = async (nextActive: boolean, targetStudentId?: string) => {
        const id = (targetStudentId ?? studentId).trim();
        if (!id) return;

        setMessage(null);
        setError(null);
        setLoading(true);
        try {
            const res = await api.post('api/students/activate/', {
                student_id: id,
                is_active: nextActive,
            });

            setMessage(res.data.detail || (nextActive ? 'Student activated successfully' : 'Student deactivated successfully'));
            setStudentId('');
            setStudentQuery('');
            await fetchStudents();
        } catch (err: any) {
            setError(err.response?.data?.detail || (nextActive ? 'Activation failed. Please try again.' : 'Deactivation failed. Please try again.'));
        } finally {
            setLoading(false);
        }
    };

    const handleActivate = async (e?: FormEvent | MouseEvent<HTMLButtonElement>) => {
        e?.preventDefault();
        await handleToggle(true);
    };

    const handleDeactivate = async (e?: FormEvent | MouseEvent<HTMLButtonElement>) => {
        e?.preventDefault();
        await handleToggle(false);
    };

    const selectedStudent = students.find(s => s.student_id.toLowerCase() === studentId.toLowerCase()) ?? null;

    const filteredStudentOptions = students.filter((s) => {
        const q = studentQuery.toLowerCase().trim();
        if (!q) return true;
        return s.full_name.toLowerCase().includes(q) || s.student_id.toLowerCase().includes(q);
    });

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold text-gray-900">Voter Activation</h1>
            </div>

            {/* Error / Success Messages */}
            {error && (
                <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                    <p className="text-sm text-red-600">{error}</p>
                </div>
            )}
            {message && (
                <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                    <p className="text-sm text-green-600">{message}</p>
                </div>
            )}


            {/* Activate/Deactivate Card */}
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex flex-col md:flex-row md:items-end gap-4">
                    <div className="flex-1">
                        <h2 className="text-base font-medium text-gray-900">Activate / Deactivate Student</h2>
                        <p className="text-xs text-gray-500 mt-1">Type student name or ID, select from list, then activate or deactivate.</p>
                    </div>
                </div>

                <form className="mt-4 flex flex-col lg:flex-row gap-4 items-end" onSubmit={handleActivate}>
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
                                    setStudentId('');
                                }}
                                onFocus={() => setStudentDropdownOpen(true)}
                                onBlur={() => {
                                    window.setTimeout(() => setStudentDropdownOpen(false), 150);
                                }}
                                placeholder="Type student name or ID..."
                                disabled={students.length === 0}
                                className="w-full border border-blue-200 border-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
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
                                                    setStudentId(student.student_id);
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
                    </div>

                    <div className="flex gap-3 w-full lg:w-auto">
                        <button
                            type="submit"
                            disabled={loading || !studentId.trim()}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-60 disabled:cursor-not-allowed transition flex-1"
                        >
                            {loading ? 'Processing…' : 'Activate'}
                        </button>
                        <button
                            type="button"
                            onClick={handleDeactivate}
                            disabled={loading || !studentId.trim()}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-800 hover:bg-red-800 text-white disabled:opacity-60 disabled:cursor-not-allowed transition flex-1"
                        >
                            {loading ? 'Processing…' : 'Deactivate'}
                        </button>
                    </div>
                </form>

                {selectedStudent && (
                    <div className="mt-4 bg-gray-50 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <p className="text-sm font-medium text-gray-900">{selectedStudent.full_name}</p>
                            <p className="text-xs text-gray-500">{selectedStudent.student_id} • {selectedStudent.class_name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${selectedStudent.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                {selectedStudent.is_active ? 'Active' : 'Inactive'}
                            </span>
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${selectedStudent.has_voted ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                {selectedStudent.has_voted ? 'Voted' : 'Not voted'}
                            </span>
                        </div>
                    </div>
                )}
            </section>

        </div>
    );
}