import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {AxiosResponse} from 'axios';
import api from '../apiClient';
import {getApiErrorDetail} from '../utils/apiErrors';
import {queryKeys} from './queryKeys';
import {showError, showSuccess} from '../utils/toast';

export interface Student {
    id: number;
    student_id: string;
    full_name: string;
    class_name: string;
    phone_number?: string;
    has_voted: boolean;
    is_active: boolean;
    election?: number | {
        id: number;
        name: string;
        year: number;
    };
}

type StudentsPage = {
    results?: Student[];
    next?: string | null;
};

export type ActivationOptionsResponse = {
    summary: {total: number; activated: number; voted: number; available: number};
    results: Student[];
};

export const useActivationStudentOptions = (
    electionId: number | null,
    search: string,
    options: {refetchInterval?: number | false; placeholderData?: any} = {},
) =>
    useQuery({
        queryKey: queryKeys.activationOptions(electionId, search),
        queryFn: async (): Promise<ActivationOptionsResponse> => {
            const response = await api.get<ActivationOptionsResponse>('api/students/activation-options/', {
                params: {election_id: electionId, search: search.trim() || undefined},
            });
            return response.data;
        },
        enabled: electionId !== null,
        staleTime: 5_000,
        refetchInterval: options.refetchInterval,
        placeholderData: options.placeholderData,
    });

export type StudentListResponse = {
    count: number;
    results: Student[];
    summary: {total: number; activated: number; voted: number};
    classes: string[];
};

export type StudentListParams = {
    page: number;
    search: string;
    active: 'all' | 'active' | 'inactive';
    voted: 'all' | 'voted' | 'not-voted';
    className: string;
};

export const getStudentElectionId = (student: Student) =>
    typeof student.election === 'number' ? student.election : student.election?.id;

export const fetchAllStudentsForElection = async (electionId: number): Promise<Student[]> => {
    const students: Student[] = [];
    let nextUrl: string | null = 'api/students/';
    let isFirstPage = true;

    while (nextUrl) {
        const response: AxiosResponse<StudentsPage | Student[]> = await api.get<StudentsPage | Student[]>(nextUrl, {
            ...(isFirstPage ? {params: {election_id: electionId}} : {}),
        });
        const data = response.data;
        if (Array.isArray(data)) {
            students.push(...data);
            break;
        }
        students.push(...(data.results ?? []));
        nextUrl = data.next ?? null;
        isFirstPage = false;
    }

    return students;
};

export const useStudentsPage = (electionId: number | null, params: StudentListParams) =>
    useQuery({
        queryKey: queryKeys.studentPage(electionId, params),
        queryFn: async (): Promise<StudentListResponse> => {
            const response = await api.get<StudentListResponse>('api/students/', {
                params: {
                    election_id: electionId,
                    page: params.page,
                    search: params.search.trim() || undefined,
                    active: params.active === 'all' ? undefined : params.active,
                    voted: params.voted === 'all' ? undefined : params.voted,
                    class_name: params.className || undefined,
                },
            });
            return response.data;
        },
        enabled: electionId !== null,
        placeholderData: (previousData, previousQuery) =>
            previousQuery?.queryKey[1] === electionId ? previousData : undefined,
        staleTime: 30 * 1000,
    });

export const useStudents = (
    electionId: number | null,
    options: {refetchInterval?: number | false} = {},
) =>
    useQuery({
        queryKey: queryKeys.students(electionId),
        queryFn: () => electionId === null ? Promise.resolve([]) : fetchAllStudentsForElection(electionId),
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
            phone_number?: string;
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
            phone_number?: string;
            election_id: number;
        }) => {
            const response = await api.patch(`api/students/${id}/`, {
                full_name: data.full_name,
                class_name: data.class_name,
                ...(data.phone_number ? {phone_number: data.phone_number} : {}),
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
        mutationFn: async (data: {file: File; election_id: number; action?: 'preview' | 'commit'}) => {
            const formData = new FormData();
            formData.append('file', data.file);
            formData.append('election_id', data.election_id.toString());
            formData.append('action', data.action ?? 'commit');

            const response = await api.post('api/students/bulk-upload/', formData, {
                headers: {'Content-Type': 'multipart/form-data'},
            });
            return response.data;
        },
        onSuccess: (data, variables) => {
            if (variables.action === 'commit') {
                showSuccess(data.detail || 'Voter import completed');
                queryClient.invalidateQueries({
                    queryKey: queryKeys.students(variables.election_id),
                });
            }
        },
        onError: (error: unknown) => {
            showError(getApiErrorDetail(error) ?? 'Voter import failed');
        },
    });
};
