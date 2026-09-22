import {type ReactNode} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import type {AuthUser, UserRole} from '../contexts/AuthContext';
import App from '../App';
import api from '../apiConfig';
import {getVoterSession, saveVoterSession} from '../api/voterApi';
import type {Election} from '../types/election';

let currentUser: AuthUser;
let client: QueryClient;

// Use the real routes, navigation, pages, queries and mutations. Only the
// authenticated profile and HTTP boundary are substituted.
vi.mock('../contexts/AuthContext', async importOriginal => {
    const actual = await importOriginal<typeof import('../contexts/AuthContext')>();
    return {...actual, AuthProvider: ({children}: {children: ReactNode}) => (
        <QueryClientProvider client={client}>
            <actual.AuthContext.Provider value={{user: currentUser, isAuthenticated: true, login: vi.fn(), logout: vi.fn()}}>
                {children}
            </actual.AuthContext.Provider>
        </QueryClientProvider>
    )};
});

const elections: Election[] = [
    {id: 1, name: 'Assigned Election', year: 2026, start_time: '2099-01-01T00:00:00Z', end_time: '2099-01-02T00:00:00Z', voting_enabled: true, status: 'scheduled', voting_open: false, candidate_changes_locked: false, ballot_ready: true},
    {id: 2, name: 'Other Election', year: 2026, start_time: '2020-01-01T00:00:00Z', end_time: '2020-01-02T00:00:00Z', voting_enabled: true, status: 'ended', voting_open: false, candidate_changes_locked: true, ballot_ready: true},
];
const voters = [
    {id: 11, student_id: 'V1', full_name: 'Assigned Voter', class_name: 'Form 1', election: 1, is_active: false, has_voted: false},
    {id: 22, student_id: 'V2', full_name: 'Other Voter', class_name: 'Form 2', election: 2, is_active: false, has_voted: false},
];
let voterRecords: typeof voters = voters;
const positions = [
    {id: 101, name: 'Assigned President', election: 1, display_order: 1, voting_mode: 'candidate' as const},
    {id: 202, name: 'Other President', election: 2, display_order: 1, voting_mode: 'candidate' as const},
];
let electionData = elections;

function openPage(path: string, role: UserRole = 'staff') {
    currentUser = {username: `${role}-account`, role, assignedElection: role === 'superuser' ? null : elections[0]};
    window.history.replaceState({}, '', path);
    return render(<App />);
}

beforeEach(() => {
    sessionStorage.clear();
    client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: 0}, mutations: {retry: false}}});
    electionData = elections.map(election => ({...election}));
    voterRecords = voters.map(voter => ({...voter}));
    vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
        const parsed = new URL(url, 'http://localhost');
        const electionId = Number(config?.params?.election_id ?? parsed.searchParams.get('election_id'));
        if (parsed.pathname === '/api/elections/') return {data: electionData};
        if (parsed.pathname === '/api/students/') return {data: voterRecords.filter(voter => voter.election === electionId)};
        if (parsed.pathname === '/api/positions/') return {data: positions.filter(position => position.election === electionId)};
        if (parsed.pathname === '/api/candidates/') return {data: []};
        const result = parsed.pathname.match(/^\/api\/elections\/(\d+)\/results\/$/);
        if (result) return {data: {
            election_id: Number(result[1]), election_name: elections[Number(result[1]) - 1].name,
            year: 2026, total_students: 1, students_who_voted: 0, voter_turnout_percentage: 0,
            voting_enabled: true, status: 'scheduled', voting_open: false, candidate_changes_locked: false, positions: [],
        }};
        throw new Error(`Unexpected GET ${url}`);
    });
    vi.spyOn(api, 'post').mockResolvedValue({data: {}});
    vi.spyOn(api, 'patch').mockImplementation(async (_url, payload) => {
        if (_url.endsWith('/schedule/')) {
            const electionId = Number(_url.match(/elections\/(\d+)\/schedule\/$/)?.[1]);
            const data = payload as {start_time: string; end_time: string};
            electionData = electionData.map(election => election.id === electionId
                ? {...election, ...data}
                : election);
            const election = electionData.find(item => item.id === electionId)!;
            return {data: {...election, detail: 'Election schedule updated.'}};
        }
        const data = payload as {election_id: number; voting_enabled: boolean};
        electionData = electionData.map(election => election.id === data.election_id ? {...election, voting_enabled: data.voting_enabled} : election);
        const election = electionData.find(item => item.id === data.election_id)!;
        return {data: {...election, detail: data.voting_enabled ? 'Voting enabled.' : 'Voting paused.'}};
    });
});

afterEach(() => {
    cleanup();
    sessionStorage.clear();
    client.clear();
    vi.restoreAllMocks();
});

