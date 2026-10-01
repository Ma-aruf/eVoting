import type {ReactNode} from 'react';
import {FiEye, FiEyeOff, FiPower} from 'react-icons/fi';
import {MdPersonOff} from 'react-icons/md';
import type {VoterRecoveryStatusRow} from '../../../queries/useSmsPins';
import Button from '../../../components/ui/Button';
import FormField from '../../../components/ui/FormField';
import TextInput from '../../../components/ui/TextInput';
import LoadingState from '../../../components/ui/LoadingState';
import EmptyState from '../../../components/ui/EmptyState';
import Alert from '../../../components/ui/Alert';
import {recoveryStateLabel} from './activationHelpers';

type Props = {
    rows: VoterRecoveryStatusRow[];
    isLoading: boolean;
    isError: boolean;
    hasSearch: boolean;
    isVisible: boolean;
    search: string;
    canActivateVoters: boolean;
    activationBlockMessage: string;
    activationPending: boolean;
    pagination: ReactNode;
    onToggleVisibility: () => void;
    onSearchChange: (value: string) => void;
    onActivate: (row: VoterRecoveryStatusRow) => void;
    onDisable: (row: VoterRecoveryStatusRow) => void;
};

export default function VoterRecoveryPanel({
    rows, isLoading, isError, hasSearch, isVisible, search, canActivateVoters,
    activationBlockMessage, activationPending, pagination, onToggleVisibility,
    onSearchChange, onActivate, onDisable,
}: Props) {
    return (
        <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
                <Button type="button" variant="primary" size="compact" style={{minHeight: "44px"}} aria-expanded={isVisible} aria-controls="voter-recovery-table-content" onClick={onToggleVisibility}>
                    <span className="flex items-center justify-center gap-2">
                        {isVisible ? <FiEyeOff size={20} className="shrink-0"/> : <FiEye size={20} className="shrink-0"/>}
                        {isVisible ? 'Hide voter status & recovery' : 'View voter status & recovery'}
                    </span>
                </Button>
                {isVisible && <div className="w-full min-w-0 sm:flex-1"><FormField id="recovery-voter-search" label="Search voters"><TextInput type="search" value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Search by student ID, name or phone number"/></FormField></div>}
            </div>
            {isVisible && (
                <section className="ui-section" aria-labelledby="voter-recovery-title" id="voter-recovery-table-content">
                    <div className="ui-section-heading"><h2 id="voter-recovery-title">Voter access and recovery</h2></div>
                    {isLoading ? <LoadingState title="Loading voter access" message="Checking current voter eligibility."/> :
                        isError ? <Alert variant="error" title="Voter access status unavailable">We could not load current login eligibility.</Alert> :
                            rows.length === 0 ? <EmptyState title={hasSearch ? 'No matching voters' : 'No voters to display'} message={hasSearch ? 'Try a different search term.' : 'Add voters to this election to review access.'}/> : (
                                <div className="management-table-wrap">
                                    <table className="management-table">
                                        <caption className="sr-only">Voter login eligibility and recovery actions</caption>
                                        <thead><tr><th scope="col">S/N</th><th scope="col">ID</th><th scope="col">Voter</th><th scope="col">Access status</th><th scope="col">Why</th><th scope="col">Actions</th></tr></thead>
                                        <tbody>{rows.map((row, index) => (
                                            <tr key={index}>
                                                <td data-label="S/N">{index + 1}</td>
                                                <td data-label="Voter ID">{row.student_id}</td>
                                                <td data-label="Voter">{row.full_name}</td>
                                                <td data-label="Access status">{recoveryStateLabel(row)}</td>
                                                <td data-label="Why">{row.reason}</td>
                                                <td data-label="Actions"><div className="flex flex-wrap justify-end gap-2">
                                                    {!row.is_active && !row.has_voted && <Button type="button" variant="primary" size="compact" style={{minWidth: '95px', minHeight: "30px"}} disabled={!canActivateVoters || activationPending} title={!canActivateVoters ? activationBlockMessage : undefined} onClick={() => onActivate(row)}><div className="flex justify-between items-center gap-2"><FiPower/>Activate</div></Button>}
                                                    {row.can_invalidate && <Button type="button" variant="danger" size="compact" style={{minWidth: '95px', minHeight: "30px"}} onClick={() => onDisable(row)}><div className="flex justify-between items-center gap-2"><MdPersonOff/>Disable</div></Button>}
                                                </div></td>
                                            </tr>
                                        ))}</tbody>
                                    </table>
                                    {pagination}
                                </div>
                            )}
                </section>
            )}
        </>
    );
}
