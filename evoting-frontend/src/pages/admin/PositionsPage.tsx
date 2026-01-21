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

interface ListResponse<T> {
    count?: number;
    results?: T[];
}

export default function PositionsPage() {
    const [elections, setElections] = useState<Election[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [positionName, setPositionName] = useState('');
    const [displayOrder, setDisplayOrder] = useState<string>('');

    const fetchElections = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<Election[] | ListResponse<Election>>('api/elections/');
            const data = res.data;
            let items: Election[] = [];
            if (Array.isArray(data)) {
                items = data;
            } else if (Array.isArray(data.results)) {
                items = data.results;
            }
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
            const data = res.data;
            if (Array.isArray(data)) {
                setPositions(data);
            } else if (Array.isArray(data.results)) {
                setPositions(data.results);
            } else {
                setPositions([]);
            }
        } catch (err) {
            console.error(err);
            setError('Failed to load positions.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchElections();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selectedElectionId !== null) {
            fetchPositions(selectedElectionId);
        }
    }, [selectedElectionId]);

    const handleCreatePosition = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!selectedElectionId) {
            setError('Please select an election first.');
            return;
        }
        if (!positionName.trim() || !displayOrder.trim()) {
            setError('Please fill in all required fields.');
            return;
        }

        try {
            setLoading(true);
            await api.post('api/positions/create/', {
                name: positionName.trim(),
                display_order: Number(displayOrder),
                election: selectedElectionId,
            });

            setSuccessMessage('Position created successfully.');
            setPositionName('');
            setDisplayOrder('');
            await fetchPositions(selectedElectionId);
        } catch (err: any) {
            console.error(err);
            const detail = err.response?.data?.detail;
            setError(detail || 'Failed to create position.');
        } finally {
            setLoading(false);
        }
    };

    const selectedElection = elections.find(e => e.id === selectedElectionId) || null;

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold text-gray-800">Positions</h1>
                <p className="text-sm text-gray-500 mt-1">
                    View and configure positions for each election.
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

            {/* Election selector + create form */}
            <section className="border rounded-lg p-4 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h2 className="font-medium text-gray-800">Select Election</h2>
                        <p className="text-xs text-gray-500">
                            Positions are always tied to a specific election.
                        </p>
                    </div>
                    <select
                        value={selectedElectionId ?? ''}
                        onChange={(e) => setSelectedElectionId(e.target.value ? Number(e.target.value) : null)}
                        className="border rounded-md px-3 py-2 text-sm w-full md:w-64"
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

                <div className="border-t border-gray-100 pt-4 mt-2">
                    <h2 className="font-medium text-gray-800 mb-2">Add Position to Election</h2>
                    <p className="text-xs text-gray-500 mb-3">
                        Create a new position that students will vote for in the selected election.
                    </p>
                    <form
                        onSubmit={handleCreatePosition}
                        className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
                    >
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-gray-600 mb-1" htmlFor="position_name">
                                Position Name
                            </label>
                            <input
                                id="position_name"
                                type="text"
                                value={positionName}
                                onChange={(e) => setPositionName(e.target.value)}
                                className="border rounded-md px-3 py-2 text-sm"
                                placeholder="e.g. President"
                                required
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-gray-600 mb-1" htmlFor="display_order">
                                Display Order
                            </label>
                            <input
                                id="display_order"
                                type="number"
                                value={displayOrder}
                                onChange={(e) => setDisplayOrder(e.target.value)}
                                className="border rounded-md px-3 py-2 text-sm"
                                placeholder="e.g. 1"
                                min={1}
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !selectedElectionId}
                            className="px-4 py-2 bg-kosa-primary hover:bg-kosa-primary/90 text-white text-sm rounded-md disabled:opacity-60"
                        >
                            {loading ? 'Saving…' : 'Add Position'}
                        </button>
                    </form>
                    {!selectedElection && elections.length > 0 && (
                        <p className="text-xs text-gray-500 mt-2">
                            Select an election above before adding a position.
                        </p>
                    )}
                </div>
            </section>

            {/* Positions table */}
            <section className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-medium text-gray-800">
                        Positions {selectedElection ? `for ${selectedElection.name} (${selectedElection.year})` : ''}
                    </h2>
                    {loading && <span className="text-xs text-gray-500">Loading…</span>}
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                        <tr className="border-b bg-gray-50">
                            <th className="text-left px-3 py-2">Name</th>
                            <th className="text-left px-3 py-2">Display Order</th>
                        </tr>
                        </thead>
                        <tbody>
                        {positions.map((position) => (
                            <tr key={position.id} className="border-b last:border-b-0">
                                <td className="px-3 py-2">{position.name}</td>
                                <td className="px-3 py-2">{position.display_order}</td>
                            </tr>
                        ))}
                        {!loading && positions.length === 0 && (
                            <tr>
                                <td colSpan={2} className="px-3 py-4 text-center text-gray-400">
                                    {selectedElection
                                        ? 'No positions created for this election yet.'
                                        : 'Select an election to view its positions.'}
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

