import {useId, useMemo, useState, type KeyboardEvent} from 'react';
import {FiSearch} from 'react-icons/fi';
import TextInput from './ui/TextInput';
import FormField from './ui/FormField';
import type {Student} from '../queries/useStudents';

type Props = {students: Student[]; value: number | null; query: string; onChange: (query: string) => void; onSelect: (student: Student) => void; disabled?: boolean; id: string; label?: string};

export default function CandidateStudentCombobox({students, value, query, onChange, onSelect, disabled = false, id, label = 'Voter'}: Props) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const listboxId = useId();
    const options = useMemo(() => { const normalized = query.trim().toLowerCase(); return students.filter(student => !normalized || student.full_name.toLowerCase().includes(normalized) || student.student_id.toLowerCase().includes(normalized)).slice(0, 25); }, [query, students]);
    const selected = students.find(student => student.id === value);
    const choose = (student: Student) => { onSelect(student); setOpen(false); setActiveIndex(0); };
    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex(index => Math.min(index + 1, Math.max(options.length - 1, 0))); } if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActiveIndex(index => Math.max(index - 1, 0)); } if (event.key === 'Enter' && open && options[activeIndex]) { event.preventDefault(); choose(options[activeIndex]); } if (event.key === 'Escape') setOpen(false); };
    return <FormField id={id} label={label} helperText="Search by voter name or ID, then select a result." required><div className="relative"><div className="relative"><FiSearch className="pointer-events-none absolute left-3 top-3 text-gray-400" aria-hidden="true"/><TextInput className="pl-9" value={selected ? `${selected.full_name} (${selected.student_id})` : query} onChange={event => { onChange(event.target.value); setOpen(true); setActiveIndex(0); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown} placeholder="Search name or voter ID" disabled={disabled} role="combobox" aria-expanded={open} aria-controls={listboxId} aria-autocomplete="list" aria-activedescendant={open && options[activeIndex] ? `${listboxId}-option-${options[activeIndex].id}` : undefined}/></div>{open && !disabled && <div id={listboxId} role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg">{options.length ? options.map((student, index) => <button key={student.id} id={`${listboxId}-option-${student.id}`} type="button" role="option" aria-selected={student.id === value || index === activeIndex} className={`block w-full rounded px-3 py-2 text-left text-sm ${index === activeIndex ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-50'}`} onMouseDown={event => event.preventDefault()} onClick={() => choose(student)}><span className="font-medium">{student.full_name}</span><span className="ml-2 text-xs text-gray-500">{student.student_id} · {student.class_name}</span></button>) : <p className="px-3 py-2 text-xs text-gray-500" role="status">No matching voters.</p>}</div>}</div></FormField>;
}
