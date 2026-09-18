
import {memo} from 'react';
import {FiEdit2, FiTrash2} from 'react-icons/fi';

import IconButton from './ui/IconButton';

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

const StudentRow = memo(({
    student,
    onEdit,
    onDelete,
    isModalOpening = false,
}: StudentRowProps) => (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <td className="px-1 py-0">
            <div className="text-sm font-medium text-gray-900">
                {student.student_id}
            </div>
        </td>

        <td className="px-1 py-0">
            <div className="text-sm text-gray-900">
                {student.full_name}
            </div>
        </td>

        <td className="px-1 py-0">
            <span className="text-sm text-gray-700">
                {student.class_name}
            </span>
        </td>

        <td className="px-1 py-0">
                {student.is_active ? 'Active' : 'Inactive'}
        </td>

        <td className="px-1 py-0">
                {student.has_voted ? 'Voted' : 'Not voted'}
        </td>

        <td className="px-1 py-0">
            <div className="flex justify-end gap-2">
                <IconButton
                    label="Edit voter"
                    icon={<FiEdit2 size={14} aria-hidden="true" />}
                    size="compact"
                    onClick={() => onEdit(student)}
                    disabled={isModalOpening}
                />

                <IconButton
                    label={
                        student.has_voted
                            ? 'Cannot delete - voter has voted'
                            : 'Delete voter'
                    }
                    icon={<FiTrash2 size={14} aria-hidden="true" />}
                    size="compact"
                    variant="danger"
                    onClick={() => onDelete(student)}
                    disabled={student.has_voted}
                />
            </div>
        </td>
    </tr>
));

StudentRow.displayName = 'StudentRow';

export default StudentRow;
