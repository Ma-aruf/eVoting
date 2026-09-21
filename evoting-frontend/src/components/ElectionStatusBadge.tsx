import Badge from './ui/Badge';
import {electionStatusPresentation} from '../utils/electionLifecycle';

export default function ElectionStatusBadge({status}: {status: unknown}) {
    const presentation = electionStatusPresentation(status);
    return <Badge variant={presentation.variant}>{presentation.label}</Badge>;
}
