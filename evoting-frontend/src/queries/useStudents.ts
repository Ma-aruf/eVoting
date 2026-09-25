import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import api from '../apiClient';
import {getApiErrorDetail} from '../utils/apiErrors';
import {queryKeys} from './queryKeys';
import {showError, showSuccess} from '../utils/toast';

export interface Student {
    id: number;
    student_id: string;
    full_name: string;
    class_name: string;
    has_voted: boolean;
    is_active: boolean;
    election?: number | {
        id: number;
        name: string;
        year: number;
    };
}

export const getStudentElectionId = (student: Student) =>
    typeof student.election === 'number' ? student.election : student.election?.id;

export const useStudents = (
    electionId: number | null,
    options: {refetchInterval?: number | false} = {},
) =>
    useQuery({
        queryKey: queryKeys.students(electionId),
        queryFn: async (): Promise<Student[]> => {
            const response = await api.get('api/students/', {
                params: electionId ? {election_id: electionId} : {},
            });
            const data = response.data;

            if (Array.isArray(data)) {
                return data;
            }

            return Array.isArray(data.results) ? data.results : [];
        },
        enabled: electionId !== null,
        staleTime: 30 * 1000,
        refetchInterval: options.refetchInterval,
    });

export const useCreateStudent = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            student_id: string;
            full_name: string;
            class_name: string;
            election_id: number;
        }) => {
            const response = await api.post('api/students/', data);
            return response.data;
        },
        onSuccess: (_, variables) => {
            showSuccess('Voter added successfully.');
            queryClient.invalidateQueries({
                queryKey: queryKeys.students(variables.election_id),
            });
        },
        onError: (error: unknown) => {
            showError(
                getApiErrorDetail(error) ??
                    'Failed to add voter. Make sure the ID is unique within this election.',
            );
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
            const response = await api.patch(`api/students/${id}/`, {
                full_name: data.full_name,
                class_name: data.class_name,
            });
            return response.data;
        },
        onMutate: async variables => {
            await queryClient.cancelQueries({
                queryKey: queryKeys.students(variables.election_id),
            });

            const previousStudents = queryClient.getQueryData<Student[]>(
                queryKeys.students(variables.election_id),
            );

            queryClient.setQueryData<Student[]>(
                queryKeys.students(variables.election_id),
                students =>
                    students?.map(student =>
                        student.id === variables.id
                            ? {...student, ...variables}
                            : student,
                    ),
            );

            return {previousStudents};
        },
        onError: (error: unknown, variables, context) => {
            if (context?.previousStudents) {
                queryClient.setQueryData(
                    queryKeys.students(variables.election_id),
                    context.previousStudents,
                );
            }

            showError(getApiErrorDetail(error) ?? 'Failed to update voter.');
        },
        onSettled: (_data, _error, variables) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.students(variables.election_id),
            });
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
            queryClient.invalidateQueries({
                queryKey: queryKeys.students(getStudentElectionId(student) ?? null),
            });
        },
        onError: (error: unknown) => {
            const message = error instanceof Error
                ? error.message
                : getApiErrorDetail(error);

            showError(message ?? 'Failed to delete voter.');
        },
    });
};

export const useBulkUploadStudents = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {file: File; election_id: number}) => {
            const formData = new FormData();
            formData.append('file', data.file);
            formData.append('election_id', data.election_id.toString());

            const response = await api.post('api/students/bulk-upload/', formData, {
                headers: {'Content-Type': 'multipart/form-data'},
            });
            return response.data;
        },
        onSuccess: (data, variables) => {
            showSuccess(data.detail || 'Voter import completed');
            queryClient.invalidateQueries({
                queryKey: queryKeys.students(variables.election_id),
            });
        },
        onError: (error: unknown) => {
            showError(getApiErrorDetail(error) ?? 'Voter import failed');
        },
    });
};
