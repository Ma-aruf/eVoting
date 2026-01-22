import {type FormEvent, useEffect, useState} from 'react';
import api from '../../apiConfig';
import {showError, showSuccess} from '../../utils/toast';

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

 const ListIcon = () => (
     <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
     </svg>
 );

 const CalendarIcon = () => (
     <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
               d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
     </svg>
 );

 const PlusIcon = () => (
     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
     </svg>
 );

export default function PositionsPage() {
    const [elections, setElections] = useState<Election[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);

    const [loading, setLoading] = useState(false);

     const [showCreateForm, setShowCreateForm] = useState(false);
     const [searchTerm, setSearchTerm] = useState('');

    const [positionName, setPositionName] = useState('');
    const [displayOrder, setDisplayOrder] = useState<string>('');

    const [editingPosition, setEditingPosition] = useState<Position | null>(null);
    const [editPositionName, setEditPositionName] = useState('');
    const [editDisplayOrder, setEditDisplayOrder] = useState<string>('');

    const fetchElections = async () => {
        setLoading(true);
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
            showError('Failed to load elections.');
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
            showError('Failed to load positions.');
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

        if (!selectedElectionId) {
            showError('Please select an election.');
            return;
        }

        try {
            setLoading(true);
            await api.post('api/positions/create/', {
                name: positionName.trim(),
                display_order: parseInt(displayOrder, 10) || 1,
                election: selectedElectionId,
            });

            showSuccess('Position created successfully.');
            setPositionName('');
            setDisplayOrder('');
            await fetchPositions(selectedElectionId);
        } catch (err: any) {
            console.error(err);
            const detail = err.response?.data?.detail;
            showError(detail || 'Failed to create position.');
        } finally {
            setLoading(false);
        }
    };

    const handleEditPosition = (position: Position) => {
        setEditingPosition(position);
        setEditPositionName(position.name);
        setEditDisplayOrder(position.display_order.toString());
    };

    const handleUpdatePosition = async (e: FormEvent) => {
        e.preventDefault();
        if (!editingPosition) return;

        setLoading(true);

        try {
            await api.put(`api/positions/${editingPosition.id}/`, {
                name: editPositionName.trim(),
                display_order: parseInt(editDisplayOrder, 10) || 1,
            });
            showSuccess('Position updated successfully.');
            setEditingPosition(null);
            setEditPositionName('');
            setEditDisplayOrder('');
            await fetchPositions(selectedElectionId);
        } catch (err: any) {
            console.error(err);
            showError(err.response?.data?.detail || 'Failed to update position.');
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePosition = async (position: Position) => {
        if (!confirm(`Delete position "${position.name}"?`)) return;

        setLoading(true);

        try {
            await api.delete(`api/positions/${position.id}/`);
            showSuccess('Position deleted.');
            await fetchPositions(selectedElectionId);
        } catch (err: any) {
            console.error(err);
            showError(err.response?.data?.detail || 'Failed to delete position.');
        } finally {
            setLoading(false);
        }
    };

    const selectedElection = elections.find(e => e.id === selectedElectionId) || null;
    const maxDisplayOrder = positions.reduce((max, p) => Math.max(max, p.display_order ?? 0), 0);

    const filteredPositions = positions.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(p.display_order).includes(searchTerm.trim())
    );

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold text-gray-900">Positions</h1>
                <button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                >
                    <PlusIcon />
                    Add Position
                </button>
            </div>


            {/* Stat Cards */}
            <section>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br h-35 from-blue-600 to-blue-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <ListIcon />
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">For selected election</p>
                        </div>
                        <h3 className="font-semibold text-lg">Total Positions</h3>
                        <p className="text-3xl font-bold mt-2">{positions.length}</p>
                    </div>

                    <div className="bg-gradient-to-br h-35 from-cyan-600 to-cyan-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <CalendarIcon />
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Available elections</p>
                        </div>
                        <h3 className="font-semibold text-lg">Elections</h3>
                        <p className="text-3xl font-bold mt-2">{elections.length}</p>
                    </div>

                    <div className="bg-gradient-to-br h-35 from-blue-900 to-blue-900 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <ListIcon />
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Highest order number</p>
                        </div>
                        <h3 className="font-semibold text-lg">Max Order</h3>
                        <p className="text-3xl font-bold mt-2">{maxDisplayOrder}</p>
                    </div>
                </div>
            </section>

            {/* Election selector */}
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h2 className="text-base font-medium text-gray-900">Select Election</h2>
                        <p className="text-xs text-gray-500 mt-1">Positions are always tied to a specific election.</p>
                    </div>
                    <select
                        value={selectedElectionId ?? ''}
                        onChange={(e) => setSelectedElectionId(e.target.value ? Number(e.target.value) : null)}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full md:w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            </section>

            {/* Create position form */}
            {showCreateForm && (
                <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <h2 className="text-base font-medium text-gray-900 mb-4">Add Position to Election</h2>
                    <form onSubmit={handleCreatePosition} className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1">
                            <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="position_name">
                                Position Name
                            </label>
                            <input
                                id="position_name"
                                type="text"
                                value={positionName}
                                onChange={(e) => setPositionName(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g. President"
                                required
                            />
                        </div>
                        <div className="w-full md:w-48">
                            <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="display_order">
                                Display Order
                            </label>
                            <input
                                id="display_order"
                                type="number"
                                value={displayOrder}
                                onChange={(e) => setDisplayOrder(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g. 1"
                                min={1}
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !selectedElectionId}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition"
                        >
                            {loading ? 'Saving…' : 'Submit'}
                        </button>
                    </form>
                    {!selectedElection && elections.length > 0 && (
                        <p className="text-xs text-gray-500 mt-2">
                            Select an election above before adding a position.
                        </p>
                    )}
                </section>
            )}

            {/* Edit Position Form */}
            {editingPosition && (
                <section className="bg-white rounded-xl border border-blue-200 shadow-sm p-5">
                    <h2 className="text-base font-medium text-gray-900 mb-4">
                        Edit Position: {editingPosition.name}
                    </h2>
                    <form onSubmit={handleUpdatePosition} className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1">
                            <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="edit_position_name">
                                Position Name
                            </label>
                            <input
                                id="edit_position_name"
                                type="text"
                                value={editPositionName}
                                onChange={(e) => setEditPositionName(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g. President"
                                required
                            />
                        </div>
                        <div className="w-full md:w-48">
                            <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="edit_display_order">
                                Display Order
                            </label>
                            <input
                                id="edit_display_order"
                                type="number"
                                value={editDisplayOrder}
                                onChange={(e) => setEditDisplayOrder(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g. 1"
                                min={1}
                                required
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition"
                            >
                                {loading ? 'Saving…' : 'Update'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingPosition(null);
                                    setEditPositionName('');
                                    setEditDisplayOrder('');
                                }}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </section>
            )}

            {/* Positions table */}
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                        <h2 className="text-base font-medium text-gray-900">
                            Positions {selectedElection ? `for ${selectedElection.name} (${selectedElection.year})` : ''}
                        </h2>
                        {loading && <span className="text-xs text-gray-500">Loading…</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Search by name or order..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-64 border border-blue-200 border-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {searchTerm && (
                            <span className="text-xs text-gray-500">
                                {filteredPositions.length} of {positions.length}
                            </span>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="bg-blue-100 border-b border-gray-100">
                                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Display Order</th>
                                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredPositions.map((position) => (
                                <tr key={position.id} className="hover:bg-gray-50 transition odd:bg-white even:bg-blue-50">
                                    <td className="px-5 py-2 font-medium text-gray-900">{position.name}</td>
                                    <td className="px-5 py-2 text-gray-700">{position.display_order}</td>
                                    <td className="px-5 py-2 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => handleEditPosition(position)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDeletePosition(position)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-600 transition"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loading && filteredPositions.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-5 py-8 text-center text-gray-400">
                                        {searchTerm
                                            ? 'No positions match your search.'
                                            : (selectedElection
                                                ? 'No positions created for this election yet.'
                                                : 'Select an election to view its positions.')}
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

