'use client';

import React, { useState } from 'react';

interface PublishFormProps {
  jobId: string;
  userId: string;
  apiBaseUrl?: string;
}

const PublishForm: React.FC<PublishFormProps> = ({ jobId, userId, apiBaseUrl = '' }) => {
  const [title, setTitle] = useState('Sunday Highlight');
  const [description, setDescription] = useState('A highlight from this week\'s sermon.');
  const [tags, setTags] = useState('sermon, faith, hope');
  const [privacyStatus, setPrivacyStatus] = useState<'public' | 'unlisted' | 'private'>('unlisted');
  const [plan, setPlan] = useState<'free' | 'paid'>('free');
  const [shortsMode, setShortsMode] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatusMessage('');
    setErrorMessage('');

    const payload = {
      user_id: userId,
      job_id: jobId,
      title,
      description,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      privacy_status: privacyStatus,
      plan,
      shorts_mode: shortsMode,
    };

    const response = await fetch(`${apiBaseUrl}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))).detail || 'Unable to queue upload';
      setErrorMessage(detail);
      return;
    }

    const data = await response.json();
    setStatusMessage(`Queued YouTube upload for job ${data.job_id}`);
  };

  return (
    <section className="card">
      <p className="badge">Module 7.2 · YouTube Upload</p>
      <h2>Publish to YouTube</h2>
      <p className="meta">Authorize uploads, fill in metadata, and push the generated highlight to your channel.</p>

      <form onSubmit={handleSubmit} className="publish-form">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>

        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>

        <label>
          Tags (comma separated)
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>

        <label>
          Privacy
          <select value={privacyStatus} onChange={(e) => setPrivacyStatus(e.target.value as any)}>
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </label>

        <label>
          Plan
          <select value={plan} onChange={(event) => setPlan(event.target.value as 'free' | 'paid')}>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={shortsMode}
            onChange={(event) => setShortsMode(event.target.checked)}
          />
          Upload as Shorts (requires ≤ 60 seconds total)
        </label>

        <button type="submit">Queue Upload</button>
      </form>

      {statusMessage && <p className="status success">{statusMessage}</p>}
      {errorMessage && <p className="status error">{errorMessage}</p>}
    </section>
  );
};

export default PublishForm;
