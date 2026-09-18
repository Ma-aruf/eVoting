type LoadingSkeletonProps = {lines?: number; className?: string};
export default function LoadingSkeleton({lines = 3, className = ''}: LoadingSkeletonProps) {
    return <div className={'ui-skeleton-group' + (className ? ' ' + className : '')} aria-hidden="true">{Array.from({length: lines}, (_, index) => <div key={index} className="ui-skeleton-line"/>)}</div>;
}
