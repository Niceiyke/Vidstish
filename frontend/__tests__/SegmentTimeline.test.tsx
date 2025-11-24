import { act } from 'react-dom/test-utils';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SegmentTimeline from '../components/SegmentTimeline';

describe('SegmentTimeline', () => {
  it('allows adding and removing segments', async () => {
    const user = userEvent.setup();
    render(<SegmentTimeline videoId="video-1" videoDuration={120} />);

    expect(screen.getAllByTestId('segment-row')).toHaveLength(1);

    await act(async () => {
      await user.click(screen.getByLabelText('Add segment'));
    });
    expect(screen.getAllByTestId('segment-row')).toHaveLength(2);

    await act(async () => {
      await user.click(screen.getByLabelText('Remove segment 1'));
    });
    expect(screen.getAllByTestId('segment-row')).toHaveLength(1);
  });

  it('reorders segments with move buttons', async () => {
    const user = userEvent.setup();
    render(<SegmentTimeline videoId="video-1" videoDuration={200} />);

    await act(async () => {
      await user.click(screen.getByLabelText('Add segment'));
    });
    const beforeReorder = screen.getAllByLabelText(/Start input/).map(input => Number((input as HTMLInputElement).value));

    await act(async () => {
      await user.click(screen.getByLabelText('Move segment 1 down'));
    });
    const afterReorder = screen.getAllByLabelText(/Start input/).map(input => Number((input as HTMLInputElement).value));

    expect(afterReorder[0]).toBe(beforeReorder[1]);
    expect(afterReorder[1]).toBe(beforeReorder[0]);
  });

  it('updates duration labels when bounds change', async () => {
    const user = userEvent.setup();
    render(<SegmentTimeline videoId="video-1" videoDuration={300} />);

    const endInput = screen.getAllByLabelText(/End input/)[0] as HTMLInputElement;
    await act(async () => {
      fireEvent.change(endInput, { target: { value: '45' } });
    });

    const durationText = await screen.findByTestId('segment-duration');
    await waitFor(() => expect(durationText).toHaveTextContent('00:45'));
  });

  it('posts the segment list to the backend', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ clip_job_id: '123' }), { status: 200 })
    );

    render(<SegmentTimeline videoId="video-5" videoDuration={90} />);
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /save segments/i }));
    });

    const status = await screen.findByTestId('save-status');
    expect(status).toHaveTextContent('Segments saved');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/segments',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"transition":"fade"')
      })
    );

    fetchMock.mockRestore();
  });

  it('enforces fade-only transitions for free tier', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ clip_job_id: '123' }), { status: 200 })
    );

    render(<SegmentTimeline videoId="video-5" videoDuration={90} />);

    const transitionSelect = screen.getByLabelText('Transition selector') as HTMLSelectElement;
    expect(transitionSelect.options).toHaveLength(1);
    expect(transitionSelect.value).toBe('fade');
    expect(screen.getByText(/fade-only transitions/i)).toBeInTheDocument();

    await act(async () => {
      await fireEvent.change(transitionSelect, { target: { value: 'fade' } });
      await userEvent.click(screen.getByRole('button', { name: /save segments/i }));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, requestInit] = fetchMock.mock.calls[0];
    const body = (requestInit as RequestInit).body?.toString() || '';
    expect(body).toContain('"transition":"fade"');
    expect(body).toContain('"plan":"free"');

    fetchMock.mockRestore();
  });

  it('unlocks full transition list for paid users', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ clip_job_id: '123' }), { status: 200 })
    );

    render(<SegmentTimeline videoId="video-5" videoDuration={90} />);

    const planSelect = screen.getByLabelText('Plan selector');
    fireEvent.change(planSelect, { target: { value: 'paid' } });

    const transitionSelect = screen.getByLabelText('Transition selector') as HTMLSelectElement;
    expect(transitionSelect.options.length).toBeGreaterThan(1);

    fireEvent.change(transitionSelect, { target: { value: 'crossfade' } });
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /save segments/i }));
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = (requestInit as RequestInit).body?.toString() || '';
    expect(body).toContain('"plan":"paid"');
    expect(body).toContain('"transition":"crossfade"');

    fetchMock.mockRestore();
  });
});
