import {useEffect, useState} from 'react';
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

export default function ManageElectionsPage() {
    const [elections, setElections] = useState<Election[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionElectionId, setActionElectionId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const activeElection = elections.find((e) => e.is_active) ?? null;

    const fetchElections = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<ListResponse<Election> | Election[]>('api/elections/manage/');
            const data = res.data;
            const list = Array.isArray(data) ? data : (data.results ?? []);
            setElections(list);
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

    const handleToggle = async (election: Election, nextActive: boolean) => {
        setError(null);
        setSuccessMessage(null);

        const verb = nextActive ? 'set active' : 'stop';
        const ok = window.confirm(`Are you sure you want to ${verb} "${election.name}"?`);
        if (!ok) return;

        try {
            setActionElectionId(election.id);
            await api.patch('api/elections/manage/', {
                election_id: election.id,
                is_active: nextActive,
            });
            setSuccessMessage(
                nextActive
                    ? `Election "${election.name}" is now active.`
                    : `Election "${election.name}" has been stopped.`,
            );
            await fetchElections();
        } catch (err: any) {
            console.error(err);
            const detail = err.response?.data?.detail;
            setError(detail || 'Failed to update election status.');
        } finally {
            setActionElectionId(null);
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
                <h1 className="text-2xl font-semibold text-gray-800">Manage Elections</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Start or stop elections by toggling their active status. Only one election can be active at a time.
                </p>
            </header>

            <section className="border rounded-lg p-4 bg-white">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Currently Active</p>
                        <p className="text-lg font-semibold text-gray-900">
                            {activeElection ? activeElection.name : 'No active election'}
                        </p>
                        {activeElection && (
                            <p className="text-sm text-gray-600">
                                {formatDateTime(activeElection.start_time)} – {formatDateTime(activeElection.end_time)}
                            </p>
                        )}
                    </div>
                    {activeElection && (
                        <button
                            type="button"
                            disabled={actionElectionId === activeElection.id}
                            onClick={() => handleToggle(activeElection, false)}
                            className="px-3 py-2 rounded-md text-sm font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {actionElectionId === activeElection.id ? 'Stopping…' : 'Stop Active Election'}
                        </button>
                    )}
                </div>
            </section>

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

            <section className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-medium text-gray-800">All Elections</h2>
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
                            <th className="text-left px-3 py-2">Status</th>
                            <th className="text-left px-3 py-2">Action</th>
                        </tr>
                        </thead>
                        <tbody>
                        {elections.map((election) => (
                            <tr
                                key={election.id}
                                className={`border-b last:border-b-0 ${election.is_active ? 'bg-green-50' : ''}`}
                            >
                                <td className="px-3 py-2">{election.name}</td>
                                <td className="px-3 py-2">{election.year}</td>
                                <td className="px-3 py-2">{formatDateTime(election.start_time)}</td>
                                <td className="px-3 py-2">{formatDateTime(election.end_time)}</td>
                                <td className="px-3 py-2">
                                    {election.is_active ? (
                                        <span
                                            className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                                            Active
                                        </span>
                                    ) : (
                                        <span
                                            className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                            Inactive
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-2">
                                    <button
                                        type="button"
                                        disabled={actionElectionId !== null}
                                        onClick={() => handleToggle(election, !election.is_active)}
                                        className={`px-3 py-1 rounded-md text-xs font-medium ${
                                            election.is_active
                                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                                : 'bg-green-600 hover:bg-green-700 text-white'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {actionElectionId === election.id
                                            ? (election.is_active ? 'Stopping…' : 'Activating…')
                                            : (election.is_active ? 'Stop Election' : 'Set Active')}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {!loading && elections.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-3 py-4 text-center text-gray-400">
                                    No elections found. Create an election first on the Elections page.
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

