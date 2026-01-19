import { FormEvent, useState } from 'react';
import api from '../../apiConfig';

export default function ActivationsPage() {
  const [studentId, setStudentId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('students/activate/', {
        student_id: studentId,
        is_active: isActive,
      });
      setMessage(res.data.detail || 'Activation updated');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Activation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-800">Activate Students</h1>
        <p className="text-sm text-gray-500 mt-1">
          Activators can enable or disable students for voting using their student ID.
        </p>
      </header>

      <section className="border rounded-lg p-4 space-y-3">
        <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700">Student ID</label>
            <input
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="active" className="text-sm text-gray-700">
              Set student as active
            </label>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md disabled:opacity-60"
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
        </form>
        {message && <p className="text-sm text-green-600">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>
    </div>
  );
}

