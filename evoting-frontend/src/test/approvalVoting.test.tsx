import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import VotingPage from '../pages/VotingPage';
import {saveVoterSession, voterApi} from '../api/voterApi';
import {useVotingData} from '../hooks/useVotingData';

vi.mock('../hooks/useVotingData', () => ({
    useVotingData: vi.fn(),
}));

const mockedUseVotingData = vi.mocked(useVotingData);

afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.restoreAllMocks();
});

describe('single-candidate approval ballot cards', () => {
    it('selects the whole Yes card and submits the approval choice', async () => {
        const user = userEvent.setup();
        const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
        const candidate = {
            id: 44,
            student: 11,
            student_name: 'Candidate One',
            position: 101,
            ballot_number: 1,
        };
        const election = {
            id: 1,
            name: 'Assigned Election',
            year: 2026,
            voting_enabled: true,
            status: 'open' as const,
            voting_open: true,
        };

        saveVoterSession({
            token: 'test-token',
            can_vote_now: true,
            student: {id: 11, student_id: 'V1', full_name: 'Assigned Voter', class_name: 'Form 1'},
            election,
        });
        mockedUseVotingData.mockReturnValue({
            data: {
                election,
                can_vote_now: true,
                positions: [{id: 101, name: 'President', election: 1, display_order: 1, voting_mode: 'yes_no'}],
                candidatesByPosition: {101: [candidate]},
            },
            isLoading: false,
            error: null,
        } as unknown as ReturnType<typeof useVotingData>);
        const submitVotes = vi.spyOn(voterApi, 'submitVotes').mockResolvedValue({
            data: {detail: 'Ballot submitted.', can_vote_now: false},
        } as Awaited<ReturnType<typeof voterApi.submitVotes>>);

        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={['/vote']}>
                    <Routes>
                        <Route path="/vote" element={<VotingPage />} />
                    </Routes>
                </MemoryRouter>
            </QueryClientProvider>,
        );

        const approvalCard = await screen.findByRole('group', {name: 'Approval choice for Candidate One'});
        expect(approvalCard).toHaveClass('hover:bg-cyan-100');
        await user.click(within(approvalCard).getByRole('radio', {name: 'Yes, Candidate One'}));

        await user.click(await screen.findByRole('button', {name: /Submit Now/}));
        await waitFor(() => expect(submitVotes).toHaveBeenCalledWith(
            expect.objectContaining({
                token: 'test-token',
            }),
            [{election: 1, position: 101, candidate: 44, choice: 'yes'}],
        ));
    });

    it('allows a voter to skip a position and submits the explicit skip choice', async () => {
        const user = userEvent.setup();
        const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
        const candidate = {
            id: 44,
            student: 11,
            student_name: 'Candidate One',
            position: 101,
            ballot_number: 1,
        };
        const election = {
            id: 1,
            name: 'Assigned Election',
            year: 2026,
            voting_enabled: true,
            status: 'open' as const,
            voting_open: true,
        };

        saveVoterSession({
            token: 'test-token',
            can_vote_now: true,
            student: {id: 11, student_id: 'V1', full_name: 'Assigned Voter', class_name: 'Form 1'},
            election,
        });
        mockedUseVotingData.mockReturnValue({
            data: {
                election,
                can_vote_now: true,
                positions: [{id: 101, name: 'President', election: 1, display_order: 1, voting_mode: 'yes_no'}],
                candidatesByPosition: {101: [candidate]},
            },
            isLoading: false,
            error: null,
        } as unknown as ReturnType<typeof useVotingData>);
        const submitVotes = vi.spyOn(voterApi, 'submitVotes').mockResolvedValue({
            data: {detail: 'Ballot submitted.', can_vote_now: false},
        } as Awaited<ReturnType<typeof voterApi.submitVotes>>);

        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={['/vote']}>
                    <Routes>
                        <Route path="/vote" element={<VotingPage/>}/>
                    </Routes>
                </MemoryRouter>
            </QueryClientProvider>,
        );

        await user.click(await screen.findByRole('button', {name: 'Skip this position'}));
        expect(await screen.findByText('Skipped')).toBeInTheDocument();
        await user.click(await screen.findByRole('button', {name: /Submit Now/}));

        await waitFor(() => expect(submitVotes).toHaveBeenCalledWith(
            expect.objectContaining({
                token: 'test-token',
            }),
            [{election: 1, position: 101, candidate: null, choice: 'skip'}],
        ));
    });
});
