import {type FormEvent, useEffect, useState} from 'react';
import {FiEdit2, FiLock, FiPlus, FiSearch, FiTrash2} from 'react-icons/fi';
import api from '../../apiConfig';
import ConfirmModal from '../../components/ConfirmModal';
import PageContainer from '../../components/PageContainer';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import FormField from '../../components/ui/FormField';
import Modal from '../../components/ui/Modal';
import SelectField from '../../components/ui/SelectField';
import TextInput from '../../components/ui/TextInput';
import {showError, showSuccess} from '../../utils/toast';
import {type Election, useElections} from '../../queries/useElections';

interface User {
    id: number;
    username: string;
    role: 'superuser' | 'staff' | 'activator';
    is_active: boolean;
    assigned_election: Election | null;
}

interface ListResponse<T> {
    count?: number;
    results?: T[];
}

type ApiError = { response?: { data?: unknown } };

function errorMessage(error: unknown, fallback: string) {
    const detail = (error as ApiError).response?.data;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') {
        return Object.entries(detail as Record<string, unknown>)
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
            .join('; ') || fallback;
    }
    return fallback;
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [formError, setFormError] = useState('');
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<User['role']>('staff');
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [electionId, setElectionId] = useState<number | null>(null);
    const electionsQuery = useElections();
    const elections = electionsQuery.data ?? [];

    const filteredUsers = users.filter(user => user.username.toLowerCase().includes(searchTerm.toLowerCase()));

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await api.get<User[] | ListResponse<User>>('api/users/');
            const data = res.data;
            setUsers(Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : []);
        } catch (error) {
            showError(errorMessage(error, 'Failed to load users.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const resetForm = () => {
        setUsername('');
        setPassword('');
        setRole('staff');
        setEditingUser(null);
        setElectionId(null);
        setFormError('');
        setShowForm(false);
    };

    const openCreateForm = () => {
        resetForm();
        setShowForm(true);
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setFormError('');
        try {
            if (editingUser) {
                const payload: { username: string; role: User['role']; password?: string } = {username, role};
                if (password.trim()) payload.password = password;
                await api.patch(`api/users/${editingUser.id}/`, payload);
                showSuccess('User updated successfully.');
            } else {
                const payload: {
                    username: string;
                    password: string;
                    role: User['role'];
                    election_id?: number
                } = {username, password, role};
                if (role !== 'superuser' && electionId) payload.election_id = electionId;
                await api.post('api/users/', payload);
                showSuccess('User created successfully.');
            }
            resetForm();
            await fetchUsers();
        } catch (error) {
            const message = errorMessage(error, 'Operation failed.');
            setFormError(message);
            showError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setUsername(user.username);
        setRole(user.role);
        setElectionId(user.assigned_election?.id ?? null);
        setPassword('');
        setFormError('');
        setShowForm(true);
    };

    const handleDelete = async () => {
        if (!userToDelete) return;
        setLoading(true);
        try {
            await api.delete(`api/users/${userToDelete.id}/`);
            showSuccess('User deleted.');
            setUserToDelete(null);
            await fetchUsers();
        } catch (error) {
            showError(errorMessage(error, 'Failed to delete user.'));
        } finally {
            setLoading(false);
        }
    };

    const roleVariant = (userRole: User['role']): 'primary' | 'success' | 'warning' => {
        if (userRole === 'activator') return 'success';
        if (userRole === 'superuser') return 'warning';
        return 'primary';
    };

    return (
        <PageContainer className="users-page">
            <div className="users-page-header">
                <div>
                    <h1 className="text-lg font-semibold text-gray-900">Manage users</h1>
                    <p className="text-xs text-gray-500">Manage administrator accounts and access roles.</p>
                </div>
                <Button type="button" size="compact" leadingIcon={<FiPlus aria-hidden="true"/>}
                        onClick={openCreateForm}>
                    Add user
                </Button>
            </div>

            <div className="users-search-field">
                <FiSearch aria-hidden="true"/>
                <TextInput type="search" placeholder="Search by username" value={searchTerm}
                           onChange={event => setSearchTerm(event.target.value)}
                           aria-label="Search users by username"/>
            </div>
            {searchTerm &&
                <Button type="button" variant="quiet" size="compact" onClick={() => setSearchTerm('')}>Clear
                    search</Button>}

            <section className="users-table-section" aria-label="User records">
                <div className="users-table-wrap">
                    <table className="users-table">
                        <caption className="sr-only">Managed users</caption>
                        <thead>
                        <tr className="bg-cyan-700">
                            <th scope="col">Username</th>
                            <th scope="col">Role</th>
                            <th scope="col">Status</th>
                            <th scope="col">Election</th>
                            <th scope="col">Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {filteredUsers.map(user => (
                            <tr key={user.id}>
                                <td className="users-table-identity" data-label="Username">
                                    <div className="users-identity">
                                        <span>{user.username}</span>
                                    </div>
                                </td>
                                <td data-label="Role"><span
                                    className={`users-status-text users-status-text--${roleVariant(user.role)}`}>{user.role}</span>
                                </td>
                                <td data-label="Status"><span
                                    className={`users-status-text users-status-text--${user.is_active ? 'success' : 'neutral'}`}>{user.is_active ? 'Active' : 'Inactive'}</span>
                                </td>
                                <td data-label="Election">
                                    {user.assigned_election
                                        ? `${user.assigned_election.name} (${user.assigned_election.year})`
                                        : 'All elections'}
                                </td>
                                <td data-label="Actions">
                                    <div className="users-actions">
                                        <button type="button" className="users-icon-button users-icon-button--edit"
                                                onClick={() => handleEdit(user)} aria-label={`Edit ${user.username}`}
                                                title="Edit user">
                                            <FiEdit2 aria-hidden="true"/>
                                        </button>
                                        <button type="button" className="users-icon-button users-icon-button--delete"
                                                onClick={() => setUserToDelete(user)}
                                                aria-label={`Delete ${user.username}`} title="Delete user"
                                                disabled={loading}>
                                            <FiTrash2 aria-hidden="true"/>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {!loading && filteredUsers.length === 0 && (
                            <tr>
                                <td colSpan={5}
                                    className="users-empty-cell">{searchTerm ? 'No users match your search.' : 'No users found. Add a user to get started.'}</td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </section>

            <Modal open={showForm} onClose={resetForm} title={editingUser ? 'Edit user' : 'Add user'}
                   description={editingUser ? 'Update account details. Election assignment is read-only.' : 'Create an administrator account with a specific access role.'}
                   className="users-modal">
                <form onSubmit={handleSubmit} className="users-form">
                    {formError && <Alert variant="error" title="Unable to save user">{formError}</Alert>}
                    <div className="users-form-grid">
                        <FormField id="username" label="Username" required>
                            <TextInput type="text" value={username} onChange={event => setUsername(event.target.value)}
                                       placeholder="Enter username"/>
                        </FormField>
                        <div className="users-password-field">
                            <FormField id="password" label="Password" required={!editingUser}
                            >
                                <TextInput type="text" value={password}
                                           onChange={event => setPassword(event.target.value)}
                                           placeholder={editingUser ? 'Leave unchanged' : 'Enter password'}
                                           minLength={6}/>
                            </FormField>
                            <FiLock aria-hidden="true"/>
                        </div>
                        <FormField id="role" label="Role" required>
                            <SelectField value={role} onChange={event => {
                                const nextRole = event.target.value as User['role'];
                                setRole(nextRole);
                                if (nextRole === 'superuser') setElectionId(null);
                            }}>
                                <option value="staff">Staff</option>
                                <option value="activator">Activator</option>
                                <option value="superuser">Superuser</option>
                            </SelectField>
                        </FormField>
                        {editingUser ? (
                            <FormField id="assigned-election" label="Assigned election"
                                       helperText="This assignment cannot be changed after account creation.">
                                <TextInput
                                    id="assigned-election"
                                    value={editingUser.assigned_election ? `${editingUser.assigned_election.name} (${editingUser.assigned_election.year})` : 'All elections'}
                                    readOnly
                                    aria-readonly="true"
                                />
                            </FormField>
                        ) : role !== 'superuser' ? (
                            <FormField id="assigned-election" label="Assigned election" required
                                       helperText="Staff and activator accounts must belong to one election.">
                                <SelectField
                                    id="assigned-election"
                                    value={electionId ?? ''}
                                    onChange={event => setElectionId(event.target.value ? Number(event.target.value) : null)}
                                >
                                    <option value="">Select an election</option>
                                    {elections.map((election: Election) => (
                                        <option key={election.id} value={election.id}>
                                            {election.name} ({election.year})
                                        </option>
                                    ))}
                                </SelectField>
                            </FormField>
                        ) : null}
                    </div>
                    <div className="users-modal-actions">
                        <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
                        <Button
                            type="submit"
                            loading={loading}
                            disabled={!editingUser && role !== 'superuser' && !electionId}
                        >
                            {editingUser ? 'Save changes' : 'Create user'}
                        </Button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal isOpen={Boolean(userToDelete)} onClose={() => setUserToDelete(null)} onConfirm={handleDelete}
                          title="Delete user"
                          message={userToDelete ? `Delete user “${userToDelete.username}”? This action cannot be undone.` : ''}
                          confirmText="Delete user" cancelText="Cancel" type="danger"/>
        </PageContainer>
    );
}
