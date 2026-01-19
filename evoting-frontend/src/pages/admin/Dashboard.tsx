import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-800">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Signed in as <span className="font-medium">{user?.username}</span> ({user?.role})
        </p>
      </header>

      <section className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Link
          to="/admin/students"
          className="border rounded-lg p-4 hover:bg-gray-50 transition flex flex-col justify-between"
        >
          <div>
            <h2 className="font-medium text-gray-800">Students</h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage student records and perform bulk uploads from Excel.
            </p>
          </div>
        </Link>

        <Link
          to="/admin/elections"
          className="border rounded-lg p-4 hover:bg-gray-50 transition flex flex-col justify-between"
        >
          <div>
            <h2 className="font-medium text-gray-800">Elections & Positions</h2>
            <p className="text-sm text-gray-500 mt-1">
              Configure elections, positions, and link candidates.
            </p>
          </div>
        </Link>

        <Link
          to="/admin/activations"
          className="border rounded-lg p-4 hover:bg-gray-50 transition flex flex-col justify-between"
        >
          <div>
            <h2 className="font-medium text-gray-800">Voter Activation</h2>
            <p className="text-sm text-gray-500 mt-1">
              Activators can enable students to vote before the election.
            </p>
          </div>
        </Link>
      </section>
    </div>
  );
}

