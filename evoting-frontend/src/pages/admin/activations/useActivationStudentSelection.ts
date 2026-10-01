import {useEffect, useState, type KeyboardEvent} from 'react';
import {keepPreviousData} from '@tanstack/react-query';
import {useActivationStudentOptions, type Student} from '../../../queries/useStudents';

export function useActivationStudentSelection(
    electionId: number | null,
    canActivateVoters: boolean,
) {
    const [studentQuery, setStudentQuery] = useState('');
    const [debouncedStudentQuery, setDebouncedStudentQuery] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [activeOption, setActiveOption] = useState(0);

    useEffect(() => {
        const timeout = window.setTimeout(() => setDebouncedStudentQuery(studentQuery), 500);
        return () => window.clearTimeout(timeout);
    }, [studentQuery]);

    const studentsQuery = useActivationStudentOptions(
        electionId,
        debouncedStudentQuery,
        {
            refetchInterval: 10_000,
            placeholderData: keepPreviousData,
        },
    );
    const students = studentsQuery.data?.results ?? [];
    const selectedStudent = students.find(student => student.student_id === selectedStudentId) ?? null;

    const chooseStudent = (student: Student) => {
        if (!canActivateVoters) return;
        setSelectedStudentId(student.student_id);
        setStudentQuery(student.full_name + ' (' + student.student_id + ')');
        setIsOpen(false);
        setActiveOption(0);
    };

    const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (!canActivateVoters) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);
            setActiveOption(index => Math.min(index + 1, Math.max(students.length - 1, 0)));
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
            setActiveOption(index => Math.max(index - 1, 0));
        }
        if (event.key === 'Enter' && isOpen && students[activeOption]) {
            event.preventDefault();
            chooseStudent(students[activeOption]);
        }
        if (event.key === 'Escape') setIsOpen(false);
    };

    const resetForElectionChange = () => {
        setSelectedStudentId('');
        setStudentQuery('');
        setIsOpen(false);
    };

    const resetAfterActivation = () => {
        setSelectedStudentId('');
        setStudentQuery('');
        setIsOpen(false);
    };

    return {
        studentsQuery,
        students,
        selectedStudent,
        studentQuery,
        setStudentQuery,
        selectedStudentId,
        setSelectedStudentId,
        isOpen,
        setIsOpen,
        activeOption,
        setActiveOption,
        chooseStudent,
        handleSearchKeyDown,
        resetForElectionChange,
        resetAfterActivation,
    };
}
