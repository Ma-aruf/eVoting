import {type ReactNode} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import type {AuthUser, UserRole} from '../contexts/AuthContext';
import App from '../App';
import api from '../apiConfig';

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

const elections = [
    {id: 1, name: 'Assigned Election', year: 2026, start_time: '2099-01-01T00:00:00Z', end_time: '2099-01-02T00:00:00Z', is_active: true},
    {id: 2, name: 'Other Election', year: 2026, start_time: '2099-01-01T00:00:00Z', end_time: '2099-01-02T00:00:00Z', is_active: true},
];
const voters = [
    {id: 11, student_id: 'V1', full_name: 'Assigned Voter', class_name: 'Form 1', election: 1, is_active: false, has_voted: false},
    {id: 22, student_id: 'V2', full_name: 'Other Voter', class_name: 'Form 2', election: 2, is_active: false, has_voted: false},
];
const positions = [
    {id: 101, name: 'Assigned President', election: 1, display_order: 1},
    {id: 202, name: 'Other President', election: 2, display_order: 1},
];
let electionData = elections;

function openPage(path: string, role: UserRole = 'staff') {
    currentUser = {username: `${role}-account`, role, assignedElection: role === 'superuser' ? null : elections[0]};
    window.history.replaceState({}, '', path);
    return render(<App />);
}

beforeEach(() => {
    client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: 0}, mutations: {retry: false}}});
    electionData = elections.map(election => ({...election}));
    vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
        const parsed = new URL(url, 'http://localhost');
        const electionId = Number(config?.params?.election_id ?? parsed.searchParams.get('election_id'));
        if (parsed.pathname === '/api/elections/') return {data: electionData};
        if (parsed.pathname === '/api/students/') return {data: voters.filter(voter => voter.election === electionId)};
        if (parsed.pathname === '/api/positions/') return {data: positions.filter(position => position.election === electionId)};
        if (parsed.pathname === '/api/candidates/') return {data: []};
        const result = parsed.pathname.match(/^\/api\/elections\/(\d+)\/results\/$/);
        if (result) return {data: {
            election_id: Number(result[1]), election_name: elections[Number(result[1]) - 1].name,
            year: 2026, total_students: 1, students_who_voted: 0, voter_turnout_percentage: 0, positions: [],
        }};
        throw new Error(`Unexpected GET ${url}`);
    });
    vi.spyOn(api, 'post').mockResolvedValue({data: {}});
    vi.spyOn(api, 'patch').mockImplementation(async (_url, payload) => {
        const data = payload as {election_id: number; is_active: boolean};
        electionData = electionData.map(election => election.id === data.election_id ? {...election, is_active: data.is_active} : election);
        return {data: payload};
    });
});

afterEach(() => {
    cleanup();
    client.clear();
    vi.restoreAllMocks();
});

describe('staff election workflows', () => {
    it('shows the assigned dashboard even when its election is inactive', async () => {
        electionData[0].is_active = false;
        openPage('/admin/dashboard');
        expect(await screen.findByRole('heading', {name: 'Assigned Election'})).toBeInTheDocument();
        expect(screen.queryByText('Other Election')).not.toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'Positions'})).toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'Manage Elections'})).toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'Activate Voters'})).toBeInTheDocument();
        expect(screen.queryByRole('link', {name: 'Manage Users'})).not.toBeInTheDocument();
        expect(screen.queryByRole('link', {name: /^Elections$/})).not.toBeInTheDocument();
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

    it('stops and starts only the assigned election', async () => {
        const user = userEvent.setup();
        openPage('/admin/manage-elections');
        await screen.findByText('Assigned Election');
        expect(screen.queryByText('Other Election')).not.toBeInTheDocument();
        for (const [action, active] of [['Stop', false], ['Start', true]] as const) {
            await user.click(await screen.findByRole('button', {name: new RegExp(action)}));
            await user.click(within(screen.getByRole('dialog')).getByRole('button', {name: action}));
            await waitFor(() => expect(api.patch).toHaveBeenCalledWith('api/elections/manage/', {election_id: 1, is_active: active}));
            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        }
    });

    it.each(['staff', 'activator'] as const)('%s activates only assigned voters', async role => {
        const user = userEvent.setup();
        openPage('/admin/activations', role);
        const input = await screen.findByRole('combobox');
        expect(screen.queryByRole('combobox', {name: 'Active election'})).not.toBeInTheDocument();
        await user.type(input, 'Voter');
        await user.click(await screen.findByRole('option', {name: /Assigned Voter/}));
        expect(screen.queryByText('Other Voter')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', {name: /Activate voter/i}));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/students/activate/', {
            student_id: 'V1', election_id: 1, is_active: true,
        }));
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
    });
});
