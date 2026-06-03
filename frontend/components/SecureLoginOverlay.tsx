'use client';

import StealthLogin from './StealthLogin';

interface SecureLoginOverlayProps {
  visible: boolean;
  onClose: () => void;
  onAuthorized: (code: string) => void;
}

export default function SecureLoginOverlay({ visible, onClose, onAuthorized }: SecureLoginOverlayProps) {
  if (!visible) return null;

  return (
    <div className="secure-overlay" onClick={onClose}>
      <div className="secure-panel" onClick={(event) => event.stopPropagation()}>
        <StealthLogin
          onAuthorized={(code) => {
            onAuthorized(code);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
