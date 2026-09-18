import type {ReactNode} from 'react';

type PageHeaderProps = {title: string; description?: string; actions?: ReactNode};

export default function PageHeader({title, description, actions}: PageHeaderProps) {
    return <div className="page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-header-actions">{actions}</div>}</div>;
}
