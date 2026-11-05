import React from 'react';
import {
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

/**
 * Shared accessible sensors for Kanban & Grid drag-and-drop:
 * - PointerSensor with 6px activation distance so normal clicks open sheets cleanly
 * - TouchSensor with 160ms press delay so mobile scrolling isn't hijacked
 * - KeyboardSensor with sortable coordinates for full keyboard accessibility
 */
export function useKanbanSensors() {
    return useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 6,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 160,
                tolerance: 6,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );
}

export interface DroppableColumnProps {
    id: string;
    className?: string;
    activeClassName?: string;
    children: React.ReactNode;
}

export const DroppableColumn: React.FC<DroppableColumnProps> = ({
    id,
    className,
    activeClassName = 'ring-2 ring-dashed ring-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]/35',
    children,
}) => {
    const { isOver, setNodeRef } = useDroppable({ id });

    return (
        <div
            id={id}
            ref={setNodeRef}
            className={cn(
                'transition-colors duration-150',
                className,
                isOver && activeClassName
            )}
        >
            {children}
        </div>
    );
};

export interface SortableCardItemProps {
    id: string;
    onClick?: () => void;
    className?: string;
    children: React.ReactNode;
}

export const SortableCardItem: React.FC<SortableCardItemProps> = ({
    id,
    onClick,
    className,
    children,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            id={id}
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            className={cn(
                'touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] rounded-3xl',
                isDragging ? 'opacity-35 z-20' : 'opacity-100',
                className
            )}
        >
            {children}
        </div>
    );
};
