import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../apiConfig';
import { queryKeys } from './queryKeys';
import { showSuccess } from '../utils/toast';

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

export const useActivateStudent = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ student_id, election_id }: { student_id: string; election_id: number }) => {
            const res = await api.post('api/students/activate/', { 
                student_id, 
                election_id,
                is_active: true 
            });
            return res.data;
        },

        // 1 Optimistic update
        onMutate: async ({ student_id, election_id }) => {
            await queryClient.cancelQueries({
                queryKey: queryKeys.students(election_id),
            });

            const previousStudents = queryClient.getQueryData<Student[]>(
                queryKeys.students(election_id)
            );

            queryClient.setQueryData<Student[]>(
                queryKeys.students(election_id),
                (old) => {
                    if (!old) return old;

                    return old.map((student) =>
                        student.student_id === student_id
                            ? { ...student, is_active: true }
                            : student
                    );
                }
            );

            return { previousStudents };
        },

        // 2️ Rollback on error
        onError: (_err: any, { election_id }, context) => {
            queryClient.setQueryData(
                queryKeys.students(election_id),
                context?.previousStudents
            );
            // Error is handled in the component with showError
        },

        // 3️ Confirm + background sync
        onSuccess: (_, { election_id }) => {
            showSuccess('Student activated successfully');

            queryClient.invalidateQueries({
                queryKey: queryKeys.students(election_id),
                refetchType: 'inactive',
            });

            // Also invalidate activations to update counts
            queryClient.invalidateQueries({
                queryKey: queryKeys.activations(election_id),
                refetchType: 'inactive',
            });
        },
    });
};
