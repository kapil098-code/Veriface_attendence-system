import {useState} from 'react';

interface AvatarThumbProps {
  src: string | null | undefined;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function AvatarThumb({src, name, size = 'md'}: AvatarThumbProps) {
  const [failed, setFailed] = useState(false);

  const sizeClass =
    size === 'sm'
      ? 'h-8 w-8 text-xs'
      : size === 'lg'
        ? 'h-12 w-12 text-sm'
        : 'h-9 w-9 text-xs';

  if (!src || failed) {
    return (
      <div
        aria-label={name}
        className={`${sizeClass} shrink-0 rounded-md border border-slate-200 bg-slate-100 font-display font-semibold text-slate-700 flex items-center justify-center select-none`}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} shrink-0 rounded-md border border-slate-200 object-cover bg-slate-100`}
    />
  );
}
