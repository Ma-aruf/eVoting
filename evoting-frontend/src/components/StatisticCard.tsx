
import type {ReactNode} from 'react';

type StatisticCardProps = {
    label: string;
    value: ReactNode;
    icon?: ReactNode;
    status?:
        | 'neutral'
        | 'primary'
        | 'success'
        | 'warning'
        | 'error'
        | 'strong'
        | 'info'
        | 'accent';
    layout?: 'default' | 'split';
    loading?: boolean;
};

export default function StatisticCard({
    label,
    value,
    icon,
    status = 'neutral',
    layout = 'default',
    loading = false,
}: StatisticCardProps) {
    const content = (
        <div className="statistic-card-content">
            <div className="statistic-card-heading">
                <span className="statistic-card-label">
                    {label}
                </span>
            </div>

            {loading ? (
                <div
                    className="statistic-card-skeleton"
                    aria-label={`Loading ${label}`}
                />
            ) : (
                <strong className="statistic-card-value">
                    {value}
                </strong>
            )}

        </div>
    );

    return (
        <article
            className={
                'statistic-card statistic-card--' +
                status +
                (layout === 'split' ? ' statistic-card--split' : '')
            }
            aria-busy={loading || undefined}
        >
            {layout === 'split' ? (
                <>
                    <span
                        className="statistic-card-icon"
                        aria-hidden="true"
                    >
                        {icon}
                    </span>

                    {content}
                </>
            ) : (
                <>
                    <div className="statistic-card-heading">
                        <span className="statistic-card-label">
                            {label}
                        </span>

                        {icon && (
                            <span
                                className="statistic-card-icon"
                                aria-hidden="true"
                            >
                                {icon}
                            </span>
                        )}
                    </div>

                    {loading ? (
                        <div
                            className="statistic-card-skeleton"
                            aria-label={`Loading ${label}`}
                        />
                    ) : (
                        <strong className="statistic-card-value">
                            {value}
                        </strong>
                    )}

                </>
            )}
        </article>
    );
}
