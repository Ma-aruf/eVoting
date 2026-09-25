import type {ReactNode} from 'react';
import {FiShield} from 'react-icons/fi';

type AuthLayoutProps = {
    title: string;
    children: ReactNode;
    securityMessage?: string;
    eyebrow?: string;
};

export default function AuthLayout({title, children, securityMessage}: AuthLayoutProps) {
    return <main className="auth-layout">
        <section className="auth-presentation" aria-label="eVoting information">
            <img className="absolute top-1 left-1 w-50" src="/logo.png" alt="logo"/>
            <div className="auth-brand-lockup"></div>
        </section>
        <section className="auth-content" aria-labelledby="auth-page-title">
            <div className="auth-card">
                <div className="auth-card-heading">
                    <h1 id="auth-page-title">{title}</h1>
                </div>
                {children}
                {securityMessage &&
                    <p className="auth-security-message"><FiShield aria-hidden="true"/><span>{securityMessage}</span>
                    </p>}
            </div>
        </section>
    </main>;
}
