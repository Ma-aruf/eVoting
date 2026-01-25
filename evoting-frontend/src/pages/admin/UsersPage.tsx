import {type FormEvent, useEffect, useState} from 'react';
import api from '../../apiConfig';
import {showError, showSuccess} from '../../utils/toast';

interface User {
    id: number;
    username: string;
    role: 'superuser' | 'staff' | 'activator';
    is_active: boolean;
}

interface ListResponse<T> {
    count?: number;
    results?: T[];
}

const UserIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
    </svg>
);

const PlusIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
    </svg>
);

const EditIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
    </svg>
);

const TrashIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
    </svg>
);

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'staff' | 'activator' | 'superuser'>('staff');


    const [editingUser, setEditingUser] = useState<User | null>(null);

    // Filter users by search term
    const filteredUsers = users.filter(user =>
        user.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await api.get<User[] | ListResponse<User>>('api/users/');
            const data = res.data;
            if (Array.isArray(data)) {
                setUsers(data);
            } else if (Array.isArray(data.results)) {
                setUsers(data.results);
            } else {
                setUsers([]);
            }
        } catch (err) {
            showError('Failed to load users.');
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
        setShowForm(false);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (editingUser) {
                const payload: any = {username, role};
                if (password.trim()) {
                    payload.password = password;
                }
                await api.patch(`api/users/${editingUser.id}/`, payload);
                showSuccess('User updated successfully.');
            } else {
                await api.post('api/users/', {username, password, role});
                showSuccess('User created successfully.');
            }
            resetForm();
            await fetchUsers();
        } catch (err: any) {
            const detail = err.response?.data;
            if (typeof detail === 'object') {
                const messages = Object.entries(detail)
                    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
                    .join('; ');
                showError(messages || 'Operation failed.');
            } else {
                showError(detail || 'Operation failed.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setUsername(user.username);
        setRole(user.role);
        setPassword('');
        setShowForm(true);
    };

    const handleDelete = async (user: User) => {
        if (!confirm(`Delete user "${user.username}"?`)) return;

        setLoading(true);
        try {
            await api.delete(`api/users/${user.id}/`);
            showSuccess('User deleted.');
            await fetchUsers();
        } catch (err: any) {
            showError(err.response?.data?.detail || 'Failed to delete user.');
        } finally {
            setLoading(false);
        }
    };

    const getRoleBadgeClass = (r: string) => {
        switch (r) {
            case 'superuser':
                return 'bg-purple-100 text-purple-700';
            case 'staff':
                return 'bg-blue-100 text-blue-700';
            case 'activator':
                return 'bg-green-100 text-green-700';
            default:
                return 'bg-gray-100 text-gray-700';
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h1 className="text-xl font-semibold text-gray-900">Manage Users</h1>
                <button
                    onClick={() => {
                        resetForm();
                        setShowForm(true);
                    }}
                    className="inline-flex w-full sm:w-auto justify-center items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition"
                >
                    <PlusIcon/>
                    Add User
                </button>
            </div>


            {/* Add/Edit User Form */}
            {showForm && (
                <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <h2 className="text-base font-medium text-gray-900 mb-4">
                        {editingUser ? 'Edit User' : 'Add New User'}
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="username">
                                    Username
                                </label>
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Enter username"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="password">
                                    Password {editingUser && <span className="text-gray-400">(leave blank to keep)</span>}
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required={!editingUser}
                                    minLength={6}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder={editingUser ? '••••••••' : 'Min 6 characters'}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="role">
                                    Role
                                </label>
                                <select
                                    id="role"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value as any)}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="staff">Staff</option>
                                    <option value="activator">Activator</option>
                                    <option value="superuser">Superuser</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 disabled:cursor-not-allowed transition"
                            >
                                {loading ? 'Saving…' : editingUser ? 'Update User' : 'Create User'}
                            </button>
                            <button
                                type="button"
                                onClick={resetForm}
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </section>
            )}

            {/* Users Table */}
            <section className="bg-white rounded-xl border border-gray-200  overflow-hidden">
                <div
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                        <h2 className="text-base font-medium text-gray-900">
                            Users
                        </h2>
                        {loading && <span className="text-xs text-gray-500">Loading…</span>}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                        <input
                            type="text"
                            placeholder="Search by username..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full sm:w-64 border border-blue-200 border-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {searchTerm && (
                            <span className="text-xs text-gray-500">
                                {filteredUsers.length} of {users.length}
                            </span>
                        )}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                        <tr className="bg-blue-100 border-b border-gray-100">
                            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Username
                            </th>
                            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y  divide-gray-100">
                        {filteredUsers.map((user: User) => (
                            <tr key={user.id} className="hover:bg-gray-50 transition odd:bg-white even:bg-blue-50 ">
                                <td className="px-5 py-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                            <UserIcon/>
                                        </div>
                                        <span className="font-medium text-gray-900">{user.username}</span>
                                    </div>
                                </td>
                                <td className="px-5 py-2">
                                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeClass(user.role)}`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-5 py-2">
                                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                        {user.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="px-5 py-2">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleEdit(user)}
                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                            title="Edit user"
                                        >
                                            <EditIcon/>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(user)}
                                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition"
                                            title="Delete user"
                                        >
                                            <TrashIcon/>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {!loading && filteredUsers.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                                    {searchTerm
                                        ? 'No users match your search.'
                                        : 'No users found. Click "Add User" to create one.'}
                                </td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
