'use client';

import { useEffect, useState } from 'react';

type JobSegment = {
  id?: string;
  start: number;
  end: number;
  position: number;
};

type JobStatus = {
  job_id: string;
  video_id: string;
  youtube_id: string;
  transition: string;
  duration_seconds: number;
  preview_url?: string | null;
  segments: JobSegment[];
};

type JobPreviewPanelProps = {
  jobId: string;
  apiBaseUrl?: string;
};

const formatClock = (value: number) => {
  const minutes = Math.floor(value / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
};

export default function JobPreviewPanel({
  jobId,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
}: JobPreviewPanelProps) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchStatus = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${apiBaseUrl}/job/${jobId}`);
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || 'Failed to load job');
        }
        const payload = await response.json();
        setJob(payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load job';
        setError(`Failed to load job: ${message}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
  }, [apiBaseUrl, jobId]);

  const renderSegments = () => {
    if (!job?.segments?.length) {
      return <p className="meta">No segments saved yet.</p>;
    }

    return (
      <ol style={{ display: 'grid', gap: 8, margin: '0', paddingLeft: 18 }} data-testid="segment-list">
        {job.segments.map(segment => (
          <li key={segment.id ?? `${segment.position}-${segment.start}` } className="meta">
            Segment {segment.position + 1}: {formatClock(segment.start)} - {formatClock(segment.end)}
          </li>
        ))}
      </ol>
    );
  };

  return (
    <section className="card" data-testid="job-preview">
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <div>
          <p className="badge">Module 7.1 · Job Preview</p>
          <h2 style={{ margin: '4px 0 4px 0' }}>Preview assembled highlights</h2>
          <p className="meta">Inspect the requested transition, duration, and preview output for a clip job.</p>
        </div>
        <div className="badge" aria-label="job-duration">
          {job ? `Video length ${formatClock(job.duration_seconds)}` : 'Loading…'}
        </div>
      </div>

      {error && (
        <p className="meta" role="alert">
          {error}
        </p>
      )}

      {isLoading && !job && <p className="meta">Fetching job status…</p>}

      {job && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="player-shell" aria-label="preview-player">
            {job.preview_url ? (
              <video src={job.preview_url} controls style={{ width: '100%' }} data-testid="preview-video" />
            ) : (
              <div className="meta" data-testid="preview-placeholder">
                Preview not ready yet. We will show the highlight once processing finishes.
              </div>
            )}
          </div>

          <div className="meta" data-testid="job-transition">
            Transition: <strong>{job.transition}</strong>
          </div>

          <div style={{ display: 'grid', gap: 4 }}>
            <h3 style={{ margin: 0 }}>Segments</h3>
            {renderSegments()}
          </div>
        </div>
      )}
    </section>
  );
}
