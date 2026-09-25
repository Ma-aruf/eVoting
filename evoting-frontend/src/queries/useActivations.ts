import {useMutation, useQueryClient} from '@tanstack/react-query';
import api from '../apiClient';
import {queryKeys} from './queryKeys';

export interface ActivationResponse {
    detail: string;
    voting_pin?: string | null;
}
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
        mutationFn: async ({student_id, election_id}: {student_id: string; election_id: number}) => {
            const response = await api.post('api/students/activate/', {
                student_id,
                election_id,
                is_active: true,
            });
            return response.data as ActivationResponse;
        },

        onMutate: async ({student_id, election_id}) => {
            await queryClient.cancelQueries({
                queryKey: queryKeys.students(election_id),
            });

            const previousStudents = queryClient.getQueryData<Student[]>(
                queryKeys.students(election_id),
            );

            queryClient.setQueryData<Student[]>(
                queryKeys.students(election_id),
                oldStudents => {
                    if (!oldStudents) return oldStudents;

                    return oldStudents.map(student =>
                        student.student_id === student_id
                            ? {...student, is_active: true}
                            : student,
                    );
                },
            );

            return {previousStudents};
        },

        onError: (_error: unknown, {election_id}, context) => {
            queryClient.setQueryData(
                queryKeys.students(election_id),
                context?.previousStudents,
            );
        },

        onSuccess: (_data, {election_id}) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.students(election_id),
                refetchType: 'inactive',
            });

            queryClient.invalidateQueries({
                queryKey: queryKeys.activations(election_id),
                refetchType: 'inactive',
            });
        },
    });
};
