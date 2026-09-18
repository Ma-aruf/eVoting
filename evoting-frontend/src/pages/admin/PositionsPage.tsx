import {type FormEvent, useEffect, useState} from 'react';
import {FiCalendar, FiEdit2, FiList, FiPlus, FiTrash2,} from 'react-icons/fi';

import ConfirmModal from '../../components/ConfirmModal';
import StatisticCard from '../../components/StatisticCard';

import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import FormField from '../../components/ui/FormField';
import IconButton from '../../components/ui/IconButton';
import LoadingState from '../../components/ui/LoadingState';
import Modal from '../../components/ui/Modal';
import SelectField from '../../components/ui/SelectField';
import TextInput from '../../components/ui/TextInput';

import {useConfirmModal} from '../../hooks/useConfirmModal';
import {type Election, useElections} from '../../queries/useElections';
import {
    type Position,
    useCreatePosition,
    useDeletePosition,
    usePositions,
    useUpdatePosition,
} from '../../queries/usePositions';

type ApiError = {
    response?: {
        data?: {
            detail?: string;
        };
    };
};

const EMPTY_ELECTIONS: Election[] = [];

function mutationMessage(error: unknown, fallback: string) {
    return (error as ApiError).response?.data?.detail || fallback;
}

export default function PositionsPage() {
    const [selectedElectionId, setSelectedElectionId] =
        useState<number | null>(null);

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [positionName, setPositionName] = useState('');
    const [displayOrder, setDisplayOrder] = useState('');

    const [editingPosition, setEditingPosition] =
        useState<Position | null>(null);

    const [editPositionName, setEditPositionName] = useState('');
    const [editDisplayOrder, setEditDisplayOrder] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const electionsQuery = useElections();
    const positionsQuery = usePositions(selectedElectionId);

    const createPosition = useCreatePosition();
    const updatePosition = useUpdatePosition();
    const deletePosition = useDeletePosition();

    const confirmModal = useConfirmModal();

    const elections = electionsQuery.data;
    const positions = positionsQuery.data ?? [];
    const electionList = elections ?? EMPTY_ELECTIONS;

    const selectedElection =
        electionList.find(
            election => election.id === selectedElectionId
        ) ?? null;

    // Select an election automatically

    useEffect(() => {
        if (electionList.length === 0 || selectedElectionId !== null) {
            return;
        }

        const target =
            electionList.find(election => election.is_active) ??
            electionList[0];

        const frame = requestAnimationFrame(() =>
            setSelectedElectionId(target.id)
        );

        return () => cancelAnimationFrame(frame);
    }, [electionList, selectedElectionId]);

    // Create position

    const resetCreateForm = () => {
        setPositionName('');
        setDisplayOrder('');
        setShowCreateForm(false);
    };

    const handleCreatePosition = (event: FormEvent) => {
        event.preventDefault();

        if (!selectedElectionId) return;

        createPosition.mutate(
            {
                name: positionName.trim(),
                display_order: parseInt(displayOrder, 10) || 1,
                election: selectedElectionId,
            },
            {
                onSuccess: resetCreateForm,
            }
        );
    };

    // Edit position

    const handleEditPosition = (position: Position) => {
        setEditingPosition(position);
        setEditPositionName(position.name);
        setEditDisplayOrder(String(position.display_order));
    };

    const handleUpdatePosition = (event: FormEvent) => {
        event.preventDefault();

        if (!editingPosition) return;

        updatePosition.mutate(
            {
                id: editingPosition.id,
                name: editPositionName.trim(),
                display_order: parseInt(editDisplayOrder, 10) || 1,
                election: editingPosition.election,
            },
            {
                onSuccess: () => {
                    setEditingPosition(null);
                    setEditPositionName('');
                    setEditDisplayOrder('');
                },
            }
        );
    };

    // Delete position

    const handleDeletePosition = async (position: Position) => {
        const confirmed = await confirmModal.confirm({
            title: 'Delete position',
            message: `Are you sure you want to delete "${position.name}"?`,
            confirmText: 'Delete',
            type: 'danger',
        });

        if (confirmed) {
            deletePosition.mutate(position);
        }
    };

    // Derived data

    const filteredPositions = positions.filter(
        position =>
            position.name
                .toLowerCase()
                .includes(searchTerm.toLowerCase()) ||
            String(position.display_order).includes(searchTerm.trim())
    );

    const mutationError = createPosition.isError
        ? createPosition.error
        : updatePosition.isError
            ? updatePosition.error
            : deletePosition.isError
                ? deletePosition.error
                : null;

    const mutationErrorMessage = createPosition.isError
        ? 'Position could not be created.'
        : updatePosition.isError
            ? 'Position could not be updated.'
            : 'Position could not be deleted.';

    const initialLoading =
        electionsQuery.isLoading ||
        (Boolean(selectedElectionId) && positionsQuery.isLoading);

    return (
        <>
            <Button
                leadingIcon={<FiPlus aria-hidden="true"/>}
                onClick={() =>
                    setShowCreateForm(value => !value)
                }
                disabled={!selectedElectionId}
            >
                {showCreateForm ? 'Close form' : 'Add position'}
            </Button>

            {/* Mutation error */}

            {mutationError && (
                <Alert
                    variant="error"
                    title="Position change was not saved"
                >
                    {mutationMessage(
                        mutationError,
                        mutationErrorMessage
                    )}
                </Alert>
            )}

            {/* Position statistics */}

            <section
                className="management-stat-grid positions-stat-grid"
                aria-label="Position summary"
            >
                <StatisticCard
                    label="Positions"
                    value={positions.length}
                    status="primary"
                    layout="split"
                    icon={<FiList/>}
                />

                <StatisticCard
                    label="Elections"
                    value={electionList.length}
                    status="info"
                    layout="split"
                    icon={<FiCalendar/>}
                />

                <StatisticCard
                    label="Highest order"
                    value={positions.reduce(
                        (max, position) =>
                            Math.max(max, position.display_order || 0),
                        0
                    )}
                    status="accent"
                    layout="split"
                    icon={<FiList/>}
                />
            </section>

            {/* Position controls */}

            <section
                className="management-toolbar"
                aria-label="Position controls"
            >
                <FormField
                    id="position-election"
                    label="Election"
                >
                    <SelectField
                        value={selectedElectionId ?? ''}
                        onChange={event =>
                            setSelectedElectionId(
                                event.target.value
                                    ? Number(event.target.value)
                                    : null
                            )
                        }
                    >
                        <option value="">
                            Select election
                        </option>

                        {electionList.map(election => (
                            <option
                                key={election.id}
                                value={election.id}
                            >
                                {election.name} ({election.year})
                            </option>
                        ))}
                    </SelectField>
                </FormField>

                <FormField
                    id="position-search"
                    label="Search positions"
                >
                    <TextInput
                        value={searchTerm}
                        onChange={event =>
                            setSearchTerm(event.target.value)
                        }
                        placeholder="Search by name or order"
                    />
                </FormField>
            </section>

            {/* Create position modal */}

            <Modal
                open={showCreateForm}
                onClose={resetCreateForm}
                title="Add position"
                description="Add a position and set its order on the ballot."
                className="position-create-modal"
            >
                <p className="management-help">
                    Lower display-order numbers appear first on the ballot.
                </p>

                <form
                    onSubmit={handleCreatePosition}
                    className="management-form"
                >
                    <FormField
                        id="position-name"
                        label="Position name"
                        required
                    >
                        <TextInput
                            value={positionName}
                            onChange={event =>
                                setPositionName(event.target.value)
                            }
                            placeholder="e.g. President"
                            required
                        />
                    </FormField>

                    <FormField
                        id="display-order"
                        label="Display order"
                        required
                    >
                        <TextInput
                            type="number"
                            min={1}
                            value={displayOrder}
                            onChange={event =>
                                setDisplayOrder(event.target.value)
                            }
                            placeholder="1"
                            required
                        />
                    </FormField>

                    <div className="management-form-actions">
                        <Button
                            type="button"
                            variant="quiet"
                            onClick={resetCreateForm}
                        >
                            Cancel
                        </Button>

                        <Button
                            type="submit"
                            loading={createPosition.isPending}
                        >
                            Add position
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Edit position modal */}

            <Modal
                open={Boolean(editingPosition)}
                onClose={() => setEditingPosition(null)}
                title={editingPosition ? `Edit ${editingPosition.name}` : 'Edit position'}
                description="Update the position name or ballot order."
                className="position-edit-modal"
            >
                <form
                    onSubmit={handleUpdatePosition}
                    className="management-form"
                >
                    <FormField
                        id="edit-position-name"
                        label="Position name"
                        required
                    >
                        <TextInput
                            value={editPositionName}
                            onChange={event =>
                                setEditPositionName(event.target.value)
                            }
                            required
                        />
                    </FormField>

                    <FormField
                        id="edit-display-order"
                        label="Display order"
                        required
                    >
                        <TextInput
                            type="number"
                            min={1}
                            value={editDisplayOrder}
                            onChange={event =>
                                setEditDisplayOrder(event.target.value)
                            }
                            required
                        />
                    </FormField>

                    <div className="management-form-actions">
                        <Button
                            type="button"
                            variant="quiet"
                            onClick={() => setEditingPosition(null)}
                        >
                            Cancel
                        </Button>

                        <Button
                            type="submit"
                            loading={updatePosition.isPending}
                        >
                            Update position
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Position register */}

            <section
                className="management-panel"
                aria-labelledby="positions-heading"
            >
                <div className="management-panel-heading">
                    <div>
                        <p className="dashboard-kicker">
                            Ballot positions
                        </p>

                        <h2 id="positions-heading">
                            {selectedElection
                                ? `Positions for ${selectedElection.name}`
                                : 'Positions'}
                        </h2>
                    </div>

                    {selectedElection && (
                        <Badge variant="primary">
                            {selectedElection.year}
                        </Badge>
                    )}
                </div>

                {/* Loading, error and empty states */}

                {initialLoading ? (
                    <LoadingState
                        title="Loading positions"
                        inline
                    />
                ) : electionsQuery.isError || positionsQuery.isError ? (
                    <ErrorState
                        title="Positions unavailable"
                        message="We could not load positions for this election."
                        action={
                            <Button
                                variant="secondary"
                                size="compact"
                                onClick={() => {
                                    void electionsQuery.refetch();
                                    void positionsQuery.refetch();
                                }}
                            >
                                Try again
                            </Button>
                        }
                    />
                ) : !selectedElection ? (
                    <EmptyState
                        title="Select an election"
                        message="Choose an election above to view and configure its positions."
                        icon={<FiCalendar/>}
                    />
                ) : filteredPositions.length === 0 ? (
                    <EmptyState
                        title={
                            searchTerm
                                ? 'No matching positions'
                                : 'No positions yet'
                        }
                        message={
                            searchTerm
                                ? 'Try a different search term.'
                                : 'Add the first position for this election to define the ballot order.'
                        }
                        icon={<FiList/>}
                    />
                ) : (
                    <div className="management-table-wrap">
                        <table className="management-table">
                            <caption className="sr-only">
                                Positions for {selectedElection.name}
                            </caption>

                            <thead>
                            <tr>
                                <th scope="col">
                                    Position
                                </th>

                                <th scope="col">
                                    Display order
                                </th>

                                <th scope="col" className="!text-right">
                                    Actions
                                </th>
                            </tr>
                            </thead>

                            <tbody>
                            {filteredPositions.map(position => (
                                <tr key={position.id}>
                                    <td data-label="Position">
                                        {position.name}
                                    </td>

                                    <td data-label="Display order">
                                        {position.display_order}
                                    </td>

                                    <td data-label="Actions">
                                        <div className="management-row-actions justify-end">
                                            <IconButton
                                                label={`Edit ${position.name}`}
                                                size="compact"
                                                variant="quiet"
                                                icon={
                                                    <FiEdit2
                                                        aria-hidden="true"
                                                    />
                                                }
                                                onClick={() =>
                                                    handleEditPosition(
                                                        position
                                                    )
                                                }
                                            />

                                            <IconButton
                                                label={`Delete ${position.name}`}
                                                size="compact"
                                                variant="danger"
                                                icon={
                                                    <FiTrash2
                                                        aria-hidden="true"
                                                    />
                                                }
                                                onClick={() =>
                                                    void handleDeletePosition(
                                                        position
                                                    )
                                                }
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Confirmation modal */}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={confirmModal.handleClose}
                onConfirm={confirmModal.handleConfirm}
                title={confirmModal.options.title}
                message={confirmModal.options.message}
                confirmText={confirmModal.options.confirmText}
                cancelText={confirmModal.options.cancelText}
                type={confirmModal.options.type}
            />
        </>
    );
}
