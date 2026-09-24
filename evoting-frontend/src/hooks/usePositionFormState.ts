import {useState} from 'react';

export function usePositionFormState() {
    const [name, setName] = useState('');
    const [displayOrder, setDisplayOrder] = useState('');

    const reset = () => {
        setName('');
        setDisplayOrder('');
    };

    return {
        name,
        setName,
        displayOrder,
        setDisplayOrder,
        reset,
    };
}
