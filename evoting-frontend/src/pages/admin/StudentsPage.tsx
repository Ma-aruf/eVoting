import { FormEvent, useEffect, useState } from 'react';
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
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Student[]>('students/');
      setStudents(res.data);
    } catch (err) {
      setError('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploadResult(null);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('students/bulk-upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
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
            View students and import new ones from an Excel file.
          </p>
        </div>
      </header>

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
        {error && <p className="text-sm text-red-600">{error}</p>}
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

