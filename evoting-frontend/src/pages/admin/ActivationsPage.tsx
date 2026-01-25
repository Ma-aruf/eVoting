import {type FormEvent, type MouseEvent, useEffect, useState} from 'react';
import {useElections} from '../../queries/useElections';
import {useStudents} from '../../queries/useStudents';
import {useDashboardStats} from '../../queries/useDashboard';
import {useActivateStudent} from '../../queries/useActivations';
import {showError} from '../../utils/toast';

export default function ActivationsPage() {
    const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);

    // Queries
    const {data: elections = [], isLoading: electionsLoading} = useElections();
    const {data: students = [], isLoading: studentsLoading} = useStudents(selectedElectionId);
    const {data: stats, isLoading: statsLoading} = useDashboardStats(selectedElectionId);
    const [IsStudentActive, setIsStudentActive] = useState(false)
    const [isActivating, setIsActivating] = useState(false)

    // Unified filtering - only show inactive students for activation
    const inactiveStudents = students.filter(student => !student.is_active)

    // Mutations
    const activateStudentMutation = useActivateStudent();

    // Loading state
    const loading = electionsLoading || studentsLoading || statsLoading || activateStudentMutation.isPending;

    // Auto-select first election when data loads
    useEffect(() => {
        if (elections.length > 0 && !selectedElectionId) {
            setSelectedElectionId(elections[0].id);
        }
    }, [elections, selectedElectionId]);

    const [studentQuery, setStudentQuery] = useState('');
    const [studentDropdownOpen, setStudentDropdownOpen] = useState(false);
    const [studentId, setStudentId] = useState('');

    const handleActivate = async (e?: FormEvent | MouseEvent<HTMLButtonElement>) => {
        e?.preventDefault();
        const id = studentId.trim();
        if (!id) return;

        const activeStud = students.find(
            (student) => student.student_id === id
        );
        setIsStudentActive(activeStud?.is_active ?? false)

        if (IsStudentActive) {
            showError('Student is already active');
            return;
        }

        setIsActivating(true);

        activateStudentMutation.mutate(id, {
            onSuccess: () => {
                setStudentId('');
                setStudentQuery('');
                setIsStudentActive(false);
            },
            onError: (err: any) => {
                showError(err.response?.data?.detail || 'Activation failed. Please try again.');
            },
            onSettled: () => {
                setIsActivating(false);
            }
        });
    };

    const selectedStudent = students.find(s => s.student_id.toLowerCase() === studentId.toLowerCase()) ?? null;

    // Unified filtering - search within inactive students only
    const filteredStudentOptions = inactiveStudents.filter((s) => {
        const q = studentQuery.toLowerCase().trim();
        if (!q) return true;
        return s.full_name.toLowerCase().includes(q) || s.student_id.toLowerCase().includes(q);
    });

    return (
        <div className="space-y-0">
            {/* Stat Cards */}
            <section>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Active Students Card */}
                    <div
                        className="bg-gradient-to-br h-30 py-2 px-4 from-blue-400 to-blue-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Total activated</p>
                        </div>
                        <h3 className="font-semibold text-lg">Active Students</h3>
                        <p className="text-3xl font-bold mt-2">{stats?.active_students || 0}</p>
                    </div>

                    {/* Inactive Students Card */}
                    <div
                        className="bg-gradient-to-br h-30 from-cyan-600 to-cyan-900 rounded-xl py-2 px-4 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Total inactive</p>
                        </div>
                        <h3 className="font-semibold text-lg">Inactive Students</h3>
                        <p className="text-3xl font-bold mt-2">{stats?.pending_activations || 0}</p>
                    </div>

                    {/* Total Students Card */}
                    <div
                        className="bg-gradient-to-br h-30 py-2 px-4 from-blue-600 to-blue-900 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
                            </svg>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Total students</p>
                        </div>
                        <h3 className="font-semibold text-lg">All Students</h3>
                        <p className="text-3xl font-bold mt-2">{stats?.total_students || 0}</p>
                    </div>
                </div>
            </section>

            {/* Election Selector */}
            <div className=" p-5">
                <div className="flex-1">
                    <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="election-select">
                        Select Election
                    </label>
                    <select
                        id="election-select"
                        value={selectedElectionId ?? ''}
                        onChange={(e) => setSelectedElectionId(e.target.value ? Number(e.target.value) : null)}
                        className="border border-blue-300 rounded-lg px-3 py-2 text-sm w-full md:w-72 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                        {elections.length === 0 && <option value="">No elections available</option>}
                        {elections.map(e => (
                            <option key={e.id} value={e.id}>{e.name} ({e.year})</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Activate Card */}
            <section className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex flex-col md:flex-row md:items-end gap-4">
                    <div className="flex-1">
                        <h2 className="text-base font-medium text-gray-900">Activate Student</h2>
                        <p className="text-xs text-gray-500 mt-1">Type student name or ID, select from list, then activate.</p>
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
                                disabled={inactiveStudents.length === 0}
                                className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                            />

                            {studentDropdownOpen && students.length > 0 && (
                                <div
                                    className="absolute z-10 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-64 overflow-auto">
                                    {filteredStudentOptions.length === 0 ? (
                                        <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
                                    ) : (
                                        filteredStudentOptions.slice(0, 25).map((student) => (
                                            <button
                                                key={student.id}
                                                type="button"
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    setStudentId(student.student_id);
                                                    setStudentQuery(`${student.full_name} (${student.student_id})`);
                                                    setStudentDropdownOpen(false);
                                                }}
                                                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition"
                                            >
                                                <span
                                                    className="font-medium text-gray-900">{student.full_name}</span>{' '}
                                                <span className="text-gray-500">({student.student_id})</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="w-full lg:w-auto">
                        <button
                            type="submit"
                            disabled={loading || !studentId.trim() || IsStudentActive || isActivating}
                            className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-60 disabled:cursor-not-allowed transition"

                        >
                            {isActivating ? 'Processing…' : 'Activate'}
                        </button>
                    </div>
                </form>

                {selectedStudent && (
                    <div
                        className="mt-4 bg-gray-50 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <p className="text-sm font-medium text-gray-900">{selectedStudent.full_name}</p>
                            <p className="text-xs text-gray-500">{selectedStudent.student_id} • {selectedStudent.class_name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span
                                className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${selectedStudent.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                {selectedStudent.is_active ? 'Active' : 'Inactive'}
                            </span>
                            <span
                                className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${selectedStudent.has_voted ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                {selectedStudent.has_voted ? 'Voted' : 'Not voted'}
                            </span>
                        </div>
                    </div>
                )}
            </section>

        </div>
    );
}