describe('staff election workflows', () => {
    it('hides scheduled assigned elections from the dashboard overview', async () => {
        electionData[0].status = 'scheduled';
        openPage('/admin/dashboard');
        expect(await screen.findByText('No open or paused elections')).toBeInTheDocument();
        expect(screen.queryByText('Active', {exact: true})).not.toBeInTheDocument();
        expect(screen.queryByText('Other Election')).not.toBeInTheDocument();
        expect(screen.queryByText('Assigned Election')).not.toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'Positions'})).toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'Manage Elections'})).toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'Activate Voters'})).toBeInTheDocument();
        expect(screen.queryByRole('link', {name: 'Manage Users'})).not.toBeInTheDocument();
        expect(screen.queryByRole('link', {name: /^Elections$/})).not.toBeInTheDocument();
    });

    it('shows only open and paused elections in the dashboard overview', async () => {
        electionData = [
            {...elections[0], status: 'open', voting_open: true},
            {...elections[1], status: 'paused', voting_enabled: false},
            {...elections[0], id: 3, name: 'Scheduled Election', status: 'scheduled', voting_open: false},
            {...elections[1], id: 4, name: 'Ended Election', status: 'ended', voting_enabled: true},
        ];
        openPage('/admin/dashboard', 'superuser');
        expect(await screen.findByRole('heading', {name: 'Assigned Election'})).toBeInTheDocument();
        expect(screen.getByRole('heading', {name: 'Other Election'})).toBeInTheDocument();
        expect(screen.getByText('Voting Open')).toBeInTheDocument();
        expect(screen.getByText('Paused')).toBeInTheDocument();
        expect(screen.queryByText('Scheduled Election')).not.toBeInTheDocument();
        expect(screen.queryByText('Ended Election')).not.toBeInTheDocument();
    });

    it('shows one plain lifecycle status per election without a voting-control column', async () => {
        electionData = [
            {...elections[0], status: 'open', voting_open: true},
            {...elections[1], status: 'ended', voting_enabled: true},
            {...elections[0], id: 3, name: 'Paused Election', status: 'paused', voting_enabled: false},
            {...elections[0], id: 4, name: 'Scheduled Election', status: 'scheduled', voting_enabled: false},
        ];
        openPage('/admin/elections', 'superuser');

        for (const [name, label] of [
            ['Assigned Election', 'Voting Open'],
            ['Other Election', 'Ended'],
            ['Paused Election', 'Paused'],
            ['Scheduled Election', 'Scheduled'],
        ]) {
            const row = (await screen.findByText(name)).closest('tr');
            expect(row).not.toBeNull();
            expect(within(row!).getByText(label)).toBeInTheDocument();
            expect(row!.querySelector('.ui-badge')).toBeNull();
            expect(within(row!).queryByText(/Voting enabled|Voting paused/)).not.toBeInTheDocument();
        }

        expect(screen.queryByRole('columnheader', {name: 'Voting control'})).not.toBeInTheDocument();
        expect(screen.getByRole('columnheader', {name: 'Actions'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Edit schedule for Scheduled Election'})).toBeInTheDocument();
    });

    it('creates voters in the assigned election without an election selector', async () => {
        const user = userEvent.setup();
        openPage('/admin/students');
        await screen.findByRole('heading', {name: 'Voters for Assigned Election'});
        expect(screen.queryByRole('combobox', {name: 'Election'})).not.toBeInTheDocument();
        expect(screen.queryByText('Other Voter')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', {name: 'Add voter'}));
        const form = within(screen.getByRole('dialog'));
        await user.type(form.getByLabelText(/Voter ID/), 'NEW1');
        await user.type(form.getByLabelText(/Full name/), 'New Voter');
        await user.selectOptions(form.getByRole('combobox', {name: 'Class'}), 'Form 1');
        await user.click(form.getByRole('button', {name: 'Save voter'}));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/students/', {
            student_id: 'NEW1', full_name: 'New Voter', class_name: 'Form 1', election_id: 1,
        }));
    });

    it('creates positions in the assigned election', async () => {
        const user = userEvent.setup();
        openPage('/admin/positions');
        await screen.findByRole('heading', {name: 'Positions for Assigned Election'});
        expect(screen.queryByRole('combobox', {name: 'Election'})).not.toBeInTheDocument();
        expect(screen.queryByText('Other President')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', {name: 'Add position'}));
        const form = within(screen.getByRole('dialog'));
        await user.type(form.getByLabelText(/Position name/), 'Secretary');
        await user.type(form.getByLabelText(/Display order/), '2');
        await user.click(form.getByRole('button', {name: 'Add position'}));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/positions/', {
            name: 'Secretary', display_order: 2, election: 1,
        }));
    });

    it('creates candidates using only assigned positions and voters', async () => {
        const user = userEvent.setup();
        openPage('/admin/candidates');
        await waitFor(() => expect(screen.getByRole('button', {name: 'Add candidate'})).toBeEnabled());
        expect(screen.queryByRole('combobox', {name: 'Election'})).not.toBeInTheDocument();
        expect(screen.queryByRole('option', {name: 'Other President'})).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', {name: 'Add candidate'}));
        const form = within(screen.getByRole('dialog'));
        expect(form.getByLabelText('Election')).toHaveValue('Assigned Election');
        await user.click(form.getByRole('combobox', {name: /Voter/}));
        expect(form.queryByRole('option', {name: /Other Voter/})).not.toBeInTheDocument();
        await user.click(form.getByRole('option', {name: /Assigned Voter/}));
        await user.click(form.getByRole('button', {name: 'Add candidate'}));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/candidates/create/', expect.objectContaining({
            student: 11, position: 101, election_id: 1,
        })));
    });

    it('rejects mismatched voter data before posting a candidate', async () => {
        const original = vi.mocked(api.get).getMockImplementation()!;
        vi.mocked(api.get).mockImplementation(async (url, config) => url === 'api/students/'
            ? {data: [voters[1]]} : original(url, config));
        const user = userEvent.setup();
        openPage('/admin/candidates');
        await waitFor(() => expect(screen.getByRole('button', {name: 'Add candidate'})).toBeEnabled());
        await user.click(screen.getByRole('button', {name: 'Add candidate'}));
        const form = within(screen.getByRole('dialog'));
        await user.click(form.getByRole('combobox', {name: /Voter/}));
        await user.click(form.getByRole('option', {name: /Other Voter/}));
        await user.click(form.getByRole('button', {name: 'Add candidate'}));
        expect(await screen.findByText('Select a voter and position from the selected election.')).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('pauses and enables voting only for the assigned election', async () => {
        const user = userEvent.setup();
        openPage('/admin/manage-elections');
        await screen.findByText('Assigned Election');
        expect(screen.queryByText('Other Election')).not.toBeInTheDocument();
        for (const [action, votingEnabled] of [['Pause voting', false], ['Enable voting', true]] as const) {
            await user.click(await screen.findByRole('button', {name: new RegExp(action)}));
            await user.click(within(screen.getByRole('dialog')).getByRole('button', {name: action}));
            await waitFor(() => expect(api.patch).toHaveBeenCalledWith('api/elections/manage/', {election_id: 1, voting_enabled: votingEnabled}));
            expect(screen.getByText('Scheduled')).toBeInTheDocument();
            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        }
    });

    it('shows no voting controls for ended elections when voting is disabled', async () => {
        electionData[1].voting_enabled = false;
        openPage('/admin/manage-elections', 'superuser');
        const endedElection = (await screen.findByText('Other Election')).closest('tr');
        expect(endedElection).not.toBeNull();
        expect(within(endedElection!).queryByRole('button', {name: 'Enable voting'})).not.toBeInTheDocument();
        expect(within(endedElection!).queryByRole('button', {name: 'Pause voting'})).not.toBeInTheDocument();
        expect(within(endedElection!).queryByText('Voting period has ended; enabling cannot reopen voting.')).not.toBeInTheDocument();
    });

    it('shows no voting controls for ended elections when voting remains enabled', async () => {
        openPage('/admin/manage-elections', 'superuser');
        const endedElection = (await screen.findByText('Other Election')).closest('tr');
        expect(endedElection).not.toBeNull();
        expect(within(endedElection!).getByText('Ended')).toBeInTheDocument();
        expect(endedElection!.querySelector('.ui-badge')).toBeNull();
        expect(within(endedElection!).queryByText('Voting enabled')).not.toBeInTheDocument();
        expect(within(endedElection!).queryByRole('button', {name: 'Enable voting'})).not.toBeInTheDocument();
        expect(within(endedElection!).queryByRole('button', {name: 'Pause voting'})).not.toBeInTheDocument();
    });

    it('offers close-time extension only while elections are open or paused', async () => {
        electionData = [
            {...elections[0], name: 'Open Election', status: 'open', voting_open: true},
            {...elections[1], name: 'Paused Election', status: 'paused', voting_enabled: false},
            {...elections[0], id: 3, name: 'Scheduled Election', status: 'scheduled'},
            {...elections[1], id: 4, name: 'Ended Election', status: 'ended'},
        ];
        openPage('/admin/manage-elections', 'superuser');

        expect(await screen.findByRole('button', {name: 'Extend closing time for Open Election'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Extend closing time for Paused Election'})).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Extend closing time for Scheduled Election'})).not.toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Extend closing time for Ended Election'})).not.toBeInTheDocument();
    });

    it('extends an open election using a timezone-aware time and audit reason', async () => {
        const user = userEvent.setup();
        electionData = [{...elections[0], status: 'open', voting_open: true}];
        vi.mocked(api.post).mockImplementation(async (url, data) => {
            if (url !== 'api/elections/1/extend/') return {data: {}};
            const payload = data as {end_time: string; reason: string};
            electionData = electionData.map(election => ({...election, end_time: payload.end_time}));
            return {data: {...electionData[0], detail: 'Election closing time extended.'}};
        });
        openPage('/admin/manage-elections');
        await user.click(await screen.findByRole('button', {name: 'Extend closing time for Assigned Election'}));
        const dialog = within(screen.getByRole('dialog'));
        const requestedLocalEnd = '2099-01-03T12:30';
        const reason = 'Voting opened later than scheduled.';
        fireEvent.change(dialog.getByLabelText(/New closing time/), {target: {value: requestedLocalEnd}});
        await user.type(dialog.getByLabelText(/Reason for extension/), reason);
        await user.click(dialog.getByRole('button', {name: 'Extend closing time'}));

        await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/elections/1/extend/', {
            end_time: new Date(requestedLocalEnd).toISOString(), reason,
        }));
        expect(await screen.findByText('Voting Open')).toBeInTheDocument();
        expect(api.patch).not.toHaveBeenCalled();
    }, 10_000);

    it('keeps a paused election paused after extending its closing time', async () => {
        const user = userEvent.setup();
        electionData = [{...elections[0], status: 'paused', voting_enabled: false, voting_open: false}];
        vi.mocked(api.post).mockImplementation(async (url, data) => {
            if (url !== 'api/elections/1/extend/') return {data: {}};
            const payload = data as {end_time: string; reason: string};
            electionData = electionData.map(election => ({...election, end_time: payload.end_time}));
            return {data: {...electionData[0], detail: 'Election closing time extended.'}};
        });
        openPage('/admin/manage-elections');
        await user.click(await screen.findByRole('button', {name: 'Extend closing time for Assigned Election'}));
        const dialog = within(screen.getByRole('dialog'));
        fireEvent.change(dialog.getByLabelText(/New closing time/), {target: {value: '2099-01-04T12:30'}});
        await user.type(dialog.getByLabelText(/Reason for extension/), 'Voting remains paused.');
        await user.click(dialog.getByRole('button', {name: 'Extend closing time'}));

        expect(await screen.findByText('Paused')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Enable voting'})).toBeEnabled();
        expect(api.patch).not.toHaveBeenCalled();
    }, 10_000);

    it('shows Paused as the single plain-text status on the manage page', async () => {
        electionData[0].voting_enabled = false;
        electionData[0].status = 'paused';
        openPage('/admin/manage-elections', 'superuser');
        const pausedElection = (await screen.findByText('Assigned Election')).closest('tr');
        expect(pausedElection).not.toBeNull();
        expect(within(pausedElection!).getByText('Paused')).toBeInTheDocument();
        expect(pausedElection!.querySelector('.ui-badge')).toBeNull();
        expect(within(pausedElection!).queryByText('Voting paused')).not.toBeInTheDocument();
    });

    it('shows statistics for the selected election and refreshes them when the election changes', async () => {
        const user = userEvent.setup();
        voterRecords = [
            ...voters,
            {id: 23, student_id: 'V3', full_name: 'Other Active Voter', class_name: 'Form 3', election: 2, is_active: true, has_voted: false},
            {id: 24, student_id: 'V4', full_name: 'Other Pending Voter', class_name: 'Form 4', election: 2, is_active: false, has_voted: false},
        ];
        openPage('/admin/activations', 'superuser');

        const readStatistic = (label: string) => {
            const card = screen.getByText(label, {exact: true}).closest('article');
            return card?.querySelector('.statistic-card-value')?.textContent;
        };
        const electionSelect = await screen.findByRole('combobox', {name: 'Election'});

        await waitFor(() => {
            expect(readStatistic('Total voters')).toBe('1');
            expect(readStatistic('Activated voters')).toBe('0');
            expect(readStatistic('Available to activate')).toBe('1');
        });

        await user.selectOptions(electionSelect, '2');

        await waitFor(() => {
            expect(readStatistic('Total voters')).toBe('3');
            expect(readStatistic('Activated voters')).toBe('1');
            expect(readStatistic('Available to activate')).toBe('2');
        });
    });

    it.each(['staff', 'activator'] as const)('%s activates only assigned voters', async role => {
        const user = userEvent.setup();
        electionData[0] = {...electionData[0], status: 'open', voting_open: true};
        openPage('/admin/activations', role);
        const input = await screen.findByRole('combobox');
        expect(screen.queryByRole('combobox', {name: 'Election'})).not.toBeInTheDocument();
        await user.type(input, 'Voter');
        await user.click(await screen.findByRole('option', {name: /Assigned Voter/}));
        expect(screen.queryByText('Other Voter')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', {name: /Activate voter/i}));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/students/activate/', {
            student_id: 'V1', election_id: 1, is_active: true,
        }));
    });

    it.each([
        ['scheduled', true, false, true],
        ['paused', false, false, true],
        ['ended', true, false, true],
        ['open', true, true, false],
    ] as const)('blocks activation for %s when the ballot is unavailable', async (status, votingEnabled, votingOpen, ballotReady) => {
        electionData[0] = {
            ...electionData[0],
            status,
            voting_enabled: votingEnabled,
            voting_open: votingOpen,
            ballot_ready: ballotReady,
        };
        openPage('/admin/activations', 'staff');
        await screen.findByText('Activate a voter');
        expect(screen.getByRole('combobox')).toBeDisabled();
        expect(screen.getByRole('button', {name: 'Activate voter'})).toBeDisabled();
        expect(screen.getByText(/Activation unavailable/)).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalledWith('api/students/activate/', expect.anything());
    });

    it.each(['/admin/results', '/admin/live-results?election=2'])('scopes results at %s to the assignment', async path => {
        openPage(path);
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('api/elections/1/results/'));
        expect(api.get).not.toHaveBeenCalledWith('api/elections/2/results/');
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(screen.queryByText('Other Election')).not.toBeInTheDocument();
    });
});

