import { memo } from 'react';

interface Student {
    id: number;
    student_id: string;
    full_name: string;
    class_name: string;
    has_voted: boolean;
    is_active: boolean;
    election?: {
        id: number;
        name: string;
        year: number;
    };
}

interface StudentRowProps {
    student: Student;
    onEdit: (student: Student) => void;
    onDelete: (student: Student) => void;
    isModalOpening?: boolean;
}

const EditIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
    </svg>
);

const TrashIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
    </svg>
);

const StudentRow = memo(({ student, onEdit, onDelete, isModalOpening = false }: StudentRowProps) => {
    const handleEdit = () => onEdit(student);
    const handleDelete = () => onDelete(student);

    return (
        <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
            <td className="px-5 py-3">
                <div className="text-sm font-medium text-gray-900">{student.student_id}</div>
            </td>
            <td className="px-5 py-3">
                <div className="text-sm text-gray-900">{student.full_name}</div>
            </td>
            <td className="px-5 py-3">
                <span className="inline-flex px-2 py-1 text-xs font-medium text-gray-700">
                    {student.class_name}
                </span>
            </td>
            <td className="px-5 py-3">
                <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        student.is_active ? 'bg-green-100/70 text-green-900' : 'bg-red-100/70 text-red-900'
                    }`}
                >
                    {student.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td className="px-5 py-2">
                <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        student.has_voted ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}
                >
                    {student.has_voted ? 'Yes' : 'No'}
                </span>
            </td>
            <td className="px-5 py-2">
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleEdit}
                        disabled={isModalOpening}
                        className={`p-1.5 rounded-lg transition ${
                            isModalOpening
                                ? 'text-gray-300 cursor-wait'
                                : 'text-blue-600 hover:bg-blue-50'
                        }`}
                        title="Edit student"
                    >
                        <EditIcon/>
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={student.has_voted}
                        className={`p-1.5 rounded-lg transition ${
                            student.has_voted
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'text-red-600 hover:bg-red-50'
                        }`}
                        title={student.has_voted ? 'Cannot delete - student has voted' : 'Delete student'}
                    >
                        <TrashIcon/>
                    </button>
                </div>
            </td>
        </tr>
    );
});

StudentRow.displayName = 'StudentRow';

export default StudentRow;
