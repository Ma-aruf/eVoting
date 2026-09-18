import {useCallback, useEffect, useRef, useState} from 'react';
import {NavLink, Outlet, useLocation} from 'react-router-dom';
import {
    FiBarChart2,
    FiCalendar,
    FiCheckCircle,
    FiGrid,
    FiList,
    FiLogOut,
    FiMenu,
    FiPlayCircle,
    FiUser,
    FiUsers,
    FiX
} from 'react-icons/fi';
import type {IconType} from 'react-icons';
import {useAuth} from '../hooks/useAuth';
import PageContainer from './PageContainer';

type NavigationItem = { to: string; label: string; icon: IconType; roles: string[] };

const navItems: NavigationItem[] = [
    {to: '/admin/dashboard', label: 'Dashboard', icon: FiGrid, roles: ['superuser', 'staff']},
    {to: '/admin/students', label: 'Voters', icon: FiUsers, roles: ['superuser', 'staff']},
    {to: '/admin/elections', label: 'Elections', icon: FiCalendar, roles: ['superuser']},
    {to: '/admin/manage-elections', label: 'Manage Elections', icon: FiPlayCircle, roles: ['superuser']},
    {to: '/admin/positions', label: 'Positions', icon: FiList, roles: ['superuser']},
    {to: '/admin/candidates', label: 'Candidates', icon: FiUser, roles: ['superuser', 'staff']},
    {to: '/admin/activations', label: 'Activate Voters', icon: FiCheckCircle, roles: ['activator', 'superuser']},
    {to: '/admin/results', label: 'Election Results', icon: FiBarChart2, roles: ['superuser', 'staff']},
    {to: '/admin/users', label: 'Manage Users', icon: FiUsers, roles: ['superuser']},
];

function Navigation({items, onNavigate}: { items: NavigationItem[]; onNavigate?: () => void }) {
    return <nav className="admin-navigation" aria-label="Admin navigation">
        <ul>{items.map(({to, label, icon: Icon}) => (
            <li key={to}><NavLink to={to} end onClick={onNavigate}
                                  className={({isActive}) => 'admin-nav-link' + (isActive ? ' admin-nav-link--active' : '')}>
                <Icon className="admin-nav-icon" aria-hidden="true"/><span>{label}</span>
            </NavLink></li>
        ))}</ul>
    </nav>;
}

function LogoutButton({onLogout}: { onLogout: () => void }) {
    return <button type="button" className="admin-logout" onClick={onLogout}><FiLogOut className="admin-nav-icon"
                                                                                       aria-hidden="true"/><span>Logout</span>
    </button>;
}

function Drawer({open, items, onClose, onLogout}: {
    open: boolean;
    items: NavigationItem[];
    onClose: () => void;
    onLogout: () => void
}) {
    const drawerRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (!open) return;
        const drawer = drawerRef.current;
        if (!drawer) return;
        drawer.querySelector<HTMLElement>('button, a[href]')?.focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const elements = Array.from(drawer.querySelectorAll<HTMLElement>('button, a[href]'));
            if (!elements.length) return;
            const first = elements[0], last = elements[elements.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
            if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose, open]);

    if (!open) return null;
    return <div className="admin-drawer-layer" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
    }}>
        <aside ref={drawerRef} id="admin-mobile-drawer" className="admin-drawer" role="dialog" aria-modal="true"
               aria-label="Admin navigation">
            <div className="admin-drawer-header">
                <div className="admin-brand"><span className="admin-brand-mark">eVoting</span><span
                    className="admin-brand-subtitle">Admin Panel</span></div>
                <button type="button" className="admin-icon-button" onClick={onClose}
                        aria-label="Close navigation menu"><FiX aria-hidden="true"/></button>
            </div>
            <Navigation items={items} onNavigate={onClose}/>
            <div className="admin-sidebar-footer"><LogoutButton onLogout={onLogout}/></div>
        </aside>
    </div>;
}

export default function AdminLayout() {
    const {user, logout} = useAuth();
    const location = useLocation();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const wasOpenRef = useRef(false);
    const visibleNav = navItems.filter(item => item.roles.includes(user?.role ?? ''));
    const closeDrawer = useCallback(() => setDrawerOpen(false), []);

    useEffect(() => {
        if (wasOpenRef.current && !drawerOpen) requestAnimationFrame(() => menuButtonRef.current?.focus());
        wasOpenRef.current = drawerOpen;
    }, [drawerOpen]);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setDrawerOpen(false));
        return () => cancelAnimationFrame(frame);
    }, [location.pathname]);
    useEffect(() => {
        if (!drawerOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [drawerOpen]);

    const handleLogout = () => {
        setDrawerOpen(false);
        logout();
    };
    return <div className="admin-shell">
        <aside className="admin-sidebar" aria-label="Admin navigation">
            <div className="admin-sidebar-brand"><span className="admin-brand-mark">eVoting</span>
            </div>
            <Navigation items={visibleNav}/>
            <div className="admin-sidebar-footer"><LogoutButton onLogout={handleLogout}/></div>
        </aside>
        <Drawer open={drawerOpen} items={visibleNav} onClose={closeDrawer} onLogout={handleLogout}/>
        <div className="admin-shell-content">
            <header className="admin-topbar">
                <div className="admin-topbar-leading">
                    <button ref={menuButtonRef} type="button" className="admin-menu-button"
                            onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen}
                            aria-controls="admin-mobile-drawer" aria-label="Open navigation menu"><FiMenu
                        aria-hidden="true"/></button>
                    <span className="admin-topbar-title">Administration</span></div>
                <div className="admin-account">
                    <div className="admin-account-copy"><span
                        className="admin-account-name">{user?.username ?? 'Administrator'}</span><span
                        className="admin-account-role">{user?.role ?? 'Account'}</span></div>
                    <span className="admin-avatar"
                          aria-hidden="true">{(user?.username?.charAt(0) ?? 'A').toUpperCase()}</span></div>
            </header>
            <main className="admin-main" id="main-content"><PageContainer><Outlet/></PageContainer></main>
        </div>
    </div>;
}
