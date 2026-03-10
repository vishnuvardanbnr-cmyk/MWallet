interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function Logo({ size = "md", showText = true }: LogoProps) {
  const dims = { sm: 32, md: 40, lg: 64 };
  const textSize = { sm: "0.875rem", md: "1.125rem", lg: "1.875rem" };
  const d = dims[size];

  return (
    <div className="flex items-center gap-2.5" data-testid="logo-mvault">
      <svg
        width={d}
        height={d}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="35%" stopColor="#f0c040" />
            <stop offset="65%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#a07820" />
          </linearGradient>
          <linearGradient id="goldGradDark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c9a227" />
            <stop offset="100%" stopColor="#7a5c10" />
          </linearGradient>
          <filter id="goldGlow">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer shield / crest shape */}
        <path
          d="M32 2 L56 12 L56 36 C56 50 44 60 32 62 C20 60 8 50 8 36 L8 12 Z"
          fill="url(#goldGradDark)"
          opacity="0.9"
        />
        {/* Inner shield border */}
        <path
          d="M32 6 L52 15 L52 36 C52 48 42 57 32 59 C22 57 12 48 12 36 L12 15 Z"
          fill="#0d0a05"
          stroke="url(#goldGrad)"
          strokeWidth="0.8"
        />
        {/* Top ornament bar */}
        <rect x="22" y="14" width="20" height="1.5" rx="0.75" fill="url(#goldGrad)" opacity="0.7" />

        {/* Ornate M letter */}
        <g filter="url(#goldGlow)">
          <path
            d="M18 46 L18 22 L22 22 L32 36 L42 22 L46 22 L46 46 L42 46 L42 30 L33.5 42 L30.5 42 L22 30 L22 46 Z"
            fill="url(#goldGrad)"
          />
        </g>

        {/* Bottom ornament bar */}
        <rect x="22" y="48.5" width="20" height="1.5" rx="0.75" fill="url(#goldGrad)" opacity="0.7" />

        {/* Corner accents */}
        <circle cx="32" cy="11" r="1.5" fill="url(#goldGrad)" opacity="0.9" />
      </svg>

      {showText && (
        <div className="flex flex-col leading-none">
          <span
            className="font-bold tracking-widest gradient-text uppercase"
            style={{ fontSize: textSize[size], fontFamily: 'var(--font-display)', letterSpacing: '0.12em' }}
          >
            M-Vault
          </span>
          {size === "lg" && (
            <span
              className="text-[10px] tracking-[0.2em] uppercase"
              style={{ color: 'rgba(212,175,55,0.55)', fontFamily: 'var(--font-display)' }}
            >
              Secure · DeFi · Earn
            </span>
          )}
        </div>
      )}
    </div>
  );
}
