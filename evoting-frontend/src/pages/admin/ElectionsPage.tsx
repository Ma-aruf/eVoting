import {FormEvent, useEffect, useState} from 'react';
import api from '../../apiConfig';

interface Election {
    id: number;
    name: string;
    year: number;
    start_time: string;
    end_time: string;
    is_active: boolean;
}

interface ListResponse<T> {
    count?: number;
    results?: T[];
}

export default function ElectionsPage() {
    const [elections, setElections] = useState<Election[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [year, setYear] = useState<string>('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [isActive, setIsActive] = useState(false);

    const fetchElections = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<Election[] | ListResponse<Election>>('api/elections/');
            const data = res.data;
            if (Array.isArray(data)) {
                setElections(data);
            } else if (Array.isArray(data.results)) {
                setElections(data.results);
            } else {
                setElections([]);
            }
        } catch (err) {
            console.error(err);
            setError('Failed to load elections.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchElections();
    }, []);

    const handleCreateElection = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!name.trim() || !year.trim() || !startTime || !endTime) {
            setError('Please fill in all required fields.');
            return;
        }

        try {
            setLoading(true);
            await api.post('api/elections/', {
                name: name.trim(),
                year: Number(year),
                start_time: new Date(startTime).toISOString(),
                end_time: new Date(endTime).toISOString(),
                is_active: isActive,
            });

            setSuccessMessage('Election created successfully.');
            setName('');
            setYear('');
            setStartTime('');
            setEndTime('');
            setIsActive(false);

            await fetchElections();
        } catch (err: any) {
            console.error(err);
            const detail = err.response?.data?.detail;
            setError(detail || 'Failed to create election.');
        } finally {
            setLoading(false);
        }
    };

    const formatDateTime = (value: string) =>
        new Date(value).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold text-gray-800">Elections</h1>
                <p className="text-sm text-gray-500 mt-1">
                    View existing elections and create new ones.
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

            {/* Create election form */}
            <section className="border rounded-lg p-4 space-y-3">
                <h2 className="font-medium text-gray-800">Create New Election</h2>
                <p className="text-xs text-gray-500">
                    Provide the basic details for the election. You can later configure positions and candidates.
                </p>
                <form onSubmit={handleCreateElection} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-600 mb-1" htmlFor="election_name">
                            Election Name
                        </label>
                        <input
                            id="election_name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="border rounded-md px-3 py-2 text-sm"
                            placeholder="e.g. 2026 SRC Elections"
                            required
                        />
                    </div>

                    <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-600 mb-1" htmlFor="election_year">
                            Year
                        </label>
                        <input
                            id="election_year"
                            type="number"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            className="border rounded-md px-3 py-2 text-sm"
                            placeholder="e.g. 2026"
                            required
                        />
                    </div>

                    <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-600 mb-1" htmlFor="start_time">
                            Start Time
                        </label>
                        <input
                            id="start_time"
                            type="datetime-local"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="border rounded-md px-3 py-2 text-sm"
                            required
                        />
                    </div>

                    <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-600 mb-1" htmlFor="end_time">
                            End Time
                        </label>
                        <input
                            id="end_time"
                            type="datetime-local"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            className="border rounded-md px-3 py-2 text-sm"
                            required
                        />
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                        <input
                            id="is_active"
                            type="checkbox"
                            checked={isActive}
                            onChange={(e) => setIsActive(e.target.checked)}
                            className="h-4 w-4"
                        />
                        <label htmlFor="is_active" className="text-sm text-gray-700">
                            Set as active election
                        </label>
                    </div>

                    <div className="flex items-end">
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-kosa-primary hover:bg-kosa-primary/90 text-white text-sm rounded-md disabled:opacity-60"
                        >
                            {loading ? 'Saving…' : 'Create Election'}
                        </button>
                    </div>
                </form>
            </section>

            {/* Elections table */}
            <section className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-medium text-gray-800">Existing Elections</h2>
                    {loading && <span className="text-xs text-gray-500">Loading…</span>}
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                        <tr className="border-b bg-gray-50">
                            <th className="text-left px-3 py-2">Name</th>
                            <th className="text-left px-3 py-2">Year</th>
                            <th className="text-left px-3 py-2">Start</th>
                            <th className="text-left px-3 py-2">End</th>
                            <th className="text-left px-3 py-2">Active</th>
                        </tr>
                        </thead>
                        <tbody>
                        {elections.map((election) => (
                            <tr key={election.id} className="border-b last:border-b-0">
                                <td className="px-3 py-2">{election.name}</td>
                                <td className="px-3 py-2">{election.year}</td>
                                <td className="px-3 py-2">{formatDateTime(election.start_time)}</td>
                                <td className="px-3 py-2">{formatDateTime(election.end_time)}</td>
                                <td className="px-3 py-2">
                                    {election.is_active ? (
                                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                                            Active
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                            Inactive
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {!loading && elections.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-3 py-4 text-center text-gray-400">
                                    No elections created yet.
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

