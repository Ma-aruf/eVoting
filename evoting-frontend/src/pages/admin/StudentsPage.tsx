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

export default function StudentsPage() {
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
            await fetchStudents();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Bulk upload failed');
        }
    };

    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-800">Students</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Add individual students or import them in bulk from an Excel file.
                    </p>
                </div>
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

            <section className="border rounded-lg p-4 space-y-3">
                <h2 className="font-medium text-gray-800">Add Single Student</h2>
                <p className="text-xs text-gray-500">
                    Use this form to quickly add or correct an individual student record.
                </p>
                <form onSubmit={handleCreateStudent} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-600 mb-1" htmlFor="student_id">
                            Student ID
                        </label>
                        <input
                            id="student_id"
                            type="text"
                            value={studentId}
                            onChange={(e) => setStudentId(e.target.value)}
                            className="border rounded-md px-3 py-2 text-sm"
                            placeholder="e.g. 23KOSA001"
                            required
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-600 mb-1" htmlFor="full_name">
                            Full Name
                        </label>
                        <input
                            id="full_name"
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="border rounded-md px-3 py-2 text-sm"
                            placeholder="e.g. Ama Mensah"
                            required
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-600 mb-1" htmlFor="class_name">
                            Class
                        </label>
                        <input
                            id="class_name"
                            type="text"
                            value={className}
                            onChange={(e) => setClassName(e.target.value)}
                            className="border rounded-md px-3 py-2 text-sm"
                            placeholder="e.g. SHS 2 Science 1"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-2 bg-kosa-primary hover:bg-kosa-primary/90 text-white text-sm rounded-md disabled:opacity-60"
                    >
                        {loading ? 'Saving…' : 'Add Student'}
                    </button>
                </form>
            </section>

            <section className="border rounded-lg p-4 space-y-3">
                <h2 className="font-medium text-gray-800">Bulk Upload from Excel</h2>
                <p className="text-xs text-gray-500">
                    Required columns (header row): <code>student_id</code>, <code>full_name</code>,{' '}
                    <code>class_name</code>.
                </p>
                <form onSubmit={handleUpload} className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                    <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        className="text-sm"
                    />
                    <button
                        type="submit"
                        disabled={!file}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md disabled:opacity-60"
                    >
                        Upload
                    </button>
                </form>
                {uploadResult && <p className="text-sm text-green-600">{uploadResult}</p>}
            </section>

            <section className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-medium text-gray-800">Current Students</h2>
                    {loading && <span className="text-xs text-gray-500">Loading…</span>}
                </div>
                {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                        <tr className="border-b bg-gray-50">
                            <th className="text-left px-3 py-2">Student ID</th>
                            <th className="text-left px-3 py-2">Name</th>
                            <th className="text-left px-3 py-2">Class</th>
                            <th className="text-left px-3 py-2">Active</th>
                            <th className="text-left px-3 py-2">Has Voted</th>
                        </tr>
                        </thead>
                        <tbody>
                        {students.map((s) => (
                            <tr key={s.id} className="border-b last:border-b-0">
                                <td className="px-3 py-2">{s.student_id}</td>
                                <td className="px-3 py-2">{s.full_name}</td>
                                <td className="px-3 py-2">{s.class_name}</td>
                                <td className="px-3 py-2">{s.is_active ? 'Yes' : 'No'}</td>
                                <td className="px-3 py-2">{s.has_voted ? 'Yes' : 'No'}</td>
                            </tr>
                        ))}
                        {!loading && students.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-3 py-4 text-center text-gray-400">
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

