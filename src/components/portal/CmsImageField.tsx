'use client';
import {useState,useRef} from 'react';
import Image from 'next/image';

let activeUploads=0;
export type MediaAsset = {
  id: string;
  alt: string;
  status: string;
};

export interface CmsImageFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  media?: MediaAsset[];
  disabled?: boolean;
  path?: string;
  onBusyChange?: (busy: boolean) => void;
}

export function CmsImageField({
  label,
  value,
  onChange,
  media = [],
  disabled = false,
  path = '',
  onBusyChange
}: CmsImageFieldProps) {
  const [mode, setMode] = useState<'view' | 'upload' | 'library'>(value ? 'view' : 'upload');
  const [altText, setAltText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [previewError, setPreviewError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readyMedia = media.filter(m => m.status === 'ready');
  const selectedMedia = readyMedia.find(m => m.id === value);
  const previewUrl = value ? `/api/v1/teacher/website/media/${value}/preview` : null;

  async function handleFileUpload(file: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
      setError('Please select a JPEG, PNG, WebP or AVIF image.');
      return;
    }
    if (file.size > 5242880) {
      setError('Image must be under 5 MB in size.');
      return;
    }

    setUploading(true);
    window.dispatchEvent(new CustomEvent('educentre:media-busy',{detail:++activeUploads}));
    onBusyChange?.(true);
    setError('');
    const effectiveAlt = altText.trim() || `${label} image`;

    try {
      const response = await fetch('/api/v1/teacher/website/media/upload', {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'x-musa-ui': '1',
          'Idempotency-Key': crypto.randomUUID(),
          'x-media-id': crypto.randomUUID(),
          'x-media-alt': effectiveAlt
        },
        body: file
      });

      const body = await response.json();
      if (!response.ok || !body.success || typeof body.data?.id !== 'string') {
        throw new Error(body.error?.code ?? 'UPLOAD_FAILED');
      }

      onChange(body.data.id);
      window.dispatchEvent(new Event('educentre:media-uploaded'));
      setMode('view');
      setAltText('');
      setPreviewError(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError((err as Error).message || 'Failed to upload image.');
    } finally {
      setUploading(false);
      window.dispatchEvent(new CustomEvent('educentre:media-busy',{detail:--activeUploads}));
      onBusyChange?.(false);
    }
  }

  return (
    <div className="cms-image-field-root" aria-label={path || label}>
      <span className="cms-image-field-label">{label}</span>

      {/* VIEW STATE */}
      {value && mode === 'view' && (
        <div className="cms-image-preview-card">
          <div className="cms-image-thumb-wrap">
            {!previewError && previewUrl ? (
              <Image
                unoptimized
                src={previewUrl}
                alt={selectedMedia?.alt || label}
                width={160}
                height={120}
                className="cms-image-thumb"
                onError={() => setPreviewError(true)}
              />
            ) : (
              <div className="cms-image-thumb-fallback">
                <span>✦</span>
                <small>Image preview</small>
              </div>
            )}
          </div>
          <div className="cms-image-info">
            <strong>{selectedMedia?.alt || 'Attached image'}</strong>
            <small>{value.slice(0, 8)}… · Verified ready</small>
            <div className="cms-image-actions">
              <button
                type="button"
                className="portal-secondary"
                disabled={disabled}
                onClick={() => setMode('upload')}
              >
                Replace image
              </button>
              <button
                type="button"
                className="portal-secondary cms-btn-remove"
                disabled={disabled}
                onClick={() => {
                  onChange('');
                  setMode('upload');
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD / LIBRARY PICKER MODES */}
      {(!value || mode !== 'view') && (
        <div className="cms-image-picker-panel">
          <div className="cms-image-picker-tabs">
            <button
              type="button"
              className={mode === 'upload' ? 'active' : ''}
              onClick={() => setMode('upload')}
            >
              Upload file
            </button>
            {readyMedia.length > 0 && (
              <button
                type="button"
                className={mode === 'library' ? 'active' : ''}
                onClick={() => setMode('library')}
              >
                From library ({readyMedia.length})
              </button>
            )}
            {value && (
              <button
                type="button"
                className="cms-tab-cancel"
                onClick={() => setMode('view')}
              >
                Cancel
              </button>
            )}
          </div>

          {error && <p className="portal-alert" role="alert">{error}</p>}

          {mode === 'upload' && (
            <div className="cms-image-upload-box">
              <label className="cms-file-input-label">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  disabled={disabled || uploading}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) void handleFileUpload(file);
                  }}
                />
                <span className="cms-file-cta">
                  {uploading ? (
                    <span className="portal-spinner" />
                  ) : (
                    <span>📁 Click to choose an image (up to 5MB)</span>
                  )}
                </span>
              </label>
              <label className="cms-alt-label">
                <span>Description / Alt text (optional)</span>
                <input
                  type="text"
                  maxLength={160}
                  value={altText}
                  placeholder={`Description for ${label.toLowerCase()}…`}
                  disabled={disabled || uploading}
                  onChange={e => setAltText(e.target.value)}
                />
              </label>
            </div>
          )}

          {mode === 'library' && (
            <div className="cms-image-library-box">
              <select
                aria-label={`Select ${label} from library`}
                value={value}
                disabled={disabled}
                onChange={e => {
                  if (e.target.value) {
                    onChange(e.target.value);
                    setMode('view');
                  }
                }}
              >
                <option value="">Select an existing image…</option>
                {readyMedia.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.alt || `Image ${m.id.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
