import type {ReactNode} from 'react';
import {FiCheckCircle, FiShield} from 'react-icons/fi';

type AuthLayoutProps = {
    title: string;
    description: string;
    children: ReactNode;
    securityMessage?: string;
    eyebrow?: string;
};

export default function AuthLayout({title, description, children, securityMessage, eyebrow = 'eVoting'}: AuthLayoutProps) {
    return <main className="auth-layout">
        <section className="auth-presentation" aria-label="eVoting information">
            <div className="auth-brand-lockup"><span className="auth-brand-mark">eVoting</span><span className="auth-brand-subtitle">Secure election access</span></div>
            <div className="auth-presentation-copy">
                <FiShield className="auth-presentation-icon" aria-hidden="true"/>
                <p className="auth-eyebrow">Secure and simple</p>
                <h2>Every eligible voice matters.</h2>
                <p>Access the election tools you are authorized to use, with clear steps and dependable protection.</p>
                <div className="auth-trust-note"><FiCheckCircle aria-hidden="true"/><span>Designed for secure, anonymous voting.</span></div>
            </div>
        </section>
        <section className="auth-content" aria-labelledby="auth-page-title">
            <div className="auth-card">
                <div className="auth-card-heading">
                    <span className="auth-mobile-eyebrow">{eyebrow}</span>
                    <h1 id="auth-page-title">{title}</h1>
                    <p>{description}</p>
                </div>
                {children}
                {securityMessage && <p className="auth-security-message"><FiShield aria-hidden="true"/><span>{securityMessage}</span></p>}
            </div>
        </section>
    </main>;
}
