import { type FormEvent, useState, useEffect } from 'react';

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

interface EditStudentModalProps {
    student: Student | null;
    onClose: () => void;
    onSave: (student: Student, fullName: string, className: string) => void;
    loading?: boolean;
}

const CLASS_OPTIONS = ['Form 1', 'Form 2', 'Form 3'];

export default function EditStudentModal({ student, onClose, onSave, loading = false }: EditStudentModalProps) {
    // Local form state managed by the modal
    const [fullName, setFullName] = useState(student?.full_name || '');
    const [className, setClassName] = useState(student?.class_name || '');

    // Reset form only when student changes (not on every render)
    useEffect(() => {
        if (student) {
            setFullName(student.full_name);
            setClassName(student.class_name);
        }
    }, [student]);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!student) return;
        
        onSave(student, fullName.trim(), className);
    };

    if (!student) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 animate-scale-up">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit Student</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">
                            Student ID
                        </label>
                        <input
                            type="text"
                            value={student.student_id}
                            disabled
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block"
                               htmlFor="edit_full_name">
                            Full Name
                        </label>
                        <input
                            id="edit_full_name"
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block"
                               htmlFor="edit_class_name">
                            Class
                        </label>
                        <select
                            id="edit_class_name"
                            value={className}
                            onChange={(e) => setClassName(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        >
                            <option value="">Select class...</option>
                            {CLASS_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition"
                        >
                            {loading ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
