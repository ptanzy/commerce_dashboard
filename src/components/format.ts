const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fraction = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatInteger = (value: number): string => integer.format(value);
export const formatPercentage = (value: number | null): string => value === null || !Number.isFinite(value) ? 'N/A' : `${fraction.format(value * 100)}%`;
export const formatDays = (value: number | null): string => value === null || !Number.isFinite(value) ? 'N/A' : `${fraction.format(value)} days`;
export const formatDate = (value: string | null): string => value ? value : 'Unknown';
