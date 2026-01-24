// pages/admin/Dashboard.tsx
import {useAuth} from '../../hooks/useAuth';
import {useElections} from '../../queries/useElections';
import {useDashboardStats} from "../../queries/useDashboard.ts";

const FolderIcon = () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
    </svg>
);

const UsersIcon = () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
    </svg>
);

const ListIcon = () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
    </svg>
);

const CalendarIcon = () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
    </svg>
);

export default function Dashboard() {
    useAuth();

    // Queries
    const {data: elections = [], isLoading: electionsLoading} = useElections();
    const activeElection = elections.find(e => e.is_active) || null;
    const {data: stats, isLoading: statsLoading} = useDashboardStats(activeElection?.id || null);

    // Loading state
    const loading = electionsLoading || statsLoading;

    const formatDateTime = (value: string | undefined) => {
        if (!value) return '';
        return new Date(value).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    return (
        <div className="space-y-6">
                 {/* Loading / Error States */}
            {loading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl">
                    <div className="bg-white/20 px-6 py-4 rounded-lg shadow-md flex items-center gap-3">
                        <div
                            className="w-6 h-6 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin"></div>
                        <span className="text-sm text-gray-700">Fetching statistics…</span>
                    </div>
                </div>
            )}


            {/* Stat Cards - Folder Style */}
            <section>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Active Election Card */}
                    <div
                        className="bg-gradient-to-br h-40 from-blue-600 to-blue-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <CalendarIcon/>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center">
                                <FolderIcon/>
                            </div>
                            <span className="text-xs font-medium bg-white/10 px-2 py-1 rounded">ACTIVE</span>
                        </div>
                        <h3 className="font-semibold text-lg">
                            {activeElection ? activeElection.name : 'No Active Election'}
                        </h3>

                        {activeElection && (
                            <p className="text-xs text-white/70 mt-2">
                                {formatDateTime(activeElection.start_time)} - {formatDateTime(activeElection.end_time)}
                            </p>
                        )}
                    </div>

                    {/* Students Card */}
                    <div
                        className="bg-gradient-to-br h-40  from-cyan-600 to-cyan-600 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <UsersIcon/>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80 mt-1">Total registered voters</p>
                        </div>
                        <h3 className="font-semibold text-lg">Students</h3>
                        <p className="text-3xl font-bold mt-2">{stats?.total_students || 0}</p>

                    </div>

                    {/* Elections Card */}
                    <div
                        className="bg-gradient-to-br h-40 from-blue-900 to-blue-900 rounded-xl p-5 text-white relative overflow-hidden">
                        <div className="absolute top-4 right-4 opacity-20">
                            <ListIcon/>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <p className="text-sm text-white/80 mt-1">Total elections created</p>
                        </div>
                        <h3 className="font-semibold text-lg">Elections</h3>
                        <p className="text-3xl font-bold mt-2">{elections.length}</p>
                    </div>
                </div>
            </section>


            {/* Active Election Details */}
            {activeElection && (
                <section>
                    <h2 className="text-base font-medium text-gray-900 mb-4">Active Election Details</h2>
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="p-5">
                            <div className="flex items-start justify-between">
                                <div className="flex gap-4">
                                    <h3 className="font-semibold text-lg text-gray-900">{activeElection.name}</h3>
                                    <p className="text-sm text-gray-500 mt-1">Year: {activeElection.year}</p>
                                </div>
                                <span
                                    className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                    Active
                                </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
                                <div className="bg-green-200/40 rounded-lg p-3">
                                    <p className="text-xs text-gray-500 uppercase">Positions</p>
                                    <p className="text-xl font-bold text-blue-600">{stats?.total_positions || 0}</p>
                                </div>
                                <div className="bg-green-200/50 rounded-lg p-3">
                                    <p className="text-xs text-gray-500 uppercase">Candidates</p>
                                    <p className="text-xl font-bold text-blue-600">{stats?.total_candidates || 0}</p>
                                </div>
                                <div className="bg-green-200/60 rounded-lg p-3">
                                    <p className="text-xs text-gray-500 uppercase">Start</p>
                                    <p className="text-sm font-medium text-gray-900">{formatDateTime(activeElection.start_time)}</p>
                                </div>
                                <div className="bg-green-200/70 rounded-lg p-3">
                                    <p className="text-xs text-gray-500 uppercase">End</p>
                                    <p className="text-sm font-medium text-gray-900">{formatDateTime(activeElection.end_time)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}