import JobPreviewPanel from '../components/JobPreviewPanel';
import PublishForm from '../components/PublishForm';
import SegmentTimeline from '../components/SegmentTimeline';

const sampleVideoDuration = 780; // 13 minutes

export default function Page() {
  return (
    <main>
      <header style={{ marginBottom: 18 }}>
        <p className="badge">Module 7.2 · YouTube Upload</p>
        <h1 style={{ margin: '6px 0 8px 0' }}>Finalize and publish your highlight</h1>
        <p className="meta">Drag handles to adjust start/end markers, monitor the job preview, then queue a YouTube upload with custom metadata.</p>
      </header>

      <div style={{ display: 'grid', gap: 16 }}>
        <SegmentTimeline
          userId="demo-user"
          youtubeId="demo-video-id"
          videoDuration={sampleVideoDuration}
        />
        <JobPreviewPanel jobId="demo-job-id" />
        <PublishForm userId="demo-user" jobId="demo-job-id" apiBaseUrl="" />
      </div>
    </main>
  );
}
