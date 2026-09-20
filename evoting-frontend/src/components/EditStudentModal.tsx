import {type FormEvent, useEffect, useState} from 'react';
import Modal from './ui/Modal';
import FormField from './ui/FormField';
import TextInput from './ui/TextInput';
import SelectField from './ui/SelectField';
import Button from './ui/Button';

import type {Student} from '../queries/useStudents';
interface EditStudentModalProps { student: Student | null; onClose: () => void; onSave: (student: Student, fullName: string, className: string) => void; loading?: boolean; }
const CLASS_OPTIONS = ['Form 1', 'Form 2', 'Form 3'];

export default function EditStudentModal({student, onClose, onSave, loading = false}: EditStudentModalProps) {
    const [fullName, setFullName] = useState(student?.full_name || '');
    const [className, setClassName] = useState(student?.class_name || '');
    useEffect(() => {
        if (!student) return;
        const frame = requestAnimationFrame(() => {
            setFullName(student.full_name);
            setClassName(student.class_name);
        });
        return () => cancelAnimationFrame(frame);
    }, [student]);
    const handleSubmit = (event: FormEvent) => { event.preventDefault(); if (student) onSave(student, fullName.trim(), className); };
    if (!student) return null;
    return <Modal open={Boolean(student)} onClose={onClose} title="Edit voter">
        <form onSubmit={handleSubmit} className="space-y-4">
            <FormField id="edit_student_id" label="Voter ID"><TextInput value={student.student_id} readOnly/></FormField>
            <FormField id="edit_full_name" label="Full Name" required><TextInput value={fullName} onChange={event => setFullName(event.target.value)} required/></FormField>
            <FormField id="edit_class_name" label="Class" required><SelectField value={className} onChange={event => setClassName(event.target.value)} required>
                <option value="">Select class...</option>{CLASS_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
            </SelectField></FormField>
            <div className="ui-modal-actions"><Button type="button" variant="quiet" onClick={onClose}>Cancel</Button><Button type="submit" loading={loading}>Save Changes</Button></div>
        </form>
    </Modal>;
}