describe('activator and superuser restrictions', () => {
    it.each(['/admin/positions', '/admin/manage-elections', '/admin/results', '/admin/students', '/admin/candidates', '/admin/users'])('redirects activators away from %s', async path => {
        openPage(path, 'activator');
        await waitFor(() => expect(window.location.pathname).toBe('/admin/activations'));
        expect(screen.queryByRole('link', {name: 'Manage Elections'})).not.toBeInTheDocument();
        expect(screen.queryByRole('link', {name: 'Election Results'})).not.toBeInTheDocument();
    });

    it('allows superusers to choose voters from either election', async () => {
        const user = userEvent.setup();
        openPage('/admin/students', 'superuser');
        const select = screen.getByRole('combobox', {name: 'Election'});
        await screen.findByRole('option', {name: 'Other Election (2026)'});
        await user.selectOptions(select, '1');
        await screen.findByRole('heading', {name: 'Voters for Assigned Election'});
        await user.selectOptions(select, '2');
        await screen.findByRole('heading', {name: 'Voters for Other Election'});
        await waitFor(() => expect(screen.getAllByText('Other Voter').length).toBeGreaterThan(0));
        expect(screen.queryByText('Assigned Voter')).not.toBeInTheDocument();
    });

    it('shows both elections and global administration links for superusers', async () => {
        openPage('/admin/manage-elections', 'superuser');
        expect(await screen.findByText('Assigned Election')).toBeInTheDocument();
        expect(screen.getByText('Other Election')).toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'Manage Users'})).toBeInTheDocument();
        expect(screen.getByRole('link', {name: /^Elections$/})).toBeInTheDocument();
        expect(screen.getAllByText('Ended').length).toBeGreaterThan(0);
        expect(screen.queryByText('Voting enabled')).not.toBeInTheDocument();
    });
});

