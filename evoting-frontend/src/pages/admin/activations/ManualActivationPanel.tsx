import type {FormEventHandler, KeyboardEventHandler} from 'react';
import {FiUserPlus} from 'react-icons/fi';
import type {Student} from '../../../queries/useStudents';
import FormField from '../../../components/ui/FormField';
import TextInput from '../../../components/ui/TextInput';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Badge from '../../../components/ui/Badge';

type Props = {
    students: Student[];
    selectedStudent: Student | null;
    studentQuery: string;
    selectedStudentId: string;
    isOpen: boolean;
    activeOption: number;
    listboxId: string;
    availableStudentCount: number;
    hasElection: boolean;
    canActivateVoters: boolean;
    isPending: boolean;
    mutationError: string | null;
    onQueryChange: (value: string) => void;
    onOpenChange: (open: boolean) => void;
    onSearchKeyDown: KeyboardEventHandler<HTMLInputElement>;
    onChooseStudent: (student: Student) => void;
    onSubmit: FormEventHandler;
};

export default function ManualActivationPanel({
    students, selectedStudent, studentQuery, selectedStudentId, isOpen, activeOption,
    listboxId, availableStudentCount, hasElection, canActivateVoters, isPending, mutationError,
    onQueryChange, onOpenChange, onSearchKeyDown, onChooseStudent, onSubmit,
}: Props) {
    return (
        <section className="ui-section">
            <div className="ui-section-heading">
                <div className="mb-4">
                    <h2>Activate a voter</h2>
                    <p>Search by voter ID or name, select a result, and confirm activation.</p>
                </div>
            </div>
            <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <FormField id="activation-student" label="Voter">
                    <div className="relative">
                        <div className="relative">
                            <TextInput
                                className="pl-9"
                                value={studentQuery}
                                onChange={event => onQueryChange(event.target.value)}
                                onFocus={() => onOpenChange(true)}
                                onKeyDown={onSearchKeyDown}
                                placeholder="Search name or voter ID"
                                role="combobox"
                                aria-expanded={isOpen}
                                aria-controls={listboxId}
                                aria-autocomplete="list"
                                aria-activedescendant={isOpen && students[activeOption] ? 'activation-option-' + students[activeOption].id : undefined}
                                disabled={!availableStudentCount || !canActivateVoters}
                            />
                        </div>
                        {isOpen && canActivateVoters && (
                            <div id={listboxId} role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg">
                                {students.length ? students.map((student, index) => (
                                    <button
                                        id={'activation-option-' + student.id}
                                        key={student.id}
                                        type="button"
                                        role="option"
                                        aria-selected={index === activeOption}
                                        className={'block w-full rounded px-3 py-2 text-left text-sm ' + (index === activeOption ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-50')}
                                        onMouseDown={event => event.preventDefault()}
                                        onClick={() => onChooseStudent(student)}
                                    >
                                        <span className="font-medium">{student.full_name}</span>
                                        <span className="ml-2 text-xs text-gray-500">{student.student_id}{' - '}{student.class_name}</span>
                                    </button>
                                )) : (
                                    <p className="px-3 py-2 text-xs text-gray-500" role="status">No matching eligible voters.</p>
                                )}
                            </div>
                        )}
                    </div>
                </FormField>
                <Button
                    type="submit"
                    loading={isPending}
                    disabled={!selectedStudentId || !hasElection || !canActivateVoters}
                    leadingIcon={<FiUserPlus aria-hidden="true"/>}
                >Activate voter</Button>
            </form>
            {selectedStudent && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-gray-50 p-3">
                    <div>
                        <p className="text-sm font-medium">{selectedStudent.full_name}</p>
                        <p className="text-xs text-gray-500">{selectedStudent.student_id}{' - '}{selectedStudent.class_name}</p>
                    </div>
                    <div className="flex gap-2">
                        <Badge variant={selectedStudent.is_active ? 'success' : 'neutral'}>{selectedStudent.is_active ? 'Active' : 'Inactive'}</Badge>
                        <Badge variant={selectedStudent.has_voted ? 'primary' : 'neutral'}>{selectedStudent.has_voted ? 'Voted' : 'Not voted'}</Badge>
                    </div>
                </div>
            )}
            {mutationError && <Alert variant="error" title="Activation failed" className="mt-4">{mutationError}</Alert>}
        </section>
    );
}
