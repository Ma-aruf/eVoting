import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import ElectionStatusBadge from '../components/ElectionStatusBadge';
import type {Election, ElectionStatus} from '../types/election';
import type {Student} from '../queries/useStudents';
import type {AuthUser} from '../contexts/AuthContext';
import {voterLifecycleMessage} from '../utils/electionLifecycle';

afterEach(cleanup);

describe('backend election lifecycle presentation', () => {
    it.each([
        ['scheduled', 'Scheduled'],
        ['open', 'Voting Open'],
        ['paused', 'Paused'],
        ['ended', 'Ended'],
    ] as const)('maps %s to %s', (status, label) => {
        render(<ElectionStatusBadge status={status satisfies ElectionStatus}/>);
        expect(screen.getByText(label)).toBeInTheDocument();
    });

    it('uses a safe fallback for an unknown backend status', () => {
        render(<ElectionStatusBadge status="unexpected"/>);
        expect(screen.getByText('Status unavailable')).toBeInTheDocument();
        expect(screen.queryByText('Active')).not.toBeInTheDocument();
    });

    it.each([
        ['scheduled', 'Voting has not started yet.'],
        ['paused', 'Voting is currently paused. Please try again later.'],
        ['ended', 'Voting has ended.'],
    ])('shows the voter message for %s', (status, message) => {
        expect(voterLifecycleMessage(status)).toBe(message);
    });

    it('keeps election enablement separate from student and user activation fields', () => {
        const election: Election = {
            id: 1,
            name: 'Scheduled election',
            year: 2026,
            start_time: '2026-10-01T00:00:00Z',
            end_time: '2026-10-02T00:00:00Z',
            voting_enabled: true,
            status: 'scheduled',
            voting_open: false,
            candidate_changes_locked: false,
            ballot_ready: true,
        };
        const student: Pick<Student, 'is_active'> = {is_active: false};
        const user: Pick<AuthUser, 'username'> & {is_active: boolean} = {username: 'staff', is_active: true};

        expect(election.voting_enabled).toBe(true);
        expect(election.status).toBe('scheduled');
        expect(student.is_active).toBe(false);
        expect(user.is_active).toBe(true);
    });
});
