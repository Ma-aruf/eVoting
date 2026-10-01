import type {ReactNode} from 'react';
import {FiEye, FiEyeOff, FiSend} from 'react-icons/fi';
import {BsFillGearFill, BsSendFill} from 'react-icons/bs';
import type {SmsVoterStatusRow} from '../../../queries/useSmsPins';
import Button from '../../../components/ui/Button';
import FormField from '../../../components/ui/FormField';
import TextInput from '../../../components/ui/TextInput';
import LoadingState from '../../../components/ui/LoadingState';
import EmptyState from '../../../components/ui/EmptyState';
import Alert from '../../../components/ui/Alert';
import {canGenerateSmsPinForVoter, canSendSmsToVoter, formatSmsDate, smsStatusLabels, smsVoterActionLabel} from './activationHelpers';

type Props = {
    rows: SmsVoterStatusRow[];
    isLoading: boolean;
    isError: boolean;
    hasSearch: boolean;
    canViewStatus: boolean;
    canShowSendButton: boolean;
    canSendPins: boolean;
    activationBlockMessage: string;
    isSendPending: boolean;
    isVisible: boolean;
    search: string;
    resendingStudentId: number | null;
    generatingStudentId: number | null;
    pagination: ReactNode;
    onToggleVisibility: () => void;
    onSearchChange: (value: string) => void;
    onSendAll: () => void;
    onResend: (row: SmsVoterStatusRow) => void;
    onGenerate: (row: SmsVoterStatusRow) => void;
    onInvalidate: (row: SmsVoterStatusRow) => void;
};

export default function SmsActivationPanel({
    rows, isLoading, isError, hasSearch, canViewStatus, canShowSendButton, canSendPins, activationBlockMessage, isSendPending, isVisible,
    search, resendingStudentId, generatingStudentId, pagination, onToggleVisibility,
    onSearchChange, onSendAll, onResend, onGenerate, onInvalidate,
}: Props) {
    return (
        <>
            <section className="ui-section">
                <div className="ui-section-heading">
                    <div className="mb-4">
                        <h2>Send voter PINs by SMS</h2>
                        <p>Send a fresh one-hour PIN to every eligible voter with a registered phone number. Voters will use their student ID and the PIN from the message to sign in.</p>
                    </div>
                    {canShowSendButton ? (
                        <Button type="button" leadingIcon={<FiSend aria-hidden="true"/>} loading={isSendPending} disabled={!canSendPins} title={!canSendPins ? (activationBlockMessage || 'SMS PIN delivery is not available for this election yet.') : undefined} onClick={onSendAll}>
                            Send PINs by SMS
                        </Button>
                    ) : (
                        <p className="text-sm text-gray-500">{activationBlockMessage || 'SMS PIN delivery is not available for this election yet.'}</p>
                    )}
                </div>
            </section>
            {canViewStatus && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
                    <Button type="button" variant="primary" size="compact" className="w-full sm:w-auto sm:flex-none" style={{minHeight: '44px'}} aria-expanded={isVisible} aria-controls="sms-voter-table-content" onClick={onToggleVisibility}>
                        <span className="flex items-center justify-center gap-2">
                            {isVisible ? <FiEyeOff size={18} className="shrink-0"/> : <FiEye size={18} className="shrink-0"/>}
                            {isVisible ? 'Hide voter status & recovery' : 'View voter status & recovery'}
                        </span>
                    </Button>
                    {isVisible && <div className="w-full min-w-0 sm:flex-1"><FormField id="sms-status-search" label="Search voters"><TextInput className="w-full" value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Search by voter ID, name, or phone"/></FormField></div>}
                </div>
            )}
            {canViewStatus && isVisible && (
                <section className="ui-section sms-delivery-status" id="sms-voter-table-content">
                    <div className="ui-section-heading"><h2>Voter status & recovery</h2></div>
                    {isLoading ? <LoadingState title="Loading SMS status" message="Fetching voter delivery records."/> :
                        isError ? <Alert variant="error" title="SMS status unavailable">We could not load the voter SMS records.</Alert> :
                            rows.length === 0 ? <EmptyState title={hasSearch ? 'No matching voters' : 'No voters to display'} message={hasSearch ? 'Try a different search term.' : 'Add voters to this election to track SMS delivery.'}/> : (
                                <div className="management-table-wrap sms-delivery-table-wrap">
                                    <table className="management-table sms-delivery-table">
                                        <caption className="sr-only">SMS delivery status by voter</caption>
                                        <thead><tr><th scope="col">S/N</th><th scope="col">Voter</th><th scope="col">Phone</th><th scope="col">SMS status</th><th scope="col">Last attempt</th><th scope="col">PIN expiry</th><th scope="col">Actions</th></tr></thead>
                                        <tbody>{rows.map((row, index) => (
                                            <tr key={index}>
                                                <td data-label="S/N">{index + 1}</td>
                                                <td data-label="Voter"><div className="management-table-cell--primary">{row.full_name}</div><div className="text-xs text-gray-500">{row.student_id}</div></td>
                                                <td data-label="Phone">{row.phone_number || '\u2014'}</td>
                                                <td data-label='SMS status'>{smsStatusLabels[row.status]}</td>
                                                <td data-label="Last attempt">{formatSmsDate(row.last_attempt_at)}</td>
                                                <td data-label="PIN expiry">{row.status === 'sent' || row.status === 'generated' ? `${formatSmsDate(row.pin_expires_at)}` : row.status === 'expired' ? formatSmsDate(row.pin_expires_at) : '\u2014'}</td>
                                                <td data-label='Actions'><div className='flex flex-wrap justify-end gap-2'>
                                                    {canSendSmsToVoter(row) && <Button type='button' variant='success' style={{width: '80px', minWidth: '60px', padding: '4px 1px', flexShrink: 0}} size='compact' loading={resendingStudentId === row.id} disabled={!canSendPins || resendingStudentId !== null || generatingStudentId !== null} onClick={() => onResend(row)}><div className="flex flex-row gap-1 items-center"><BsSendFill size={13}/>{smsVoterActionLabel(row)}</div></Button>}
                                                    {canGenerateSmsPinForVoter(row) && <Button type='button' variant='primary' style={{width: '80px', minWidth: '60px', padding: '4px 1px', flexShrink: 0}} size='compact' loading={generatingStudentId === row.id} disabled={!canSendPins || resendingStudentId !== null || generatingStudentId !== null} onClick={() => onGenerate(row)}><div className="flex flex-row gap-1 items-center"><BsFillGearFill size={13}/>Generate</div></Button>}
                                                    {(row.status === 'sent' || row.status === 'generated') && <Button type="button" variant="danger" size="compact" disabled={resendingStudentId !== null || generatingStudentId !== null} onClick={() => onInvalidate(row)}>Invalidate</Button>}
                                                    {!canSendSmsToVoter(row) && !canGenerateSmsPinForVoter(row) && row.status !== 'sent' && row.status !== 'generated' && <span className='text-xs text-gray-400'>\u2014</span>}
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
