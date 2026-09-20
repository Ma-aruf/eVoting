import {type FormEvent, useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {FiArrowRight, FiUser} from 'react-icons/fi';
import {useLocation, useNavigate} from 'react-router-dom';
import api from '../apiConfig.ts';
import AuthLayout from '../components/AuthLayout';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import FormField from '../components/ui/FormField';
import TextInput from '../components/ui/TextInput';
import {clearVoterSession} from '../api/voterApi';

type ApiError = { response?: { status?: number; data?: { detail?: string } } };

function getVoterLoginError(error: unknown) {
    const apiError = error as ApiError;
    const detail = apiError.response?.data?.detail;
    if (detail) return detail;
    if (apiError.response?.status === 403) return 'You are not activated to vote. Please contact the election committee.';
    if (apiError.response?.status === 409) return 'You have already voted.';
    if (apiError.response?.status === 429) return 'Too many attempts. Please wait a moment and try again.';
    return 'Failed to login. Please check your voter ID and try again.';
}

export default function StudentLoginPage() {
    const [studentId, setStudentId] = useState('');
    const [loading, setLoading] = useState(false);
    const location = useLocation();
    const [error, setError] = useState<string | null>(
        (location.state as { message?: string } | null)?.message ?? null
    );
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);
        setLoading(true);
        clearVoterSession();
        queryClient.removeQueries({queryKey: ['votingData']});
        try {
            const submittedStudentId = studentId.trim();
            const response = await api.post('api/voter/login/', {student_id: submittedStudentId});
            const {token, student, election} = response.data;

            sessionStorage.setItem('voter_token', token);
            sessionStorage.setItem('student_id', submittedStudentId);
            sessionStorage.setItem('student_name', student.full_name);
            sessionStorage.setItem('election_id', String(election.id));
            sessionStorage.setItem('election_name', election.name);
            sessionStorage.setItem('election_year', String(election.year));
            navigate('/vote');
        } catch (caughtError: unknown) {
            setError(getVoterLoginError(caughtError));
        } finally {
            setLoading(false);
        }
    };

    return <AuthLayout title="Voter Login" description="Enter your voter ID to access the election ballot."
    >
        <form onSubmit={handleSubmit} className="auth-form">
            {error && <Alert variant="error" title="Unable to continue">{error}</Alert>}
            <FormField id="student-id" label="Voter ID" required>
                <TextInput autoComplete="username" inputMode="text" value={studentId}
                           onChange={(event) => setStudentId(event.target.value.toUpperCase())}
                           placeholder="e.g. STU-001" required autoFocus/>
            </FormField>
            <Button type="submit" className="auth-submit" loading={loading} disabled={!studentId.trim()}
                    leadingIcon={<FiUser aria-hidden="true"/>} trailingIcon={<FiArrowRight aria-hidden="true"/>}>
                Enter voting portal
            </Button>
        </form>
    </AuthLayout>;
}
