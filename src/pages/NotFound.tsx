import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export function NotFound() {
  return (
    <EmptyState title="This page doesn't exist" action={<Link to="/" className="font-semibold text-accent underline">Go to overview</Link>}>
      Check the address, or use the navigation to find what you need.
    </EmptyState>
  );
}
