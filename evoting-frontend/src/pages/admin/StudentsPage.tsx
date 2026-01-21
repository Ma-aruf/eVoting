import {type FormEvent, useEffect, useState} from 'react';
import api from '../../apiConfig';

interface Student {
    id: number;
    student_id: string;
    full_name: string;
    class_name: string;
    has_voted: boolean;
    is_active: boolean;
}

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

export default function StudentsPage() {
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Toggle for add student form
    const [showAddForm, setShowAddForm] = useState(false);

    // Single student form state
    const [studentId, setStudentId] = useState('');
    const [fullName, setFullName] = useState('');
    const [className, setClassName] = useState('');

    const [file, setFile] = useState<File | null>(null);
    const [uploadResult, setUploadResult] = useState<string | null>(null);

    const fetchStudents = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<Student[] | { results?: Student[] }>('api/students/');
            const data = res.data;
            if (Array.isArray(data)) {
                setStudents(data);
            } else if (Array.isArray(data.results)) {
                setStudents(data.results);
            } else {
                setStudents([]);
            }
        } catch (err) {
            setError('Failed to load students');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStudents();
    }, []);

    const handleCreateStudent = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!studentId.trim() || !fullName.trim() || !className.trim()) {
            setError('Please fill in all required fields.');
            return;
        }

        try {
            setLoading(true);
            await api.post('api/students/', {
                student_id: studentId.trim(),
                full_name: fullName.trim(),
                class_name: className.trim(),
            });

            setSuccessMessage('Student added successfully.');
            setStudentId('');
            setFullName('');
            setClassName('');
            setShowAddForm(false);
            await fetchStudents();
        } catch (err: any) {
            const detail = err.response?.data?.detail;
            setError(detail || 'Failed to add student. Make sure the ID is unique.');
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (e: FormEvent) => {
        e.preventDefault();
        if (!file) return;
        setUploadResult(null);
        setError(null);
        setSuccessMessage(null);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await api.post('api/students/bulk-upload/', formData, {
                headers: {'Content-Type': 'multipart/form-data'},
            });
            setUploadResult(res.data.detail || 'Upload completed');
            setFile(null);
            await fetchStudents();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Bulk upload failed');
        }
    };

    const activeCount = students.filter(s => s.is_active).length;
    const votedCount = students.filter(s => s.has_voted).length;

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold text-gray-900">Students</h1>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                >
                    <PlusIcon />
                    Add Student
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

            {/* Add Student Form - Collapsible */}
            {showAddForm && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
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
                            <input
                                id="class_name"
                                type="text"
                                value={className}
                                onChange={(e) => setClassName(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g. SHS 2 Science 1"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition"
                        >
                            {loading ? 'Saving…' : 'Submit'}
                        </button>
                    </form>
                </div>
            )}

            {/* Stat Cards */}
            <section>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Total Students Card */}
                    <div className="bg-gradient-to-br h-35 from-blue-600 to-blue-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <UsersIcon />
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Total registered students</p>
                        </div>
                        <h3 className="font-semibold text-lg">Total Students</h3>
                        <p className="text-3xl font-bold mt-2">{students.length}</p>
                    </div>

                    {/* Active Students Card */}
                    <div className="bg-gradient-to-br h-35 from-cyan-600 to-cyan-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <CheckCircleIcon />
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Activated for voting</p>
                        </div>
                        <h3 className="font-semibold text-lg">Active Students</h3>
                        <p className="text-3xl font-bold mt-2">{activeCount}</p>
                    </div>

                    {/* Voted Students Card */}
                    <div className="bg-gradient-to-br h-35 from-blue-900 to-blue-900 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <CheckCircleIcon />
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Already cast their vote</p>
                        </div>
                        <h3 className="font-semibold text-lg">Have Voted</h3>
                        <p className="text-3xl font-bold mt-2">{votedCount}</p>
                    </div>
                </div>
            </section>

            {/* Bulk Upload Section */}
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
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
                        disabled={!file}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition"
                    >
                        Upload
                    </button>
                </form>
                {uploadResult && <p className="text-sm text-green-600 mt-3">{uploadResult}</p>}
            </section>

            {/* Students Table */}
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <h2 className="text-base font-medium text-gray-900">All Students</h2>
                    {loading && <span className="text-xs text-gray-500">Loading…</span>}
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
                            </tr>
                        </thead>
                        <tbody className="divide-y  divide-gray-100">
                            {students.map((s) => (
                                <tr key={s.id} className="hover:bg-gray-50 transition odd:bg-white even:bg-blue-50 ">
                                    <td className="px-5 py-2 font-medium text-gray-900">{s.student_id}</td>
                                    <td className="px-5 py-2 text-gray-700">{s.full_name}</td>
                                    <td className="px-5 py-2 text-gray-700">{s.class_name}</td>
                                    <td className="px-5 py-2 ">
                                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {s.is_active ? 'Yes' : 'No'}
                                        </span>
                                    </td>
                                    <td className="px-5 ">
                                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${s.has_voted ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {s.has_voted ? 'Yes' : 'No'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {!loading && students.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                                        No students found.
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

