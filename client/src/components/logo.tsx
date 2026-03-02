interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function Logo({ size = "md", showText = true }: LogoProps) {
  const sizeClasses = {
    sm: "w-8 h-8 text-sm",
    md: "w-10 h-10 text-base",
    lg: "w-16 h-16 text-2xl",
  };

  const textSize = {
    sm: "0.875rem",
    md: "1.125rem",
    lg: "1.875rem",
  };

  return (
    <div className="flex items-center gap-2.5" data-testid="logo-mvault">
      <div className={`${sizeClasses[size]} rounded-xl flex items-center justify-center font-bold bg-gradient-to-br from-amber-500 via-purple-500 to-cyan-500 shadow-lg shadow-purple-500/20`}>
        <span className="text-white drop-shadow-md" style={{ fontSize: 'inherit', fontFamily: 'var(--font-display)' }}>M</span>
      </div>
      {showText && (
        <span
          className="font-bold tracking-tight gradient-text"
          style={{ fontSize: textSize[size], fontFamily: 'var(--font-display)' }}
        >
          M-Vault
        </span>
      )}
    </div>
  );
}
