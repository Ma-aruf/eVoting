// src/components/admin/AdminLayout.tsx
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { to: '/admin/dashboard', label: 'Dashboard', roles: ['superadmin', 'staff', 'activator'] },
    { to: '/admin/students', label: 'Students', roles: ['superadmin', 'staff'] },
    { to: '/admin/elections', label: 'Elections', roles: ['superadmin'] },
    { to: '/admin/positions', label: 'Positions', roles: ['superadmin'] },
    { to: '/admin/candidates', label: 'Candidates', roles: ['superadmin', 'staff'] },
    { to: '/admin/activations', label: 'Activate Voters', roles: ['activator', 'superadmin'] },
  ];

  const visibleNav = navItems.filter(item => item.roles.includes(user?.role ?? ''));

  return (
    <div className="min-h-screen bg-kosa-neutral-50">
      {/* Header */}
      <header className="bg-kosa-primary text-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold">KOSASA Admin</div>
            <span className="text-sm opacity-80">({user?.role.toUpperCase()})</span>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-md transition"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-kosa-neutral-100 min-h-[calc(100vh-4rem)]">
          <nav className="py-6">
            {visibleNav.map(item => (
              <Link
                key={item.to}
                to={item.to}
                className={`block px-6 py-3 text-gray-700 hover:bg-kosa-primary/10 ${
                  location.pathname === item.to ? 'bg-kosa-primary/5 border-l-4 border-kosa-primary font-medium' : ''
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}