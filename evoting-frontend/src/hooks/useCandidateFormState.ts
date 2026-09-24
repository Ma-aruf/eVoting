import {useState} from 'react';

export function useCandidateFormState() {
    const [studentId, setStudentId] = useState<number | null>(null);
    const [studentQuery, setStudentQuery] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [ballotNumber, setBallotNumber] = useState(0);

    const reset = () => {
        setStudentId(null);
        setStudentQuery('');
        setPhotoUrl('');
        setBallotNumber(0);
    };

    return {
        studentId,
        setStudentId,
        studentQuery,
        setStudentQuery,
        photoUrl,
        setPhotoUrl,
        ballotNumber,
        setBallotNumber,
        reset,
    };
}
