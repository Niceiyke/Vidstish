import { render, screen, waitFor } from '@testing-library/react';
import JobPreviewPanel from '../components/JobPreviewPanel';

describe('JobPreviewPanel', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches and displays job preview data', async () => {
    const payload = {
      job_id: 'job-123',
      video_id: 'video-1',
      youtube_id: 'yt-abc',
      transition: 'fade',
      duration_seconds: 95,
      preview_url: 'https://cdn.example.com/highlight.mp4',
      segments: [
        { id: 'seg-1', start: 1, end: 10, position: 0 },
        { id: 'seg-2', start: 12.5, end: 20, position: 1 }
      ]
    };

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 })
    );

    render(<JobPreviewPanel jobId="job-123" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/job/job-123'));

    expect(await screen.findByTestId('preview-video')).toBeInTheDocument();
    expect(screen.getByTestId('job-transition')).toHaveTextContent('fade');
    const segmentList = screen.getByTestId('segment-list');
    expect(segmentList.querySelectorAll('li')).toHaveLength(2);
  });

  it('surfaces errors when preview cannot load', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('Not found', { status: 404 }));

    render(<JobPreviewPanel jobId="missing-job" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to load job/i);
  });
});
