import {type FormEvent, useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {FiArrowRight, FiUser} from 'react-icons/fi';
import {useLocation, useNavigate} from 'react-router-dom';
import api from '../apiClient.ts';
import AuthLayout from '../components/AuthLayout';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import FormField from '../components/ui/FormField';
import TextInput from '../components/ui/TextInput';
import {clearVoterSession, saveVoterSession} from '../api/voterApi';
import type {VoterLoginResponse} from '../types/election';
import {voterLifecycleMessage, voterLifecycleMessageFromDetail} from '../utils/electionLifecycle';

type ApiError = { response?: { status?: number; data?: { detail?: string } } };

function getVoterLoginError(error: unknown) {
    const apiError = error as ApiError;
    const detail = apiError.response?.data?.detail?.trim().toLowerCase() ?? '';
    const lifecycleMessage = voterLifecycleMessageFromDetail(detail);
    if (lifecycleMessage) return lifecycleMessage;
    if (/^no active election at this time\.?$/.test(detail)) return 'Voting is not currently available. Please try again later.';
    if (detail.includes('ballot is not ready')) return 'Voting is not available yet. Please contact an election administrator.';
    if (detail.includes('already voted')) return 'You have already voted in this election.';
    if (apiError.response?.status === 403 && (detail.includes('activated') || detail.includes('inactive'))) return 'You have not been activated for this election.';
    if (apiError.response?.status === 409) return 'Your student ID is active in more than one election. Please select an election or contact an administrator.';
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
            const response = await api.post<VoterLoginResponse>('api/voter/login/', {student_id: submittedStudentId});
            const {can_vote_now: canVoteNow, election} = response.data;
            if (!canVoteNow || !election.voting_open || election.status !== 'open') {
                setError(voterLifecycleMessage(election.status));
                return;
            }
            saveVoterSession(response.data);
            navigate('/vote');
        } catch (caughtError: unknown) {
            setError(getVoterLoginError(caughtError));
        } finally {
            setLoading(false);
        }
    };

    return <AuthLayout title="Voter Login">
        <form onSubmit={handleSubmit} className="auth-form">
            {error && <Alert variant="error" title="Unable to continue">{error}</Alert>}
            <FormField id="student-id" label="Voter ID" required>
                <TextInput autoComplete="username" inputMode="text" value={studentId}
                           onChange={(event) => setStudentId(event.target.value.toUpperCase())}
                           placeholder="e.g. STU-001" required autoFocus/>
            </FormField>
            <Button type="submit" className="auth-submit" loading={loading} disabled={!studentId.trim()}
                    leadingIcon={<FiUser aria-hidden="true"/>}
                    trailingIcon={<FiArrowRight className="text-orange-300 h-4 w-5" varia-hidden="true"/>}>
                Enter voting portal
            </Button>
        </form>
    </AuthLayout>;
}
