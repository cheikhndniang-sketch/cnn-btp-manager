interface LogoProps {
  size?: number;
  showText?: boolean;
  variant?: 'light' | 'dark';
}

/** Logo placeholder CSE Immobilier (charte cyan / bleu marine). */
export function Logo({ size = 40, showText = true, variant = 'dark' }: LogoProps) {
  const textColor = variant === 'light' ? 'text-white' : 'text-navy';
  return (
    <div className="flex items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Logo CSE Immobilier"
      >
        <rect width="48" height="48" rx="10" fill="#003366" />
        <path d="M12 32V20l12-7 12 7v12" stroke="#00AEEF" strokeWidth="3" strokeLinejoin="round" />
        <rect x="20" y="24" width="8" height="8" fill="#00AEEF" />
      </svg>
      {showText && (
        <div className={`leading-tight ${textColor}`}>
          <div className="font-bold text-sm">CSE Immobilier</div>
          <div className="text-xs opacity-70">CNN-BTPManager Pro</div>
        </div>
      )}
    </div>
  );
}