describe('lifecycle lock and schedule controls', () => {
    it('disables candidate changes from the backend lock while keeping records viewable', async () => {
        electionData[0].candidate_changes_locked = true;
        electionData[0].status = 'paused';
        electionData[0].voting_enabled = false;
        openPage('/admin/candidates');
        const addButton = await screen.findByRole('button', {name: 'Add candidate'});
        expect(addButton).toBeDisabled();
        expect(await screen.findByRole('status')).toHaveTextContent('Candidate and position changes are no longer allowed because the election has started.');
    });

    it('disables position create, edit and delete actions when ballot changes are locked', async () => {
        electionData[0].candidate_changes_locked = true;
        openPage('/admin/positions');
        expect(await screen.findByRole('heading', {name: 'Positions for Assigned Election'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Add position'})).toBeDisabled();
        expect(screen.getByRole('button', {name: 'Edit Assigned President'})).toBeDisabled();
        expect(screen.getByRole('button', {name: 'Delete Assigned President'})).toBeDisabled();
    });

    it.each([
        ['open', 'Candidate and position changes are no longer allowed because the election has started.'],
        ['paused', 'Candidate and position changes are no longer allowed because the election has started.'],
        ['ended', 'Candidate and position changes are no longer allowed because the election has closed.'],
        ['scheduled', 'Candidate and position changes are locked for this election.'],
    ] as const)('explains a locked ballot correctly when election status is %s', async (status, message) => {
        electionData[0].candidate_changes_locked = true;
        electionData[0].status = status;
        openPage('/admin/positions');

        expect(await screen.findByText(message)).toBeInTheDocument();
    });

    it.each([
        ['equal', '2027-05-01T10:00', '2027-05-01T10:00'],
        ['reversed', '2027-05-01T11:00', '2027-05-01T10:00'],
    ])('rejects %s schedule values before calling the create API', async (_case, start, end) => {
        const user = userEvent.setup();
        openPage('/admin/elections', 'superuser');
        await user.click(await screen.findByRole('button', {name: 'Create election'}));
        const dialog = within(screen.getByRole('dialog'));
        fireEvent.change(dialog.getByLabelText(/Election name/), {target: {value: 'Lifecycle test'}});
        fireEvent.change(dialog.getByLabelText(/Year/), {target: {value: '2027'}});
        fireEvent.change(dialog.getByLabelText(/Voting opens/), {target: {value: start}});
        fireEvent.change(dialog.getByLabelText(/Voting closes/), {target: {value: end}});
        fireEvent.submit(dialog.getByRole('button', {name: 'Create election'}).closest('form')!);
        expect(await screen.findByText('The election must end after its starting time.')).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalledWith('api/elections/create/', expect.anything());
    });

    it('sends a valid local schedule as timezone-aware ISO timestamps', async () => {
        const user = userEvent.setup();
        openPage('/admin/elections', 'superuser');
        await user.click(await screen.findByRole('button', {name: 'Create election'}));
        const dialog = within(screen.getByRole('dialog'));
        const start = '2027-05-01T10:00';
        const end = '2027-05-01T11:00';
        fireEvent.change(dialog.getByLabelText(/Election name/), {target: {value: 'Lifecycle test'}});
        fireEvent.change(dialog.getByLabelText(/Year/), {target: {value: '2027'}});
        fireEvent.change(dialog.getByLabelText(/Voting opens/), {target: {value: start}});
        fireEvent.change(dialog.getByLabelText(/Voting closes/), {target: {value: end}});
        await user.click(dialog.getByRole('button', {name: 'Create election'}));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/elections/create/', {
            name: 'Lifecycle test', year: 2027,
            start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(),
            voting_enabled: false,
        }));
    });
});

