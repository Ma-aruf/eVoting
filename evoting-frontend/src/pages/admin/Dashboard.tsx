// pages/admin/Dashboard.tsx
import {Link} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';

export default function Dashboard() {
    const {user} = useAuth();


    // Reuse the same nav logic as sidebar (filter out dashboard itself)
    const navItems = [
        {
            to: '/admin/students',
            label: 'Students',
            description: 'Manage student records and perform bulk uploads from Excel.',
            roles: ['superuser', 'staff']
        },
        {
            to: '/admin/elections',
            label: 'Elections & Positions',
            description: 'Configure elections, positions, and link candidates.',
            roles: ['superuser']
        },
        {
            to: '/admin/activations',
            label: 'Voter Activation',
            description: 'Activators can enable students to vote before the election.',
            roles: ['activator', 'superuser']
        },
        // Add more if needed (e.g., Candidates, Positions as separate cards)
    ];

    const visibleItems = navItems.filter(item => item.roles.includes(user?.role ?? ''));

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold text-gray-800">Admin Dashboard</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Signed in as <span className="font-medium">{user?.username}</span> ({user?.role})
                </p>
            </header>


            <section className="grid gap-4 grid-cols-1 md:grid-cols-3">
                {visibleItems.map(item => (
                    <Link
                        key={item.to}
                        to={item.to}
                        className="border rounded-lg p-4 hover:bg-gray-50 transition flex flex-col justify-between"
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