import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import api from '../apiConfig';
import {queryKeys} from './queryKeys';
import {showError, showSuccess} from '../utils/toast';

export interface Student {
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

export const useStudents = (electionId: number | null) => {
    return useQuery({
        queryKey: queryKeys.students(electionId),
        queryFn: async (): Promise<Student[]> => {
            const params = electionId ? {election_id: electionId} : {};
            const res = await api.get('api/students/', {params});
            const data = res.data;

            if (Array.isArray(data)) {
                return data;
            } else if (Array.isArray(data.results)) {
                return data.results;
            }
            return [];
        },
        enabled: !!electionId,
        staleTime: 30 * 1000, // 30 seconds
        placeholderData: (previousData) => previousData,
    });
};


export const useCreateStudent = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            student_id: string;
            full_name: string;
            class_name: string;
            election_id: number;
        }) => {
            const res = await api.post('api/students/', data);
            return res.data;
        },
        onSuccess: (_, variables) => {
            showSuccess('Voter added successfully.');
            queryClient.invalidateQueries({queryKey: queryKeys.students(variables.election_id)});
        },
        onError: (err: any) => {
            const detail = err.response?.data?.detail;
            showError(detail || 'Failed to add voter. Make sure the ID is unique within this election.');
        },
    });
};

export const useUpdateStudent = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({id, ...data}: {
            id: number;
            full_name: string;
            class_name: string;
            election_id: number;
        }) => {
            const res = await api.patch(`api/students/${id}/`, data);
            return res.data;
        },
        onMutate: async (variables) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({queryKey: queryKeys.students(variables.election_id)});
            
            // Snapshot the previous value
            const previousStudents = queryClient.getQueryData(queryKeys.students(variables.election_id));
            
            // Optimistically update the cache
            queryClient.setQueryData(queryKeys.students(variables.election_id), (old: Student[] | undefined) => {
                if (!old) return old;
                return old.map(student => 
                    student.id === variables.id 
                        ? {...student, ...variables}
                        : student
                );
            });
            
            return {previousStudents};
        },
        onError: (err, variables, context) => {
            // Rollback on error
            if (context?.previousStudents) {
                queryClient.setQueryData(queryKeys.students(variables.election_id), context.previousStudents);
            }
            const detail = (err as any).response?.data?.detail;
            showError(detail || 'Failed to update voter.');
        },
        onSettled: (_data, _error, variables) => {
            // Refetch to ensure server state
            queryClient.invalidateQueries({queryKey: queryKeys.students(variables.election_id)});
        },
        onSuccess: () => {
            showSuccess('Voter updated successfully.');
        },
    });
};

export const useDeleteStudent = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (student: Student) => {
            if (student.has_voted) {
                throw new Error('Cannot delete a student who has already voted.');
            }
            await api.delete(`api/students/${student.id}/`);
            return student;
        },
        onSuccess: (_data, student) => {
            showSuccess('Voter deleted successfully.');
            queryClient.invalidateQueries({queryKey: queryKeys.students(student.election?.id ?? null)});
        },
        onError: (err: any) => {
            if (err.message === 'Cannot delete a student who has already voted.') {
                showError(err.message);
            } else {
                const detail = err.response?.data?.detail;
                showError(detail || 'Failed to delete voter.');
            }
        },
    });
};

export const useBulkUploadStudents = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: { file: File; election_id: number }) => {
            const formData = new FormData();
            formData.append('file', data.file);
            formData.append('election_id', data.election_id.toString());

            const res = await api.post('api/students/bulk-upload/', formData, {
                headers: {'Content-Type': 'multipart/form-data'},
            });
            return res.data;
        },
        onSuccess: (data, variables) => {
            showSuccess(data.detail || 'Voter import completed');
            queryClient.invalidateQueries({queryKey: queryKeys.students(variables.election_id)});
        },
        onError: (err: any) => {
            showError(err.response?.data?.detail || 'Voter import failed');
        },
    });
};
