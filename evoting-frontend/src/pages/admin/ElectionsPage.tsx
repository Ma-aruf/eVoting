import {type FormEvent, useState} from 'react';
import {useElections} from '../../queries/useElections';
import {useCreateElection} from '../../queries/useElectionsMutations';
import {showError} from '../../utils/toast';

const CalendarIcon = () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
    </svg>
);

const CheckCircleIcon = () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>
);

const PlusIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
    </svg>
);

export default function ElectionsPage() {
    // Queries
    const {data: elections = [], isLoading: electionsLoading} = useElections();

    // Mutations
    const createElection = useCreateElection();

    const loading = electionsLoading || createElection.isPending;

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [name, setName] = useState('');
    const [year, setYear] = useState<string>('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [isActive, setIsActive] = useState(false);


    const handleCreateElection = async (e: FormEvent) => {
        e.preventDefault();

        if (!name.trim() || !year.trim() || !startTime || !endTime) {
            showError('Please fill in all required fields.');
            return;
        }

        createElection.mutate({
            name: name.trim(),
            year: Number(year),
            start_time: new Date(startTime).toISOString(),
            end_time: new Date(endTime).toISOString(),
            is_active: isActive,
        });

        setName('');
        setYear('');
        setStartTime('');
        setEndTime('');
        setIsActive(false);
        setShowCreateForm(false);
    };

    const formatDateTime = (value: string) =>
        new Date(value).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });

    const activeCount = elections.filter(e => e.is_active).length;
    const inactiveCount = elections.length - activeCount;

    const filteredElections = elections.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(e.year).includes(searchTerm.trim())
    );

    return (
        <div className="space-y-6 relative">
            {/* Loading Overlay */}
            {loading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center  rounded-xl">
                    <div className="bg-white/20 px-6 py-4 rounded-lg shadow-md flex items-center gap-3">
                        <div
                            className="w-6 h-6 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin"></div>
                        <span className="text-sm text-gray-700">Loading elections…</span>
                    </div>
                </div>
            )}

            {/* Stat Cards */}
            <section>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div
                        className="bg-gradient-to-br h-35 from-blue-600 to-blue-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <CalendarIcon/>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">All elections created</p>
                        </div>
                        <h3 className="font-semibold text-lg">Total Elections</h3>
                        <p className="text-3xl font-bold mt-2">{elections.length}</p>
                    </div>

                    <div
                        className="bg-gradient-to-br h-35 from-cyan-600 to-cyan-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <CheckCircleIcon/>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Currently active</p>
                        </div>
                        <h3 className="font-semibold text-lg">Active</h3>
                        <p className="text-3xl font-bold mt-2">{activeCount}</p>
                    </div>

                    <div
                        className="bg-gradient-to-br h-35 from-blue-900 to-blue-900 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <CalendarIcon/>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Not active</p>
                        </div>
                        <h3 className="font-semibold text-lg">Inactive</h3>
                        <p className="text-3xl font-bold mt-2">{inactiveCount}</p>
                    </div>
                </div>
            </section>
            <div className="flex justify-end">
                <button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className="flex w-full sm:w-auto items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                >
                    <PlusIcon/>
                    Create Election
                </button>
            </div>


            {/* Create election form */}
            {showCreateForm && (
                <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <h2 className="text-base font-medium text-gray-900 mb-4">Create New Election</h2>
                    <form onSubmit={handleCreateElection}
                          className="flex flex-col lg:flex-row gap-4 items-end flex-wrap">
                        <div className="flex-1 min-w-[220px]">
                            <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="election_name">
                                Election Name
                            </label>
                            <input
                                id="election_name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g. 2026 SRC Elections"
                                required
                            />
                        </div>

                        <div className="w-36">
                            <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="election_year">
                                Year
                            </label>
                            <input
                                id="election_year"
                                type="number"
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="2026"
                                required
                            />
                        </div>

                        <div className="flex-1 min-w-[220px]">
                            <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="start_time">
                                Start Time
                            </label>
                            <input
                                id="start_time"
                                type="datetime-local"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>

                        <div className="flex-1 min-w-[220px]">
                            <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="end_time">
                                End Time
                            </label>
                            <input
                                id="end_time"
                                type="datetime-local"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>

                        <div className="flex items-center gap-2 pb-2">
                            <input
                                id="is_active"
                                type="checkbox"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                                className="h-4 w-4"
                            />
                            <label htmlFor="is_active" className="text-sm text-gray-700">
                                Set as active
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition"
                        >
                            {loading ? 'Saving…' : 'Submit'}
                        </button>
                    </form>
                </section>
            )}


            {/* Elections table */}
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                        <h2 className="text-base font-medium text-gray-900">All Elections</h2>
                        {loading && <span className="text-xs text-gray-500">Loading…</span>}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                        <input
                            type="text"
                            placeholder="Search by name or year..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full sm:w-64 border border-blue-200 border-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {searchTerm && (
                            <span className="text-xs text-gray-500">
                                {filteredElections.length} of {elections.length}
                            </span>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                        <tr className="bg-blue-100 border-b border-gray-100">
                            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Year</th>
                            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Start</th>
                            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">End</th>
                            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                        {filteredElections.map((election) => (
                            <tr key={election.id} className="hover:bg-gray-50 transition odd:bg-white even:bg-blue-50">
                                <td className="px-5 py-2 font-medium text-gray-900">{election.name}</td>
                                <td className="px-5 py-2 text-gray-700">{election.year}</td>
                                <td className="px-5 py-2 text-gray-700">{formatDateTime(election.start_time)}</td>
                                <td className="px-5 py-2 text-gray-700">{formatDateTime(election.end_time)}</td>
                                <td className="px-5 py-2">
                                    {election.is_active ? (
                                        <span
                                            className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                                                Active
                                            </span>
                                    ) : (
                                        <span
                                            className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                                                Inactive
                                            </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {!loading && filteredElections.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                                    {searchTerm ? 'No elections match your search.' : 'No elections created yet.'}
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

