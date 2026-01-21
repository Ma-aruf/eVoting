// pages/admin/Dashboard.tsx
import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';
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

export default function Dashboard() {
    const {user} = useAuth();

    const [totalStudents, setTotalStudents] = useState<number>(0);
    const [totalCandidates, setTotalCandidates] = useState<number>(0);
    const [totalPositions, setTotalPositions] = useState<number>(0);
    const [totalElections, setTotalElections] = useState<number>(0);
    const [activeElection, setActiveElection] = useState<Election | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setLoading(true);
                setError(null);

                // First, get elections and students
                const [electionsRes, studentsRes] = await Promise.all([
                    api.get<ListResponse<Election> | Election[]>('api/elections/'),
                    api.get<ListResponse<unknown> | unknown[]>('api/students/'),
                ]);

                const extractCount = <T,>(data: ListResponse<T> | T[]): number => {
                    if (Array.isArray(data)) return data.length;
                    if (typeof data.count === 'number') return data.count;
                    if (Array.isArray(data.results)) return data.results.length;
                    return 0;
                };

                const electionsData = electionsRes.data;
                const studentsData = studentsRes.data;

                setTotalElections(extractCount<Election>(electionsData));
                setTotalStudents(extractCount(studentsData));

                // Find active election
                let active: Election | null = null;
                if (Array.isArray(electionsData)) {
                    active = electionsData.find(e => (e as Election).is_active) as Election | undefined ?? null;
                } else if (Array.isArray((electionsData as ListResponse<Election>).results)) {
                    active = (electionsData as ListResponse<Election>).results!.find(e => e.is_active) ?? null;
                }

                setActiveElection(active);

                // If there's an active election, fetch its positions and candidates
                if (active) {
                    const positionsRes = await
                        api.get<ListResponse<unknown> | unknown[]>('api/positions/', {
                        params: { election_id: active.id }
                    });

                    const positionsData = positionsRes.data;

                    setTotalPositions(extractCount(positionsData));

                    // Get position IDs for the active election
                    let positionIds: number[] = [];
                    if (Array.isArray(positionsData)) {
                        positionIds = positionsData.map((p: any) => p.id);
                    } else if (Array.isArray(positionsData.results)) {
                        positionIds = positionsData.results.map((p: any) => p.id);
                    }

                    const candidateCountResponses = await Promise.all(
                        positionIds.map((positionId) =>
                            api.get<ListResponse<unknown> | unknown[]>('api/candidates/', {
                                params: { position_id: positionId }
                            })
                        )
                    );

                    console.log("Candidate res", candidateCountResponses)

                    const activeCandidatesCount = candidateCountResponses.reduce((sum, res) => {
                        return sum + extractCount(res.data as any);
                    }, 0);

                    setTotalCandidates(activeCandidatesCount);
                } else {
                    // No active election
                    setTotalPositions(0);
                    setTotalCandidates(0);
                }
            } catch (err) {
                console.error('Failed to load dashboard stats', err);
                setError('Failed to load dashboard statistics.');
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    const todayLabel = new Date().toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });

    const formatDateTime = (value: string | undefined) => {
        if (!value) return '';
        return new Date(value).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Quick links based on role (same idea as before)
    const navItems = [
        {
            to: '/admin/students',
            label: 'Students',
            description: 'Manage student records and perform bulk uploads from Excel.',
            roles: ['superuser', 'staff'],
        },
        {
            to: '/admin/elections',
            label: 'Elections & Positions',
            description: 'Configure elections, positions, and link candidates.',
            roles: ['superuser'],
        },
        {
            to: '/admin/activations',
            label: 'Voter Activation',
            description: 'Activators can enable students to vote before the election.',
            roles: ['activator', 'superuser'],
        },
    ];

    const visibleItems = navItems.filter(item => item.roles.includes(user?.role ?? ''));

    return (
        <div className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-800">Admin Dashboard</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Signed in as <span className="font-medium">{user?.username}</span> ({user?.role})
                    </p>
                </div>
                <div className="text-sm text-gray-500">
                    <span className="font-medium">Date:</span> {todayLabel}
                </div>
            </header>

            {/* High-level stats */}
            <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                <div className="border rounded-lg p-4 bg-white shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Election</p>
                    <p className="text-lg font-semibold text-gray-800">
                        {activeElection ? activeElection.name : 'No active election'}
                    </p>
                    {activeElection && (
                        <p className="text-xs text-gray-500 mt-1">
                            {formatDateTime(activeElection.start_time)} – {formatDateTime(activeElection.end_time)}
                        </p>
                    )}
                </div>

                <div className="border rounded-lg p-4 bg-white shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Total Students</p>
                    <p className="text-2xl font-bold text-kosa-primary">{totalStudents}</p>
                </div>

                <div className="border rounded-lg p-4 bg-white shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                        {activeElection ? 'Total Candidates in Active Election' : 'Total Candidates'}
                    </p>
                    <p className="text-2xl font-bold text-kosa-primary">{totalCandidates}</p>
                    {activeElection && (
                        <p className="text-xs text-gray-500 mt-1">For active election</p>
                    )}
                </div>

                <div className="border rounded-lg p-4 bg-white shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                        {activeElection ? 'Total Positions in Active Election' : 'Total Positions'}
                    </p>
                    <p className="text-2xl font-bold text-kosa-primary">{totalPositions}</p>
                    {activeElection && (
                        <p className="text-xs text-gray-500 mt-1">For active election</p>
                    )}
                </div>
            </section>

            {/* Secondary stats row */}
            <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                <div className="border rounded-lg p-4 bg-white shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Total Elections</p>
                    <p className="text-2xl font-bold text-kosa-primary">{totalElections}</p>
                </div>

                {loading && (
                    <div className="border rounded-lg p-4 bg-white shadow-sm">
                        <p className="text-sm text-gray-500">Loading statistics…</p>
                    </div>
                )}

                {error && (
                    <div className="border rounded-lg p-4 bg-red-50 border-red-200 shadow-sm">
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                )}
            </section>

            {/* Quick navigation cards */}
            <section className="grid gap-4 grid-cols-1 md:grid-cols-3">
                {visibleItems.map(item => (
                    <Link
                        key={item.to}
                        to={item.to}
                        className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition flex flex-col justify-between shadow-sm"
                    >
                        <div>
                            <h2 className="font-medium text-gray-800">{item.label}</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                {item.description}
                            </p>
                        </div>
                    </Link>
                ))}
                {visibleItems.length === 0 && (
                    <p className="text-sm text-gray-500 col-span-3">
                        No additional modules available for your role.
                    </p>
                )}
            </section>
        </div>
    );
}