import {type FormEvent, useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {FiArrowRight, FiUser} from 'react-icons/fi';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
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
type VoterElectionEntry = {
    name: string;
    year: number;
    voter_login_mode: 'activator_id' | 'activator_pin' | 'sms_pin';
    status: string;
    voting_open: boolean;
};

function getVoterLoginError(error: unknown) {
    const apiError = error as ApiError;
    const detail = apiError.response?.data?.detail?.trim().toLowerCase() ?? '';

    const lifecycleMessage = voterLifecycleMessageFromDetail(detail);
    if (lifecycleMessage) return lifecycleMessage;

    if (detail.includes('student not found') || detail.includes('invalid student identifier')) {
        return 'We could not find that voter ID. Check the ID and try again.';
    }
    if (detail.includes('8-digit voter pin is required')) {
        return 'Enter the 8-digit PIN given to you by an election official.';
    }
    if (detail.includes('does not have a valid pin')) {
        return 'You do not have an active voter PIN. Please ask an election official to activate you.';
    }
    if (detail.includes('voting session has expired')) {
        return 'Your voting session has expired. Please ask an election official to reactivate you.';
    }
    if (detail.includes('expired')) {
        return 'Your voter PIN has expired. Please ask an election official to reactivate you.';
    }
    if (detail.includes('too many invalid pin attempts')) {
        return 'Too many incorrect PIN attempts. Please ask an election official to reactivate you.';
    }
    if (detail.includes('invalid voter pin')) {
        return 'Your PIN is incorrect. Check it and try again.';
    }
    if (detail.includes('already voted')) {
        return 'You have already voted in this election.';
    }
    if (apiError.response?.status === 403 && (detail.includes('activated') || detail.includes('inactive'))) {
        return 'You have not been activated for this election. Please ask an election official for access.';
    }
    if (detail.includes('ballot is not ready')) {
        return 'Voting is not available yet. Please contact an election administrator.';
    }
    if (/^no active election at this time\.?$/.test(detail)) {
        return 'Voting is not currently available. Please try again later.';
    }
    if (apiError.response?.status === 409) {
        return apiError.response?.data?.detail
            || 'We could not continue with this voter ID. Please contact an election official.';
    }
    if (apiError.response?.status === 429) {
        return 'Too many sign-in attempts. Please wait a moment and try again.';
    }

    return 'We could not sign you in. Check your voter ID and PIN and try again.';
}

export default function StudentLoginPage() {
    const {electionCode} = useParams<{electionCode?: string}>();
    const [studentId, setStudentId] = useState('');
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const location = useLocation();
    const [error, setError] = useState<string | null>(
        (location.state as { message?: string } | null)?.message ?? null
    );
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const electionEntryQuery = useQuery({
        queryKey: ['voter-election-entry', electionCode],
        queryFn: async () => {
            const response = await api.get<VoterElectionEntry>(
                `api/voter/elections/${electionCode}/`
            );
            return response.data;
        },
        enabled: Boolean(electionCode),
        retry: false,
    });

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);
        setLoading(true);
        clearVoterSession();
        queryClient.removeQueries({queryKey: ['votingData']});
        try {
            const submittedStudentId = studentId.trim();
            const response = await api.post<VoterLoginResponse>('api/voter/login/', {
                student_id: submittedStudentId,
                pin,
                ...(electionCode ? {election_code: electionCode} : {}),
            });
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

    const electionEntry = electionEntryQuery.data;
    const electionLabel = electionEntry
        ? `${electionEntry.name} - ${electionEntry.year}`
        : undefined;
    const requiresPin = electionEntry?.voter_login_mode !== 'activator_id';
    const pinLabel = electionEntry?.voter_login_mode === 'sms_pin'
        ? 'SMS PIN'
        : '8-digit voter PIN';

    return <AuthLayout title="Voter Login" eyebrow={electionLabel}>
        <form onSubmit={handleSubmit} className="auth-form">
            {(error || electionEntryQuery.isError) && (
                <Alert variant="error" title="Unable to continue">
                    {error || 'This election login link is not valid.'}
                </Alert>
            )}
            <FormField id="student-id" label="Voter ID" required>
                <TextInput autoComplete="username" inputMode="text" value={studentId}
                           onChange={(event) => setStudentId(event.target.value.toUpperCase())}
                           placeholder="e.g. STU-001" required autoFocus/>
            </FormField>
            {requiresPin && (
                <FormField id="voter-pin" label={pinLabel} required>
                    <TextInput autoComplete="one-time-code" inputMode="numeric" maxLength={8}
                               value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
                               placeholder={`Enter your ${pinLabel.toLowerCase()}`}/>
                </FormField>
            )}
            <Button type="submit" className="auth-submit" loading={loading}
                    disabled={!studentId.trim()}
                    leadingIcon={<FiUser aria-hidden="true"/>}
                    trailingIcon={<FiArrowRight className="text-orange-300 h-4 w-5" varia-hidden="true"/>}>
                Enter voting portal
            </Button>
        </form>
    </AuthLayout>;
}
