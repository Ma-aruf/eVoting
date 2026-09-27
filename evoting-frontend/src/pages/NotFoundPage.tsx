import {useEffect} from 'react';
import {FiArrowLeft, FiArrowRight} from 'react-icons/fi';
import {useLocation, useNavigate, useNavigationType} from 'react-router-dom';

import {getVoterSession} from '../api/voterApi';
import Button from '../components/ui/Button';
import {useAuth} from '../hooks/useAuth';
import type {UserRole} from '../contexts/AuthContext';

function getSafeDestination(role: UserRole) {
    if (role === 'activator') return '/admin/activations';
    if (role === 'superuser' || role === 'staff') return '/admin/dashboard';
    return getVoterSession() ? '/vote' : '/admin/login';
}

export default function NotFoundPage() {
    const {user} = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const navigationType = useNavigationType();
    const safeDestination = getSafeDestination(user?.role ?? null);

    useEffect(() => {
        document.title = 'Page Not Found | eVoting';
    }, []);

    const handleBack = () => {
        if (navigationType !== 'POP' && window.history.length > 1) {
            navigate(-1);
            return;
        }
        navigate(safeDestination, {replace: true});
    };

    return (
        <main className="not-found-page" aria-labelledby="not-found-title">
            <div className="not-found-content">
                <img className="not-found-logo" src="/logo.png" alt="eVoting" />
                <p className="not-found-code" aria-hidden="true">404</p>
                <h1 id="not-found-title">Page not found</h1>
                <p className="not-found-message">
                    The page you are looking for does not exist or may have been moved.
                </p>
                <div className="not-found-actions">
                    <Button
                        type="button"
                        leadingIcon={<FiArrowRight aria-hidden="true" />}
                        onClick={() => navigate(safeDestination, {replace: true})}
                    >
                        Continue to eVoting
                    </Button>
                    <button type="button" className="not-found-back" onClick={handleBack}>
                        <FiArrowLeft aria-hidden="true" />
                        Go back
                    </button>
                </div>
                <span className="sr-only">Requested path: {location.pathname}</span>
            </div>
        </main>
    );
}