describe('voter lifecycle contract', () => {
    it.each([
        ['paused', 'Voting is currently paused. Please try again later.'],
        ['ended', 'Voting has ended.'],
    ])('shows the %s lifecycle message without loading the ballot', async (status, message) => {
        saveVoterSession({
            token: 'test-only-token', can_vote_now: false,
            student: {id: 11, student_id: 'V1', full_name: 'Assigned Voter', class_name: 'Form 1'},
            election: {id: 1, name: 'Assigned Election', year: 2026, voting_enabled: true, status: status as 'paused' | 'ended', voting_open: false},
        });
        openPage('/vote');
        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(vi.mocked(api.get).mock.calls.some(([url]) => url === '/api/positions/')).toBe(false);
    });

    it('blocks a scheduled voter response even when it contains a token', async () => {
        const user = userEvent.setup();
        vi.mocked(api.post).mockResolvedValueOnce({data: {
            token: 'test-only-token', can_vote_now: false,
            student: {id: 11, student_id: 'V1', full_name: 'Assigned Voter', class_name: 'Form 1'},
            election: {id: 1, name: 'Assigned Election', year: 2026, voting_enabled: true, status: 'scheduled', voting_open: false},
        }});
        openPage('/');
        await user.type(screen.getByLabelText(/Voter ID/), 'V1');
        await user.click(screen.getByRole('button', {name: 'Enter voting portal'}));
        expect(await screen.findByText('Voting has not started yet.')).toBeInTheDocument();
        expect(sessionStorage.getItem('voter_token')).toBeNull();
        expect(window.location.pathname).toBe('/');
    });

    it('uses backend voter eligibility and lifecycle before loading ballot data', async () => {
        const user = userEvent.setup();
        vi.mocked(api.post).mockResolvedValueOnce({data: {
            token: 'test-only-token', can_vote_now: true,
            student: {id: 11, student_id: 'V1', full_name: 'Assigned Voter', class_name: 'Form 1'},
            election: {id: 1, name: 'Assigned Election', year: 2026, voting_enabled: true, status: 'open', voting_open: true},
        }});
        openPage('/');
        await user.type(screen.getByLabelText(/Voter ID/), 'V1');
        await user.click(screen.getByRole('button', {name: 'Enter voting portal'}));
        expect(await screen.findByText('Voting Open')).toBeInTheDocument();
        const positionsRequest = vi.mocked(api.get).mock.calls.find(([url]) => url === '/api/positions/');
        expect(positionsRequest?.[1]).toEqual(expect.objectContaining({
            params: {election_id: '1'},
            headers: expect.objectContaining({'X-Student-Id': 'V1', 'X-Election-Id': '1', 'X-Voter-Token': 'test-only-token'}),
        }));
    });

    it('keeps ambiguous simultaneous-election login safely blocked', async () => {
        const user = userEvent.setup();
        vi.mocked(api.post).mockRejectedValueOnce({response: {status: 409, data: {detail: 'internal message'}}});
        openPage('/');
        await user.type(screen.getByLabelText(/Voter ID/), 'V1');
        await user.click(screen.getByRole('button', {name: 'Enter voting portal'}));
        expect(await screen.findByText('Your student ID is active in more than one election. Please select an election or contact an administrator.')).toBeInTheDocument();
        expect(sessionStorage.getItem('voter_token')).toBeNull();
        expect(screen.queryByText('internal message')).not.toBeInTheDocument();
    });

    it.each([
        ['Voting has not started yet.', 'Voting has not started yet.'],
        ['Voting is currently paused. Please try again later.', 'Voting is currently paused. Please try again later.'],
        ['Voting has ended.', 'Voting has ended.'],
        ['No active election at this time.', 'Voting is not currently available. Please try again later.'],
    ])('shows the correct lifecycle message for login response %s', async (detail, message) => {
        const user = userEvent.setup();
        vi.mocked(api.post).mockRejectedValueOnce({response: {status: 403, data: {detail}}});
        openPage('/');
        await user.type(screen.getByLabelText(/Voter ID/), 'V1');
        await user.click(screen.getByRole('button', {name: 'Enter voting portal'}));
        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(screen.queryByText('Failed to login. Please check your voter ID and try again.')).not.toBeInTheDocument();
        expect(sessionStorage.getItem('voter_token')).toBeNull();
    });

    it('shows a pause response when a live voter session is paused before ballot loading', async () => {
        const originalGet = vi.mocked(api.get).getMockImplementation()!;
        vi.mocked(api.get).mockImplementation(async (url, config) => {
            if (url === '/api/positions/') {
                throw {response: {status: 403, data: {detail: 'Voting is paused for this election.'}}};
            }
            return originalGet(url, config);
        });
        saveVoterSession({
            token: 'test-only-token', can_vote_now: true,
            student: {id: 11, student_id: 'V1', full_name: 'Assigned Voter', class_name: 'Form 1'},
            election: {id: 1, name: 'Assigned Election', year: 2026, voting_enabled: true, status: 'open', voting_open: true},
        });
        openPage('/vote');
        expect(await screen.findByText('Voting is currently paused. Please try again later.')).toBeInTheDocument();
        expect(window.location.pathname).toBe('/vote');
    });

    it('shows a pause response when ballot submission is rejected after pausing', async () => {
        const user = userEvent.setup();
        const originalGet = vi.mocked(api.get).getMockImplementation()!;
        vi.mocked(api.get).mockImplementation(async (url, config) => url === '/api/candidates/'
            ? {data: [{id: 44, student: 11, student_name: 'Candidate One', position: 101, ballot_number: 1}]}
            : originalGet(url, config));
        vi.mocked(api.post).mockImplementation(async url => {
            if (url === '/api/vote/') {
                throw {response: {status: 403, data: {detail: 'Voting is paused for this election.'}}};
            }
            return {data: {}};
        });
        saveVoterSession({
            token: 'test-only-token', can_vote_now: true,
            student: {id: 11, student_id: 'V1', full_name: 'Assigned Voter', class_name: 'Form 1'},
            election: {id: 1, name: 'Assigned Election', year: 2026, voting_enabled: true, status: 'open', voting_open: true},
        });
        openPage('/vote');
        await user.click(await screen.findByRole('radio', {name: '1: Candidate One'}));
        await user.click(await screen.findByRole('button', {name: /Submit Now/}));
        expect(await screen.findByText('Voting is currently paused. Please try again later.')).toBeInTheDocument();
        expect(screen.queryByText('Votes Submitted Successfully!')).not.toBeInTheDocument();
    }, 10_000);

    it.each([
        ['Student is not activated to vote.', 'You have not been activated for this election.'],
        ['Student has already voted.', 'You have already voted in this election.'],
    ])('translates voter eligibility errors safely', async (detail, message) => {
        const user = userEvent.setup();
        vi.mocked(api.post).mockRejectedValueOnce({response: {status: 403, data: {detail}}});
        openPage('/');
        await user.type(screen.getByLabelText(/Voter ID/), 'V1');
        await user.click(screen.getByRole('button', {name: 'Enter voting portal'}));
        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(screen.queryByText(detail)).not.toBeInTheDocument();
    });

    it('does not treat an old token-only browser session as voter eligibility', async () => {
        sessionStorage.setItem('student_id', 'V1');
        sessionStorage.setItem('election_id', '1');
        sessionStorage.setItem('voter_token', 'test-only-token');
        openPage('/vote');
        await waitFor(() => expect(window.location.pathname).toBe('/'));
        expect(vi.mocked(api.get).mock.calls.some(([url]) => url === '/api/positions/')).toBe(false);
    });

    it('honors can_vote_now=false after successful ballot submission', async () => {
        const user = userEvent.setup();
        const originalGet = vi.mocked(api.get).getMockImplementation()!;
        vi.mocked(api.get).mockImplementation(async (url, config) => url === '/api/candidates/'
            ? {data: [{id: 44, student: 11, student_name: 'Candidate One', position: 101, ballot_number: 1}]}
            : originalGet(url, config));
        vi.mocked(api.post).mockImplementation(async url => url === '/api/vote/'
            ? {data: {detail: 'Ballot submitted.', can_vote_now: false}}
            : {data: {}});
        saveVoterSession({
            token: 'test-only-token', can_vote_now: true,
            student: {id: 11, student_id: 'V1', full_name: 'Assigned Voter', class_name: 'Form 1'},
            election: {id: 1, name: 'Assigned Election', year: 2026, voting_enabled: true, status: 'open', voting_open: true},
        });
        openPage('/vote');
        await user.click(await screen.findByRole('radio', {name: '1: Candidate One'}));
        await user.click(await screen.findByRole('button', {name: /Submit Now/}));
        expect(await screen.findByText('Votes Submitted Successfully!')).toBeInTheDocument();
        expect(getVoterSession()?.canVoteNow).toBe(false);
        expect(api.post).toHaveBeenCalledWith('/api/vote/', {
            votes: [{election: 1, position: 101, candidate: 44, choice: 'candidate'}],
        }, expect.objectContaining({headers: expect.objectContaining({
            'X-Student-Id': 'V1', 'X-Election-Id': '1', 'X-Voter-Token': 'test-only-token',
        })}));
    }, 10_000);
});

