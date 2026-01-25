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
        mutationFn: async (student_id: string) => {
            const res = await api.post('api/students/activate/', { student_id, is_active: true });
            return res.data;
        },

        // 1 Optimistic update
        onMutate: async (student_id) => {
            await queryClient.cancelQueries({
                queryKey: queryKeys.students(null),
            });

            const previousStudents = queryClient.getQueryData<Student[]>(
                queryKeys.students(null)
            );

            queryClient.setQueryData<Student[]>(
                queryKeys.students(null),
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
        onError: (_err: any, _student_id, context) => {
            queryClient.setQueryData(
                queryKeys.students(null),
                context?.previousStudents
            );
            // Error is handled in the component with showError
        },

        // 3️ Confirm + background sync
        onSuccess: () => {
            showSuccess('Student activated successfully');

            queryClient.invalidateQueries({
                queryKey: queryKeys.students(null),
                refetchType: 'inactive',
            });

            // Also invalidate activations to update counts
            queryClient.invalidateQueries({
                queryKey: queryKeys.activations(null),
                refetchType: 'inactive',
            });
        },
    });
};
