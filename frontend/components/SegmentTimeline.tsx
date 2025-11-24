'use client';

import { useMemo, useState } from 'react';

type Segment = {
  id: string;
  start: number;
  end: number;
};

type TransitionOption = {
  value: string;
  label: string;
};

const toSeconds = (value: number) => Number.isFinite(value) ? value : 0;

const formatClock = (value: number) => {
  const minutes = Math.floor(value / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const clamp = (value: number, max: number, min = 0) => Math.min(Math.max(value, min), max);

const buildSegment = (index: number, videoDuration: number, lastEnd: number | null = null): Segment => {
  const safeDuration = Math.max(videoDuration, 1);
  const startSeed = lastEnd !== null ? Math.min(lastEnd, safeDuration - 1) : 0;
  const endSeed = Math.min(startSeed + 15, safeDuration);
  return {
    id: `segment-${index}-${Date.now()}`,
    start: startSeed,
    end: endSeed
  };
};

const transitionOptions: Record<'free' | 'paid', TransitionOption[]> = {
  free: [{ value: 'fade', label: 'Fade (free tier)' }],
  paid: [
    { value: 'fade', label: 'Fade' },
    { value: 'fadeblack', label: 'Fade to black' },
    { value: 'crossfade', label: 'Crossfade' },
    { value: 'slide', label: 'Slide' },
    { value: 'zoom', label: 'Zoom' },
    { value: 'wipe', label: 'Wipe' },
    { value: 'cut', label: 'Cut' },
    { value: 'auto', label: 'Auto' }
  ]
};

const mapToPayload = (
  userId: string,
  youtubeId: string,
  segments: Segment[],
  transition: string,
  plan: 'free' | 'paid'
) => ({
  user_id: userId,
  youtube_id: youtubeId,
  plan,
  transition,
  segments: segments.map((segment, order) => ({
    start: segment.start,
    end: segment.end,
    position: order
  }))
});

export type SegmentTimelineProps = {
  userId: string;
  youtubeId: string;
  videoDuration: number;
  apiBaseUrl?: string;
};

export function SegmentTimeline({
  userId,
  youtubeId,
  videoDuration,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
}: SegmentTimelineProps) {
  const [segments, setSegments] = useState<Segment[]>([buildSegment(1, videoDuration)]);
  const [plan, setPlan] = useState<'free' | 'paid'>('free');
  const [transition, setTransition] = useState<string>('fade');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const availableTransitions = plan === 'paid' ? transitionOptions.paid : transitionOptions.free;

  const totalDuration = useMemo(
    () => segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0),
    [segments]
  );

  const handleUpdate = (id: string, field: 'start' | 'end', rawValue: number) => {
    setSegments(prev => {
      const max = videoDuration;
      return prev.map(segment => {
        if (segment.id !== id) return segment;
        const otherBound = field === 'start' ? segment.end : segment.start;
        const clamped = clamp(rawValue, max);
        if (field === 'start') {
          const safeStart = Math.min(clamped, max - 0.5);
          const nextEnd = Math.max(otherBound, safeStart + 0.5);
          return { ...segment, start: safeStart, end: clamp(nextEnd, max) };
        }
        const safeEnd = Math.max(clamped, otherBound + 0.5);
        return { ...segment, end: clamp(safeEnd, max) };
      });
    });
  };

  const addSegment = () => {
    setSegments(prev => {
      const last = prev.length ? prev[prev.length - 1] : null;
      return [...prev, buildSegment(prev.length + 1, videoDuration, last?.end ?? null)];
    });
  };

  const removeSegment = (id: string) => {
    setSegments(prev => prev.filter(segment => segment.id !== id));
  };

  const reorderSegment = (index: number, direction: 'up' | 'down') => {
    setSegments(prev => {
      const next = [...prev];
      const target = next[index];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (!next[swapIndex]) return prev;
      next[index] = next[swapIndex];
      next[swapIndex] = target;
      return next;
    });
  };

  const saveSegments = async () => {
    setIsSaving(true);
    setStatus(null);
    try {
      const response = await fetch(`${apiBaseUrl}/segments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(mapToPayload(userId, youtubeId, segments, transition, plan))
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to save segments');
      }

      setStatus('Segments saved to backend.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      setStatus(`Save failed: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="card" data-testid="timeline">
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0' }}>Timeline Editor</h2>
          <p className="meta">Drag markers or edit the numeric values to refine your sermon highlights.</p>
        </div>
        <div className="badge" aria-label="video-duration">Video length {formatClock(videoDuration)}</div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {segments.map((segment, index) => (
          <article className="segment-row" data-testid="segment-row" key={segment.id}>
            <div>
              <div className="badge" data-testid="segment-label">Segment {index + 1}</div>
              <p className="meta" data-testid="segment-duration">Duration {formatClock(segment.end - segment.start)}</p>
            </div>

            <div className="slider-wrapper">
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="meta">Start ({formatClock(segment.start)})</span>
                <input
                  type="range"
                  min={0}
                  max={videoDuration}
                  step={0.5}
                  value={segment.start}
                  onChange={event => handleUpdate(segment.id, 'start', toSeconds(Number(event.target.value)))}
                  aria-label={`Start slider for segment ${index + 1}`}
                />
                <input
                  type="number"
                  min={0}
                  max={videoDuration}
                  step={0.5}
                  value={segment.start}
                  onChange={event => handleUpdate(segment.id, 'start', toSeconds(Number(event.target.value)))}
                  aria-label={`Start input for segment ${index + 1}`}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span className="meta">End ({formatClock(segment.end)})</span>
                <input
                  type="range"
                  min={0}
                  max={videoDuration}
                  step={0.5}
                  value={segment.end}
                  onChange={event => handleUpdate(segment.id, 'end', toSeconds(Number(event.target.value)))}
                  aria-label={`End slider for segment ${index + 1}`}
                />
                <input
                  type="number"
                  min={0}
                  max={videoDuration}
                  step={0.5}
                  value={segment.end}
                  onChange={event => handleUpdate(segment.id, 'end', toSeconds(Number(event.target.value)))}
                  aria-label={`End input for segment ${index + 1}`}
                />
              </label>
            </div>

            <div className="segment-controls">
              <button
                type="button"
                className="button secondary"
                onClick={() => reorderSegment(index, 'up')}
                disabled={index === 0}
                aria-label={`Move segment ${index + 1} up`}
              >
                ▲
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => reorderSegment(index, 'down')}
                disabled={index === segments.length - 1}
                aria-label={`Move segment ${index + 1} down`}
              >
                ▼
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => removeSegment(segment.id)}
                aria-label={`Remove segment ${index + 1}`}
              >
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="flex-between" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="button secondary" type="button" onClick={addSegment} aria-label="Add segment">
            + Add segment
          </button>
          <span className="meta" data-testid="total-duration">Total clipped length {formatClock(totalDuration)}</span>
        </div>
        <div className="flex-between" style={{ gap: 10, alignItems: 'center' }}>
          <label className="meta" style={{ display: 'grid', gap: 4 }}>
            Plan
            <select
              value={plan}
              onChange={event => {
                const nextPlan = event.target.value as 'free' | 'paid';
                setPlan(nextPlan);
                const allowed = transitionOptions[nextPlan];
                if (!allowed.find(option => option.value === transition)) {
                  setTransition(allowed[0].value);
                }
              }}
              aria-label="Plan selector"
            >
              <option value="free">Free</option>
              <option value="paid">Paid</option>
            </select>
            <span className="meta">Paid unlocks all transitions and faster queueing.</span>
          </label>

          <label className="meta" style={{ display: 'grid', gap: 4 }}>
            Transition
            <select
              value={transition}
              onChange={event => setTransition(event.target.value)}
              aria-label="Transition selector"
            >
              {availableTransitions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="meta">
              {plan === 'free'
                ? 'Free tier supports fade-only transitions.'
                : 'Paid plan supports all transition styles.'}
            </span>
          </label>

          <button className="button" type="button" onClick={saveSegments} disabled={isSaving || segments.length === 0}>
            {isSaving ? 'Saving…' : 'Save segments'}
          </button>
        </div>
      </div>

      {status && (
        <p className="meta" data-testid="save-status" style={{ marginTop: 12 }}>
          {status}
        </p>
      )}
    </section>
  );
}

export default SegmentTimeline;