describe('scheduled election schedule editing', () => {
    it('updates both scheduled times through the schedule endpoint', async () => {
        const user = userEvent.setup();
        openPage('/admin/elections', 'superuser');
        await user.click(await screen.findByRole('button', {name: 'Edit schedule for Assigned Election'}));
        const dialog = within(screen.getByRole('dialog'));
        const start = '2099-01-01T02:00';
        const end = '2099-01-01T03:00';
        fireEvent.change(dialog.getByLabelText(/Voting opens/), {target: {value: start}});
        fireEvent.change(dialog.getByLabelText(/Voting closes/), {target: {value: end}});
        await user.click(dialog.getByRole('button', {name: 'Save schedule'}));
        await waitFor(() => expect(api.patch).toHaveBeenCalledWith('api/elections/1/schedule/', {
            start_time: new Date(start).toISOString(),
            end_time: new Date(end).toISOString(),
        }));
    });

    it('rejects equal schedule times before sending an update', async () => {
        const user = userEvent.setup();
        openPage('/admin/elections', 'superuser');
        await user.click(await screen.findByRole('button', {name: 'Edit schedule for Assigned Election'}));
        const dialog = within(screen.getByRole('dialog'));
        const equalTime = '2099-01-01T02:00';
        fireEvent.change(dialog.getByLabelText(/Voting opens/), {target: {value: equalTime}});
        fireEvent.change(dialog.getByLabelText(/Voting closes/), {target: {value: equalTime}});
        fireEvent.submit(dialog.getByRole('button', {name: 'Save schedule'}).closest('form')!);
        expect(await screen.findByText('The election must end after its starting time.')).toBeInTheDocument();
        expect(api.patch).not.toHaveBeenCalledWith('api/elections/1/schedule/', expect.anything());
    });

    it('does not offer schedule edits after an election is open or ended', async () => {
        electionData = [
            {...elections[0], status: 'open', voting_open: true},
            {...elections[1], status: 'ended'},
        ];
        openPage('/admin/elections', 'superuser');
        await screen.findByText('Assigned Election');
        expect(screen.queryByRole('button', {name: /Edit schedule for/})).not.toBeInTheDocument();
    });
});

describe('ballot readiness management', () => {
    it('prevents enabling voting until every position has a candidate', async () => {
        electionData[0] = {
            ...electionData[0],
            status: 'scheduled',
            voting_enabled: false,
            voting_open: false,
            ballot_ready: false,
        };
        openPage('/admin/manage-elections');
        const row = (await screen.findByText('Assigned Election')).closest('tr');
        expect(row).not.toBeNull();
        expect(within(row!).getByRole('button', {name: 'Enable voting'})).toBeDisabled();
        expect(within(row!).getByText(/candidate to every position/i)).toBeInTheDocument();
    });
});
