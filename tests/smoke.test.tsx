import App from '@/App';
import { makeHandlers } from '@/mocks/handlers';
import { server } from '@/mocks/server';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => server.resetHandlers());

describe('App smoke', () => {
  it('renders, lists empty, creates an annotation through MSW', async () => {
    server.use(...makeHandlers());
    render(<App />);
    expect(screen.getByText('lacing')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/none yet/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(screen.getByText(/words/)).toBeInTheDocument());
    expect(screen.queryByText(/none yet/)).not.toBeInTheDocument();
  });
});
