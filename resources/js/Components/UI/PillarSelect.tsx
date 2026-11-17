import React from 'react';
import { pillarLabel, usePillars } from '@/Components/UI/Semantics';
import { Select, SelectProps } from '@/Components/UI/Select';

/** Pilar select dari prop bersama `contentPillars`; `value="all"` menambahkan opsi filter "Semua". */
export const PillarSelect: React.FC<SelectProps> = ({ value, className, ...props }) => {
    const pillars = usePillars();

    return (
        <Select value={value} className={className} {...props}>
            {value === 'all' && <option value="all">Pilar: Semua</option>}
            {pillars.map((pillar) => (
                <option key={pillar.key} value={pillar.key}>
                    {pillarLabel(pillar.key, pillars)}
                </option>
            ))}
        </Select>
    );
};
