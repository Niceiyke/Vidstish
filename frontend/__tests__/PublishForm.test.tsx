import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import PublishForm from '../components/PublishForm';

describe('PublishForm', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('submits trimmed metadata and shows success', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: 'job-1' }),
    });

    render(<PublishForm userId="user-1" jobId="job-1" apiBaseUrl="http://localhost:8000" />);

    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'New Highlight' } });
    fireEvent.change(screen.getByLabelText(/Tags/i), { target: { value: ' faith , hope , ' } });
    fireEvent.change(screen.getByLabelText(/Plan/i), { target: { value: 'paid' } });
    fireEvent.click(screen.getByLabelText(/Upload as Shorts/i));
    fireEvent.click(screen.getByRole('button', { name: /Queue Upload/i }));

    await waitFor(() => screen.getByText(/Queued YouTube upload/));

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/publish', expect.objectContaining({
      method: 'POST',
    }));

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.tags).toEqual(['faith', 'hope']);
    expect(body.title).toBe('New Highlight');
    expect(body.plan).toBe('paid');
    expect(body.shorts_mode).toBe(true);
  });

  it('shows an error when publish fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ detail: 'Authorization required' }),
    });

    render(<PublishForm userId="user-2" jobId="job-404" apiBaseUrl="" />);
    fireEvent.click(screen.getByRole('button', { name: /Queue Upload/i }));

    await waitFor(() => screen.getByText(/Authorization required/));
  });
});
