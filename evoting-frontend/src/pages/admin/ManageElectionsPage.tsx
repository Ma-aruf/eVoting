import {useState} from 'react';
import {useManageElections, useToggleElection, type Election} from '../../queries/useManageElections';

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

export default function ManageElectionsPage() {
    // Queries
    const {data: elections = [], isLoading: electionsLoading} = useManageElections();
    
    // Mutations
    const toggleElection = useToggleElection();
    
    // State
    const [actionElectionId, setActionElectionId] = useState<number | null>(null);

    const loading = electionsLoading || toggleElection.isPending;

    const activeElection = elections.find((e) => e.is_active) ?? null;


    const handleToggle = async (election: Election, nextActive: boolean) => {
        const verb = nextActive ? 'set active' : 'stop';
        const ok = window.confirm(`Are you sure you want to ${verb} "${election.name}"?`);
        if (!ok) return;

        setActionElectionId(election.id);
        
        toggleElection.mutate({
            election_id: election.id,
            is_active: nextActive,
        });
        
        setActionElectionId(null);
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

    return (
        <div className="space-y-6 relative">
            {/* Loading Overlay */}
            {loading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl">
                    <div className="bg-white/20 px-6 py-4 rounded-lg shadow-md flex items-center gap-3">
                        <div
                            className="w-6 h-6 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin"></div>
                        <span className="text-sm text-gray-700">Loading elections…</span>
                    </div>
                </div>
            )}
            {/* Page Header */}
            {/* Stat Cards */}
            <section>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br h-35 from-blue-600 to-blue-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <CalendarIcon />
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">All elections</p>
                        </div>
                        <h3 className="font-semibold text-lg">Total Elections</h3>
                        <p className="text-3xl font-bold mt-2">{elections.length}</p>
                    </div>

                    <div className="bg-gradient-to-br h-35 from-cyan-600 to-cyan-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <CheckCircleIcon />
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Currently active</p>
                        </div>
                        <h3 className="font-semibold text-lg">Active</h3>
                        <p className="text-3xl font-bold mt-2">{activeCount}</p>
                    </div>

                    <div className="bg-gradient-to-br h-35 from-blue-900 to-blue-900 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <CalendarIcon />
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80">Not active</p>
                        </div>
                        <h3 className="font-semibold text-lg">Inactive</h3>
                        <p className="text-3xl font-bold mt-2">{inactiveCount}</p>
                    </div>
                </div>
            </section>

            {/* Currently Active */}
            <section className="bg-white/50 rounded-xl border border-gray-200  p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3 ">
                        <p className="text-lg font-semibold text-gray-900">
                            {activeElection ? activeElection.name : 'No active election'}
                        </p>
                        {activeElection && (
                            <p className="text-sm text-gray-600 mt-1">
                                {formatDateTime(activeElection.start_time)} – {formatDateTime(activeElection.end_time)}
                            </p>
                        )}
                    </div>
                    {activeElection && (
                        <button
                            type="button"
                            disabled={actionElectionId === activeElection.id}
                            onClick={() => handleToggle(activeElection, false)}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            {actionElectionId === activeElection.id ? 'Stopping…' : 'Stop Active Election'}
                        </button>
                    )}
                </div>
            </section>

            {/* Elections Table */}
            <section className="bg-white/80 rounded-xl border border-gray-200  overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-2 px-5 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                        <h2 className="text-base font-medium text-gray-900">All Elections</h2>
                        {loading && <span className="text-xs text-gray-500">Loading…</span>}
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
                                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {elections.map((election) => (
                                <tr
                                    key={election.id}
                                    className="hover:bg-gray-50 transition odd:bg-white even:bg-blue-50"
                                >
                                    <td className="px-5 py-2 font-medium text-gray-900">{election.name}</td>
                                    <td className="px-5 py-2 text-gray-700">{election.year}</td>
                                    <td className="px-5 py-2 text-gray-700">{formatDateTime(election.start_time)}</td>
                                    <td className="px-5 py-2 text-gray-700">{formatDateTime(election.end_time)}</td>
                                    <td className="px-5 py-2">
                                        {election.is_active ? (
                                            <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                                                Active
                                            </span>
                                        ) : (
                                            <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                                                Inactive
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-2">
                                        <button
                                            type="button"
                                            disabled={actionElectionId !== null}
                                            onClick={() => handleToggle(election, !election.is_active)}
                                            className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
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
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

