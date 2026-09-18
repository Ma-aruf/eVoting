import {FiEdit2, FiTrash2} from 'react-icons/fi';
import Badge from './ui/Badge';
import IconButton from './ui/IconButton';
import type {Candidate} from '../queries/useCandidates';

type Props = {candidate: Candidate; studentId?: string; onEdit: (candidate: Candidate) => void; onDelete: (candidate: Candidate) => void};
export default function CandidateCard({candidate, studentId, onEdit, onDelete}: Props) {
    return <article className="rounded-lg border border-gray-200 bg-white p-4"><div className="flex gap-3">{candidate.photo_url ? <img src={candidate.photo_url} alt={`${candidate.student_name || 'Candidate'} photo`} className="h-14 w-14 rounded-md object-cover"/> : <div className="flex h-14 w-14 items-center justify-center rounded-md bg-gray-100 text-xs text-gray-500">No photo</div>}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h3 className="truncate text-sm font-medium text-gray-900">{candidate.student_name || 'Candidate'}</h3><p className="text-xs text-gray-500">{studentId || 'Voter ID unavailable'}</p></div><Badge variant="primary">Ballot {candidate.ballot_number}</Badge></div></div></div><div className="mt-3 flex justify-end gap-2"><IconButton label={`Edit ${candidate.student_name || 'candidate'}`} icon={<FiEdit2 aria-hidden="true"/>} onClick={() => onEdit(candidate)}/><IconButton label={`Delete ${candidate.student_name || 'candidate'}`} icon={<FiTrash2 aria-hidden="true"/>} variant="danger" onClick={() => onDelete(candidate)}/></div></article>;
}
