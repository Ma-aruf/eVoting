import {useMemo, useState} from 'react';

import type {Student} from '../queries/useStudents';

export type ActiveFilter = 'all' | 'active' | 'inactive';
export type VotedFilter = 'all' | 'voted' | 'not-voted';

const PAGE_SIZE = 10;

export function useStudentFilters(students: Student[]) {
    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
    const [votedFilter, setVotedFilter] = useState<VotedFilter>('all');
    const [classFilter, setClassFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    const classes = useMemo(
        () => Array.from(new Set(students.map(student => student.class_name))).sort(),
        [students]
    );

    const filtered = useMemo(() => {
        const query = search.toLowerCase().trim();

        return students.filter(student => (
            (!query ||
                student.full_name.toLowerCase().includes(query) ||
                student.student_id.toLowerCase().includes(query)) &&
            (activeFilter === 'all' ||
                (activeFilter === 'active' ? student.is_active : !student.is_active)) &&
            (votedFilter === 'all' ||
                (votedFilter === 'voted' ? student.has_voted : !student.has_voted)) &&
            (!classFilter || student.class_name === classFilter)
        ));
    }, [students, search, activeFilter, votedFilter, classFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const visiblePage = Math.min(currentPage, totalPages);
    const paginatedStudents = filtered.slice(
        (visiblePage - 1) * PAGE_SIZE,
        visiblePage * PAGE_SIZE
    );

    const clearFilters = () => {
        setSearch('');
        setActiveFilter('all');
        setVotedFilter('all');
        setClassFilter('');
        setCurrentPage(1);
    };

    return {
        search,
        setSearch,
        activeFilter,
        setActiveFilter,
        votedFilter,
        setVotedFilter,
        classFilter,
        setClassFilter,
        currentPage,
        setCurrentPage,
        classes,
        filtered,
        hasFilters: Boolean(search || activeFilter !== 'all' || votedFilter !== 'all' || classFilter),
        totalPages,
        visiblePage,
        paginatedStudents,
        clearFilters,
    };
}
